/**
 * Crosswalk lookups: ESPN abbreviation → Polymarket code, and match-name collection.
 *
 * Mirrors the Rust reference (`core-rs/src/crosswalk.rs`).
 */

import { data, abbrKey } from "./data.js";
import type { EspnSide } from "./models.js";

export { abbrKey };

/** Polymarket team code for an ESPN abbreviation, falling back to the lowercased abbreviation. */
export function teamCode(league: string, espnAbbr: string): string {
  const e = data().crosswalkEntry(league, espnAbbr);
  return e ? e.pm : abbrKey(espnAbbr);
}

/** Canonical display name: crosswalk name if known, else the ESPN display name. */
export function teamName(league: string, side: EspnSide): string {
  const e = data().crosswalkEntry(league, side.abbr);
  return e ? e.name : side.displayName;
}

/** All candidate strings used to match a Polymarket outcome/leg label to this side. */
export function sideNames(league: string, side: EspnSide): string[] {
  const names: string[] = [];
  const push = (raw: string) => {
    const s = raw.trim();
    if (s.length > 0 && !names.includes(s)) {
      names.push(s);
    }
  };
  push(side.displayName);
  push(side.shortName);
  push(side.location);
  push(side.nickname);
  const e = data().crosswalkEntry(league, side.abbr);
  if (e) {
    push(e.name);
    for (const a of e.aliases) push(a);
  }
  return names;
}
