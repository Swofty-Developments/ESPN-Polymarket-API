/**
 * Candidate Polymarket slug derivation (I/O layer helper).
 *
 * Mirrors the Rust reference (`core-rs/src/slug.rs`).
 */

import { teamCode } from "./crosswalk.js";
import { data } from "./data.js";
import { candidateDates } from "./datecalc.js";
import type { EspnGame } from "./models.js";

/**
 * Ordered, de-duplicated candidate Polymarket event slugs for a game.
 *
 * Tries the league's preferred team ordering first, then the reverse, across all
 * candidate dates (see {@link candidateDates}).
 */
export function candidateSlugs(game: EspnGame): string[] {
  const cfg = data().league(game.league);
  if (!cfg) return [];
  const away = teamCode(game.league, game.away.abbr);
  const home = teamCode(game.league, game.home.abbr);
  const pairs: [string, string][] =
    cfg.slug_order === "away_home"
      ? [
          [away, home],
          [home, away],
        ]
      : [
          [home, away],
          [away, home],
        ];
  const out: string[] = [];
  for (const date of candidateDates(game.kickoffUtc)) {
    for (const [x, y] of pairs) {
      const slug = `${cfg.pm_prefix}-${x}-${y}-${date}`;
      if (!out.includes(slug)) out.push(slug);
    }
  }
  return out;
}
