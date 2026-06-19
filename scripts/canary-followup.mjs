#!/usr/bin/env node
// Turn canary findings into human-actionable artifacts (run in CI, needs `gh`):
//   - drift  -> open a deduplicated Issue (a human must change code).
//   - gap    -> open a PR with the proposed crosswalk row(s) already filled in.
// Outage findings produce nothing (nothing is broken on our end).
//
// Safe to run locally with no GH_TOKEN: it prints what it *would* do and exits 0.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const status = JSON.parse(readFileSync(join(ROOT, "canary/dashboard/status.json"), "utf8"));
const hasGh = (() => {
  try {
    execSync("gh --version", { stdio: "ignore" });
    return !!process.env.GH_TOKEN || !!process.env.GITHUB_TOKEN;
  } catch {
    return false;
  }
})();

const sh = (cmd) => execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
const dryRun = (label, cmd) => console.log(`[dry-run] ${label}: ${cmd}`);

const drift = (status.issues || []).filter((i) => i.bucket === "drift");
const gaps = (status.issues || []).filter((i) => i.bucket === "gap");

// ---- drift -> issues (deduped by title) -------------------------------------------------
for (const d of drift) {
  const title = `canary: drift — ${d.message.split(":")[0]}`;
  if (!hasGh) {
    dryRun("open issue", title);
    continue;
  }
  const existing = sh(`gh issue list --search ${JSON.stringify(title)} --state open --json number --jq 'length'`);
  if (existing !== "0") {
    console.log(`issue already open: ${title}`);
    continue;
  }
  const body = `The daily canary saw a Polymarket payload whose shape no longer parses.\n\n> ${d.message}\n\nThis needs a code change (the mapping algorithm or parser). See docs/architecture.md.`;
  sh(`gh issue create --title ${JSON.stringify(title)} --body ${JSON.stringify(body)} --label canary,drift`);
  console.log(`opened issue: ${title}`);
}

// ---- gaps -> a single PR with proposed crosswalk rows ------------------------------------
if (gaps.length) {
  // Parse the proposed rows out of each gap message (JSON array tail).
  const proposals = [];
  for (const g of gaps) {
    const m = g.message.match(/proposed: (\[.*\])$/);
    const league = g.message.split(":")[0];
    if (!m) continue;
    try {
      for (const row of JSON.parse(m[1])) proposals.push({ league, row });
    } catch {}
  }

  // Apply each proposal to the right crosswalk file (only if the abbr isn't already mapped).
  const templates = JSON.parse(readFileSync(join(ROOT, "data/slug-templates.json"), "utf8"));
  let changed = 0;
  const applied = [];
  for (const { league, row } of proposals) {
    const stem = templates.leagues[league]?.crosswalk;
    if (!stem) continue;
    const path = join(ROOT, "data/crosswalk", `${stem}.json`);
    const cw = JSON.parse(readFileSync(path, "utf8"));
    const key = (row.espn || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key || cw.teams[key]) continue; // already mapped — skip
    cw.teams[key] = { espn: row.espn, pm: row.pm, name: row.name, aliases: row.aliases || [] };
    // keep keys sorted for a clean diff
    cw.teams = Object.fromEntries(Object.keys(cw.teams).sort().map((k) => [k, cw.teams[k]]));
    writeFileSync(path, JSON.stringify(cw, null, 2) + "\n");
    applied.push(`${stem}: ${row.espn} -> pm "${row.pm}" (${row.name})`);
    changed++;
  }

  if (changed === 0) {
    console.log("no new gap rows to propose (all already mapped).");
  } else {
    execSync("node scripts/sync-data.mjs", { cwd: ROOT, stdio: "inherit" });
    const branch = `canary/gap-${status.generated_at.slice(0, 10)}`;
    const body = `The canary found live games it couldn't resolve and guessed the crosswalk row(s) below.\n\n${applied.map((a) => "- " + a).join("\n")}\n\n**Review each \`pm\` code** — it's a guess (lowercased ESPN abbreviation). Correct it against the real Polymarket slug if needed, then merge. Bump \`data/VERSION\` if you keep it. See docs/adding-a-team-mapping.md.`;
    if (!hasGh) {
      dryRun("create branch+PR", `${branch} (${changed} rows)`);
      console.log(body);
    } else {
      sh(`git config user.name "espn-pm-canary"`);
      sh(`git config user.email "canary@users.noreply.github.com"`);
      sh(`git checkout -b ${branch}`);
      sh(`git add data/`);
      sh(`git commit -m ${JSON.stringify(`fix(data): canary-proposed crosswalk rows (${changed})`)}`);
      sh(`git push -u origin ${branch} --force`);
      sh(`gh pr create --title ${JSON.stringify(`fix(data): canary-proposed crosswalk rows`)} --body ${JSON.stringify(body)} --label canary,mapping-gap`);
      console.log(`opened gap PR on ${branch}`);
    }
  }
}

if (!drift.length && !gaps.length) console.log("canary: nothing to file.");
