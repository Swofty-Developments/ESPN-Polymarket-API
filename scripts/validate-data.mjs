#!/usr/bin/env node
// Dependency-free validation of data/ against the documented invariants (a focused stand-in for
// full JSON-Schema validation, runnable anywhere). Exits non-zero on any violation.
//
//   node scripts/validate-data.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const errs = [];
const codeRe = /^[a-z0-9]+$/;

const templates = read("data/slug-templates.json");
if (!/^\d+\.\d+\.\d+$/.test(templates.version || "")) errs.push("slug-templates.version not semver");

const KINDS = ["two_way", "three_way"];
const ORDERS = ["away_home", "home_away"];
for (const [league, cfg] of Object.entries(templates.leagues || {})) {
  for (const f of ["espn_path", "pm_prefix", "kind", "slug_order", "date_basis", "crosswalk"]) {
    if (!cfg[f]) errs.push(`${league}: missing ${f}`);
  }
  if (!KINDS.includes(cfg.kind)) errs.push(`${league}: bad kind ${cfg.kind}`);
  if (!ORDERS.includes(cfg.slug_order)) errs.push(`${league}: bad slug_order ${cfg.slug_order}`);
  if (!codeRe.test(cfg.pm_prefix || "")) errs.push(`${league}: bad pm_prefix ${cfg.pm_prefix}`);

  let cw;
  try {
    cw = read(`data/crosswalk/${cfg.crosswalk}.json`);
  } catch (e) {
    errs.push(`${league}: cannot read crosswalk ${cfg.crosswalk}: ${e.message}`);
    continue;
  }
  const teams = cw.teams || {};
  const n = Object.keys(teams).length;
  if (n === 0) errs.push(`${cfg.crosswalk}: no teams`);
  const pmSeen = new Map();
  for (const [key, t] of Object.entries(teams)) {
    if (!codeRe.test(key)) errs.push(`${cfg.crosswalk}.${key}: key not [a-z0-9]`);
    for (const f of ["espn", "pm", "name", "aliases"]) {
      if (t[f] === undefined) errs.push(`${cfg.crosswalk}.${key}: missing ${f}`);
    }
    if (!codeRe.test(t.pm || "")) errs.push(`${cfg.crosswalk}.${key}: pm '${t.pm}' not [a-z0-9]`);
    if (!Array.isArray(t.aliases)) errs.push(`${cfg.crosswalk}.${key}: aliases not array`);
    else {
      for (const a of t.aliases) {
        if (a !== a.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase())
          errs.push(`${cfg.crosswalk}.${key}: alias '${a}' is not normalized (lowercase, no diacritics)`);
      }
    }
    if (key !== (t.espn || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ""))
      errs.push(`${cfg.crosswalk}.${key}: key does not match normalized espn '${t.espn}'`);
    if (pmSeen.has(t.pm)) errs.push(`${cfg.crosswalk}: duplicate pm code '${t.pm}' (${pmSeen.get(t.pm)} and ${key})`);
    else pmSeen.set(t.pm, key);
  }
  console.log(`ok  ${league.padEnd(11)} kind=${cfg.kind.padEnd(10)} order=${cfg.slug_order.padEnd(10)} teams=${n}`);
}

if (errs.length) {
  console.error(`\n${errs.length} data validation error(s):`);
  for (const e of errs) console.error("  - " + e);
  process.exit(1);
}
console.log("\ndata is valid");
