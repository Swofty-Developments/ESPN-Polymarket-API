#!/usr/bin/env node
// Copy the canonical data/ tables into each language binding so packages are self-contained.
// data/ is the single source of truth. Run after any data change; CI checks for staleness.
//
//   node scripts/sync-data.mjs          # write copies
//   node scripts/sync-data.mjs --check  # exit 1 if any copy is stale (for CI)
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");

const FILES = [
  "VERSION",
  "slug-templates.json",
  ...readdirSync(join(ROOT, "data/crosswalk")).filter((f) => f.endsWith(".json")).sort().map((f) => `crosswalk/${f}`),
];

const TARGETS = [
  join(ROOT, "bindings/python/src/espn_polymarket_map/_data"),
  join(ROOT, "bindings/js/src/_data"),
];

let stale = 0;
for (const target of TARGETS) {
  for (const rel of FILES) {
    const srcPath = join(ROOT, "data", rel);
    const dstPath = join(target, rel);
    const src = readFileSync(srcPath, "utf8");
    let cur = null;
    try {
      cur = readFileSync(dstPath, "utf8");
    } catch {}
    if (cur === src) continue;
    if (CHECK) {
      console.error(`stale: ${dstPath}`);
      stale++;
      continue;
    }
    mkdirSync(dirname(dstPath), { recursive: true });
    writeFileSync(dstPath, src);
    console.log(`wrote ${dstPath}`);
  }
}

if (CHECK && stale > 0) {
  console.error(`\n${stale} embedded data file(s) are stale. Run: node scripts/sync-data.mjs`);
  process.exit(1);
}
if (CHECK) console.log("embedded data is in sync");
