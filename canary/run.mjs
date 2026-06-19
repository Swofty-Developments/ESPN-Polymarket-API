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
  nba: "NBA",
  mlb: "MLB",
  nhl: "NHL",
  "fifa.world": "FIFA World Cup",
};

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
    const events = await PolymarketClient.search(`${game.away.displayName ?? game.away.display_name ?? ""} ${game.home.displayName ?? game.home.display_name ?? ""}`);
    for (const ev of events || []) {
      if (typeof ev.slug === "string" && ev.slug.startsWith(`${cfg.pm_prefix}-`)) return ev;
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

async function run() {
  const leagues = {};
  const issues = [];

  for (const [league, cfg] of Object.entries(templates.leagues)) {
    let games = [];
    let outage = false;
    try {
      games = await EspnClient.scoreboard(league);
    } catch (e) {
      outage = true;
      issues.push({ bucket: "outage", message: `ESPN scoreboard for ${league} failed: ${String(e).slice(0, 140)}` });
    }

    const probes = [];
    let legs = 0;
    for (const game of games) {
      let event = null;
      try {
        event = await findEvent(game);
      } catch (e) {
        // treat a hard error talking to gamma as an outage signal for this probe
        issues.push({ bucket: "outage", message: `Polymarket lookup failed for ${game.away.abbr}@${game.home.abbr}: ${String(e).slice(0, 120)}` });
      }
      const ok = shapeOk(event);
      let resolved = false;
      let result = null;
      if (event) {
        result = resolveGame(league, game, event);
        resolved = !!result.resolved;
        if (resolved) legs += legsWithToken(result);
      }
      const bucket = classifyGame({ eventFound: !!event, shapeOk: ok, resolved });
      probes.push({ bucket });

      if (bucket === "drift") {
        issues.push({ bucket: "drift", message: `${league}: ${event.slug} shape changed (outcomes unparseable) — needs code change` });
      } else if (bucket === "gap") {
        const rows = proposedRow(game, result);
        issues.push({
          bucket: "gap",
          message: `${league}: ${game.away.abbr}@${game.home.abbr} found ${event.slug} but didn't resolve; proposed: ${JSON.stringify(rows.map((r) => r.suggested))}`,
        });
      }
    }

    const agg = aggregateLeague(probes, outage);
    leagues[league] = {
      label: LEAGUE_LABELS[league] || league,
      ...agg,
      legs_with_token: legs,
      unlisted: probes.filter((p) => p.bucket === "unlisted").length,
    };
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
