/**
 * Parsing raw ESPN scoreboard events and Polymarket gamma events into typed models.
 *
 * Mirrors the Rust reference (`core-rs/src/parse.rs`).
 */

import type { EspnGame, EspnSide, PmEvent, PmMarket } from "./models.js";

type Json = unknown;

function isObject(v: Json): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Read a string field, defaulting to "" (matches Rust `as_str().unwrap_or("")`). */
function s(v: Json, key: string): string {
  if (isObject(v)) {
    const val = v[key];
    if (typeof val === "string") return val;
  }
  return "";
}

/** Stringify a JSON value the way serde_json's `Value::to_string` does for non-strings. */
function valueToString(v: Json): string {
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

/**
 * Parse a Polymarket `outcomes`/`outcomePrices`/`clobTokenIds` field, which gamma
 * encodes as a JSON-string-of-array (e.g. `"[\"Yes\", \"No\"]"`). Also tolerates a
 * real array. Each element is coerced to a string verbatim.
 */
function stringArray(v: Json): string[] {
  if (typeof v === "string") {
    try {
      const arr = JSON.parse(v);
      if (Array.isArray(arr)) return arr.map(valueToString);
    } catch {
      return [];
    }
    return [];
  }
  if (Array.isArray(v)) return v.map(valueToString);
  return [];
}

/** Parse one ESPN scoreboard `event` object into an {@link EspnGame} for the given league. */
export function parseEspnEvent(json: Json, league: string): EspnGame | null {
  let comp: Json = json;
  if (isObject(json) && Array.isArray(json.competitions) && json.competitions.length > 0) {
    comp = json.competitions[0];
  }

  let kickoff = s(comp, "date");
  if (kickoff === "") kickoff = s(json, "date");

  const competitors = isObject(comp) ? comp.competitors : undefined;
  if (!Array.isArray(competitors)) return null;

  const sideOf = (homeAway: string): EspnSide | null => {
    const c = competitors.find((x) => s(x, "homeAway") === homeAway);
    if (c === undefined) return null;
    const team = isObject(c) && isObject(c.team) ? c.team : c;
    return {
      abbr: s(team, "abbreviation"),
      displayName: s(team, "displayName"),
      shortName: s(team, "shortDisplayName"),
      location: s(team, "location"),
      nickname: s(team, "name"),
    };
  };

  const home = sideOf("home");
  const away = sideOf("away");
  if (home === null || away === null) return null;

  return {
    league,
    espnEventId: s(json, "id"),
    kickoffUtc: kickoff,
    home,
    away,
  };
}

/** Parse a Polymarket gamma `event` object into a {@link PmEvent}. */
export function parsePmEvent(json: Json): PmEvent {
  let markets: PmMarket[] = [];
  if (isObject(json) && Array.isArray(json.markets)) {
    markets = json.markets.map((m): PmMarket => {
      const smt = isObject(m) ? m.sportsMarketType : undefined;
      return {
        slug: s(m, "slug"),
        question: s(m, "question"),
        groupItemTitle: s(m, "groupItemTitle"),
        sportsMarketType: typeof smt === "string" ? smt : null,
        outcomes: stringArray(isObject(m) ? m.outcomes : undefined),
        outcomePrices: stringArray(isObject(m) ? m.outcomePrices : undefined),
        clobTokenIds: stringArray(isObject(m) ? m.clobTokenIds : undefined),
      };
    });
  }

  return {
    slug: s(json, "slug"),
    title: s(json, "title"),
    markets,
  };
}
