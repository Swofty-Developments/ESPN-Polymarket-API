#!/usr/bin/env node
// Seed data/crosswalk/<league>.json from ESPN team snapshots + hand-curated overrides.
// This only bootstraps the crosswalk; once committed, data/crosswalk/*.json is the source
// of truth (maintained by hand / the canary's auto-PR funnel). Re-running is deterministic.
//
//   node scripts/seed-crosswalk.mjs
//
// Inputs:  scripts/espn-teams/<league>.json, scripts/crosswalk-overrides.json
// Output:  data/crosswalk/<league>.json
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// league key (also the overrides key) -> { teams: espn-snapshot stem, out: crosswalk stem }
const LEAGUES = {
  nba: { teams: "nba", out: "nba" },
  mlb: { teams: "mlb", out: "mlb" },
  nhl: { teams: "nhl", out: "nhl" },
  "fifa.world": { teams: "fifa.world", out: "soccer" },
  nfl: { teams: "nfl", out: "nfl" },
  wnba: { teams: "wnba", out: "wnba" },
  "eng.1": { teams: "epl", out: "epl" },
  "uefa.champions": { teams: "ucl", out: "ucl" },
  "esp.1": { teams: "laliga", out: "laliga" },
  "ger.1": { teams: "bundesliga", out: "bundesliga" },
  "ita.1": { teams: "seriea", out: "seriea" },
  "fra.1": { teams: "ligue1", out: "ligue1" },
  "usa.1": { teams: "mls", out: "mls" },
  "college-football": { teams: "cfb", out: "cfb" },
  "mens-college-basketball": { teams: "cbb", out: "cbb" },
};

// MUST stay identical to normalize() in every binding (see docs/architecture.md).
function normalize(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const overrides = JSON.parse(readFileSync(join(ROOT, "scripts/crosswalk-overrides.json"), "utf8"));

for (const [league, cfg] of Object.entries(LEAGUES)) {
  const snap = JSON.parse(readFileSync(join(ROOT, "scripts/espn-teams", `${cfg.teams}.json`), "utf8"));
  const espnTeams = snap.sports[0].leagues[0].teams.map((t) => t.team);
  const ov = overrides[league] || { pm_code: {}, aliases: {} };

  const teams = {};
  for (const t of espnTeams) {
    const abbr = t.abbreviation;
    const key = normalize(abbr).replace(/ /g, "");
    if (!key) continue;
    const pm = ov.pm_code[abbr] || key;

    const aliasSet = new Set();
    for (const cand of [t.displayName, t.shortDisplayName, t.location, t.name]) {
      const n = normalize(cand);
      if (n) aliasSet.add(n);
    }
    for (const extra of ov.aliases[abbr] || []) {
      const n = normalize(extra);
      if (n) aliasSet.add(n);
    }
    // The canonical display name is carried separately; drop it from aliases to avoid dupes.
    const name = t.displayName;
    aliasSet.delete(normalize(name));

    teams[key] = {
      espn: abbr,
      pm,
      name,
      aliases: [...aliasSet].sort(),
    };
  }

  const ordered = {};
  for (const k of Object.keys(teams).sort()) ordered[k] = teams[k];

  const out = {
    $schema: "../schema/crosswalk.schema.json",
    league,
    teams: ordered,
  };
  const file = join(ROOT, "data/crosswalk", `${cfg.out}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${cfg.out}.json (${Object.keys(ordered).length} teams)`);
}
