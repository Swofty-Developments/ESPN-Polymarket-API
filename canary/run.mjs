#!/usr/bin/env node
// The live canary. Hits the REAL ESPN + Polymarket APIs (keyless/public), runs the mapping on
// today's games, classifies every result, and writes canary/dashboard/status.json.
//
//   node canary/run.mjs            # run, write status.json
//   node canary/run.mjs --strict   # additionally exit non-zero if any drift/gap is found
//
// It dogfoods the JS binding: the same `resolve` the library ships is what the canary trusts.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { classifyGame, aggregateLeague, aggregateOverall } from "./classify.mjs";
import {
  EspnClient,
  PolymarketClient,
  candidateSlugs,
  resolve as resolveGame,
} from "../bindings/js/dist/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const templates = JSON.parse(readFileSync(join(ROOT, "data/slug-templates.json"), "utf8"));
const STRICT = process.argv.includes("--strict");

const LEAGUE_LABELS = {
  nba: "NBA", mlb: "MLB", nhl: "NHL", nfl: "NFL", wnba: "WNBA",
  "college-football": "NCAA FB", "mens-college-basketball": "NCAA MBB",
  "fifa.world": "FIFA World Cup", "eng.1": "Premier League", "esp.1": "La Liga",
  "ger.1": "Bundesliga", "ita.1": "Serie A", "fra.1": "Ligue 1",
  "uefa.champions": "Champions League", "usa.1": "MLS",
};

// Run `fn` over `items` with bounded concurrency, preserving result order.
async function pool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// Is a Polymarket event's shape still parseable (the markets carry real outcome arrays)?
function shapeOk(event) {
  return (
    !!event &&
    Array.isArray(event.markets) &&
    event.markets.length > 0 &&
    event.markets.some((m) => Array.isArray(m.outcomes) && m.outcomes.length >= 2)
  );
}

async function findEvent(game) {
  for (const slug of candidateSlugs(game)) {
    try {
      const ev = await PolymarketClient.eventBySlug(slug);
      if (ev) return ev;
    } catch {}
  }
  try {
    const cfg = templates.leagues[game.league];
    // Only accept a real game slug ({prefix}-{code}-{code}-{date}), never futures/props
    // like "nfl-dailies-..." that merely share the prefix.
    const gameSlug = new RegExp(`^${cfg.pm_prefix}-[a-z0-9]+-[a-z0-9]+-\\d{4}-\\d{2}-\\d{2}$`);
    const events = await PolymarketClient.search(`${game.away.displayName ?? game.away.display_name ?? ""} ${game.home.displayName ?? game.home.display_name ?? ""}`);
    // Search can return a tangential game (shared team name); only accept one that actually
    // resolves to THIS matchup. A candidate-slug hit that fails to resolve is a real gap and
    // is reported; a search miss is just "unlisted".
    for (const ev of events || []) {
      if (typeof ev.slug === "string" && gameSlug.test(ev.slug) && resolveGame(game.league, game, ev).resolved) return ev;
    }
  } catch {}
  return null;
}

function legsWithToken(result) {
  return (result.outcomes || []).filter((o) => o.token_id && o.token_id.length > 0).length;
}

function proposedRow(game, result) {
  // Which side failed to resolve? Suggest a crosswalk row to fill the gap.
  const sides = [
    ["home", game.home],
    ["away", game.away],
  ];
  const matched = new Set((result.outcomes || []).map((o) => o.selection));
  const missing = sides.filter(([sel]) => !matched.has(sel));
  return missing.map(([sel, s]) => ({
    side: sel,
    espn_abbr: s.abbr,
    suggested: { espn: s.abbr, pm: (s.abbr || "").toLowerCase(), name: s.displayName ?? s.display_name, aliases: [] },
  }));
}

// Probe one game: find its Polymarket event, resolve, classify. Pure of shared state.
async function probeGame(league, game) {
  let event = null;
  try {
    event = await findEvent(game);
  } catch (e) {
    return { league, bucket: "unlisted", legs: 0, issue: { bucket: "outage", message: `Polymarket lookup failed for ${game.away.abbr}@${game.home.abbr}: ${String(e).slice(0, 120)}` } };
  }
  const result = event ? resolveGame(league, game, event) : null;
  const resolved = !!result?.resolved;
  const bucket = classifyGame({ eventFound: !!event, shapeOk: shapeOk(event), resolved });
  let issue = null;
  if (bucket === "drift") {
    issue = { bucket: "drift", message: `${league}: ${event.slug} shape changed (outcomes unparseable) — needs code change` };
  } else if (bucket === "gap") {
    const rows = proposedRow(game, result);
    issue = { bucket: "gap", message: `${league}: ${game.away.abbr}@${game.home.abbr} found ${event.slug} but didn't resolve; proposed: ${JSON.stringify(rows.map((r) => r.suggested))}` };
  }
  return { league, bucket, legs: resolved ? legsWithToken(result) : 0, issue };
}

async function run() {
  const cfgs = Object.entries(templates.leagues);

  // Fetch every scoreboard in parallel, then probe all games with bounded concurrency.
  const boards = await Promise.all(
    cfgs.map(async ([league]) => {
      try {
        return { league, games: await EspnClient.scoreboard(league), outage: false };
      } catch (e) {
        return { league, games: [], outage: true, err: String(e).slice(0, 140) };
      }
    })
  );
  const tasks = boards.flatMap((b) => b.games.map((game) => ({ league: b.league, game })));
  const probes = await pool(tasks, 12, (t) => probeGame(t.league, t.game));

  const leagues = {};
  const issues = [];
  for (const b of boards) {
    if (b.outage) issues.push({ bucket: "outage", message: `ESPN scoreboard for ${b.league} failed: ${b.err}` });
    const mine = probes.filter((p) => p.league === b.league);
    const agg = aggregateLeague(mine.map((p) => ({ bucket: p.bucket })), b.outage);
    leagues[b.league] = {
      label: LEAGUE_LABELS[b.league] || b.league,
      ...agg,
      legs_with_token: mine.reduce((a, p) => a + p.legs, 0),
      unlisted: mine.filter((p) => p.bucket === "unlisted").length,
    };
    for (const p of mine) if (p.issue) issues.push(p.issue);
  }

  const status = {
    generated_at: new Date().toISOString(),
    data_version: readFileSync(join(ROOT, "data/VERSION"), "utf8").trim(),
    status: aggregateOverall(leagues),
    leagues,
    issues,
  };

  const outPath = join(ROOT, "canary/dashboard/status.json");
  writeFileSync(outPath, JSON.stringify(status, null, 2) + "\n");

  console.log(`canary ${status.status.toUpperCase()} @ ${status.generated_at}`);
  for (const [k, v] of Object.entries(leagues)) {
    const cov = v.active ? `${v.resolved}/${v.active}` : "N/A";
    console.log(`  ${(v.label || k).padEnd(16)} ${String(v.status).padEnd(8)} resolved=${cov} legs=${v.legs_with_token} unlisted=${v.unlisted}`);
  }
  if (issues.length) {
    console.log(`\n${issues.length} signal(s):`);
    for (const i of issues) console.log(`  [${i.bucket}] ${i.message}`);
  }

  if (STRICT && (status.status === "drift" || status.status === "gap")) {
    process.exitCode = 1;
  }
}

run().catch((e) => {
  console.error("canary crashed:", e);
  process.exitCode = 2;
});
