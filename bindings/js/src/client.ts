/**
 * HTTP clients for ESPN and Polymarket, using the built-in global `fetch`
 * (Node 18+/24). These are the I/O layer: thin, retrying wrappers around the
 * public, keyless endpoints. They are NOT part of the conformance corpus —
 * only `resolve` is.
 *
 * Mirrors the Rust reference (`core-rs/src/client.rs`).
 */

import { data } from "./data.js";
import type { EspnGame, MapResult, PmEvent } from "./models.js";
import { parseEspnEvent, parsePmEvent } from "./parse.js";
import { resolve } from "./resolve.js";
import { candidateSlugs } from "./slug.js";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const GAMMA_BASE = "https://gamma-api.polymarket.com";
const USER_AGENT =
  "espn-polymarket-map/0.1 (+https://github.com/Swofty-Developments/ESPN-Polymarket-API)";

/** Network / decoding error raised by the clients. */
export class ClientError extends Error {
  readonly kind: "http" | "decode" | "unknown";
  constructor(kind: "http" | "decode" | "unknown", message: string) {
    super(`${kind} error: ${message}`);
    this.name = "ClientError";
    this.kind = kind;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/** GET a URL and parse JSON, retrying up to 3 times with backoff. */
async function getJson(url: string): Promise<unknown> {
  let last = "no attempt";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25_000);
      let resp: Response;
      try {
        resp = await fetch(url, {
          headers: { "user-agent": USER_AGENT, accept: "application/json" },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!resp.ok) {
        last = `status ${resp.status}`;
        await sleep(300 * (attempt + 1));
        continue;
      }
      const body = await resp.text();
      try {
        return JSON.parse(body) as unknown;
      } catch (e) {
        throw new ClientError("decode", (e as Error).message);
      }
    } catch (e) {
      if (e instanceof ClientError) throw e;
      last = (e as Error).message;
      await sleep(300 * (attempt + 1));
    }
  }
  throw new ClientError("http", last);
}

function urlencode(s: string): string {
  let out = "";
  for (const b of Buffer.from(s, "utf8")) {
    if (
      (b >= 0x41 && b <= 0x5a) || // A-Z
      (b >= 0x61 && b <= 0x7a) || // a-z
      (b >= 0x30 && b <= 0x39) || // 0-9
      b === 0x2d || // -
      b === 0x5f || // _
      b === 0x2e || // .
      b === 0x7e // ~
    ) {
      out += String.fromCharCode(b);
    } else {
      out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  return out;
}

/** ESPN site.api scoreboard client. */
export const EspnClient = {
  /** Today's scoreboard for a league key (e.g. `"nba"`, `"fifa.world"`). */
  async scoreboard(league: string): Promise<EspnGame[]> {
    return fetchScoreboard(league, null);
  },

  /** Scoreboard for a specific UTC date (`YYYYMMDD`). */
  async scoreboardOn(league: string, yyyymmdd: string): Promise<EspnGame[]> {
    return fetchScoreboard(league, yyyymmdd);
  },
};

async function fetchScoreboard(league: string, date: string | null): Promise<EspnGame[]> {
  const cfg = data().league(league);
  if (!cfg) throw new ClientError("unknown", `unknown league ${league}`);
  let url = `${ESPN_BASE}/${cfg.espn_path}/scoreboard`;
  if (date !== null) url += `?dates=${date}`;
  const json = await getJson(url);
  const events =
    typeof json === "object" && json !== null && Array.isArray((json as any).events)
      ? ((json as any).events as unknown[])
      : [];
  const games: EspnGame[] = [];
  for (const e of events) {
    // Athlete sports nest individual matches/fights: a UFC card has competitions[], a tennis
    // tournament has groupings[].competitions[]. Team sports are one game per event.
    const units = cfg.entity === "athlete" ? athleteCompetitions(e) : [e];
    for (const u of units) {
      const g = parseEspnEvent(u, league);
      if (g !== null) games.push(g);
    }
  }
  return games;
}

function athleteCompetitions(event: unknown): unknown[] {
  if (typeof event !== "object" || event === null) return [];
  const ev = event as any;
  const out: unknown[] = [];
  if (Array.isArray(ev.competitions)) out.push(...ev.competitions);
  if (Array.isArray(ev.groupings)) for (const g of ev.groupings) if (Array.isArray(g?.competitions)) out.push(...g.competitions);
  return out;
}

/** Polymarket gamma client. */
export const PolymarketClient = {
  /** Fetch an event by exact slug, if it exists. */
  async eventBySlug(slug: string): Promise<PmEvent | null> {
    const url = `${GAMMA_BASE}/events?slug=${slug}`;
    const json = await getJson(url);
    if (Array.isArray(json) && json.length > 0) {
      return parsePmEvent(json[0]);
    }
    return null;
  },

  /** Free-text search returning candidate events. */
  async search(query: string): Promise<PmEvent[]> {
    const url = `${GAMMA_BASE}/public-search?q=${urlencode(query)}&limit_per_type=10`;
    const json = await getJson(url);
    if (typeof json === "object" && json !== null && Array.isArray((json as any).events)) {
      return ((json as any).events as unknown[]).map(parsePmEvent);
    }
    return [];
  },
};

/**
 * End-to-end: given an ESPN game, find and resolve its Polymarket event.
 *
 * Tries each candidate slug, then falls back to search. Returns the first
 * `resolved` result, or the best unresolved attempt (so callers can classify
 * mapping gaps).
 */
export async function mapGame(game: EspnGame): Promise<MapResult> {
  const cfg = data().league(game.league);
  if (!cfg) throw new ClientError("unknown", `unknown league ${game.league}`);

  let last: MapResult | null = null;
  for (const slug of candidateSlugs(game)) {
    const ev = await PolymarketClient.eventBySlug(slug);
    if (ev !== null) {
      const r = resolve(game.league, game, ev);
      if (r.resolved) return r;
      last = r;
    }
  }

  const query = `${game.away.displayName} ${game.home.displayName}`;
  // Only a real game slug ({prefix}-{code}-{code}-{date}), never futures/props sharing the prefix.
  const gameSlug = new RegExp(`^${cfg.pm_prefix}-[a-z0-9]+-[a-z0-9]+-\\d{4}-\\d{2}-\\d{2}$`);
  try {
    const events = await PolymarketClient.search(query);
    for (const ev of events) {
      if (!gameSlug.test(ev.slug)) continue;
      const r = resolve(game.league, game, ev);
      if (r.resolved) return r;
      if (last === null) last = r;
    }
  } catch {
    // Search failure is non-fatal; fall through to the best attempt.
  }

  if (last !== null) return last;
  const empty: PmEvent = { slug: "", title: "", markets: [] };
  return resolve(game.league, game, empty);
}
