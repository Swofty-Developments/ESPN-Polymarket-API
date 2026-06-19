#!/usr/bin/env node
// Seed data/crosswalk/<league>.json from ESPN team snapshots + hand-curated overrides.
//
// The crosswalk is THE PRODUCT (see README) — this script only *bootstraps* it. Once
// generated and committed, data/crosswalk/*.json is the source of truth, maintained by
// hand / the canary's auto-PR funnel. Re-running this regenerates the seed deterministically.
//
//   node scripts/seed-crosswalk.mjs
//
// Inputs:  scripts/espn-teams/<league>.json   (ESPN /teams snapshots)
//          scripts/crosswalk-overrides.json   (pm_code + alias divergences)
// Output:  data/crosswalk/<league>.json
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LEAGUES = ["nba", "mlb", "nhl", "fifa.world"];

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

for (const league of LEAGUES) {
  const snap = JSON.parse(readFileSync(join(ROOT, "scripts/espn-teams", `${league}.json`), "utf8"));
  const espnTeams = snap.sports[0].leagues[0].teams.map((t) => t.team);
  const ov = overrides[league] || { pm_code: {}, aliases: {} };

  const teams = {};
  for (const t of espnTeams) {
    const abbr = t.abbreviation;
    const key = normalize(abbr).replace(/ /g, "");
    const pm = ov.pm_code[abbr] || abbr.toLowerCase();

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

  // Deterministic key ordering.
  const ordered = {};
  for (const k of Object.keys(teams).sort()) ordered[k] = teams[k];

  const out = {
    $schema: "../schema/crosswalk.schema.json",
    league,
    teams: ordered,
  };
  const file = join(ROOT, "data/crosswalk", `${league === "fifa.world" ? "soccer" : league}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${file} (${Object.keys(ordered).length} teams)`);
}
