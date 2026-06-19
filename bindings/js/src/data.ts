/**
 * Embedded data tables (crosswalk + slug templates), loaded once on first use.
 *
 * The data lives in `_data/` next to the compiled module (copied into `dist/`
 * by the build). There is exactly one source of truth: the repo's `data/`,
 * synced into `src/_data/` — never read `../../data` at runtime.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalize } from "./normalize.js";

export interface LeagueConfig {
  espn_path: string;
  pm_prefix: string;
  kind: string;
  slug_order: string;
  date_basis: string;
  crosswalk: string;
}

export interface CrosswalkTeam {
  espn: string;
  pm: string;
  name: string;
  aliases: string[];
}

interface SlugTemplates {
  version: string;
  leagues: Record<string, LeagueConfig>;
}

interface CrosswalkFile {
  teams: Record<string, CrosswalkTeam>;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, "_data");

const CROSSWALK_STEMS = [
  "nba", "mlb", "nhl", "soccer", "nfl", "wnba", "epl", "ucl",
  "laliga", "bundesliga", "seriea", "ligue1", "mls", "cfb", "cbb",
] as const;

function readJson<T>(...parts: string[]): T {
  const path = join(DATA_DIR, ...parts);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export class Data {
  readonly dataVersion: string;
  readonly leagues: Record<string, LeagueConfig>;
  /** crosswalk stem -> (lowercased espn abbr -> team) */
  private readonly crosswalks: Record<string, Record<string, CrosswalkTeam>>;

  constructor() {
    const tmpl = readJson<SlugTemplates>("slug-templates.json");
    this.leagues = tmpl.leagues;
    this.dataVersion = readFileSync(join(DATA_DIR, "VERSION"), "utf8").trim();
    this.crosswalks = {};
    for (const stem of CROSSWALK_STEMS) {
      const f = readJson<CrosswalkFile>("crosswalk", `${stem}.json`);
      this.crosswalks[stem] = f.teams;
    }
  }

  league(league: string): LeagueConfig | undefined {
    return this.leagues[league];
  }

  /** Look up a team by ESPN abbreviation within a league's crosswalk. */
  crosswalkEntry(league: string, espnAbbr: string): CrosswalkTeam | undefined {
    const cfg = this.league(league);
    if (!cfg) return undefined;
    const table = this.crosswalks[cfg.crosswalk];
    if (!table) return undefined;
    return table[abbrKey(espnAbbr)];
  }
}

let SINGLETON: Data | null = null;

/** Process-wide singleton view of the embedded data. */
export function data(): Data {
  if (SINGLETON === null) {
    SINGLETON = new Data();
  }
  return SINGLETON;
}

/** Key used to index a crosswalk table from an ESPN abbreviation: normalized, spaces removed. */
export function abbrKey(espnAbbr: string): string {
  return normalize(espnAbbr).replace(/ /g, "");
}
