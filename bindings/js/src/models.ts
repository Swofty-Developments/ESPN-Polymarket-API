/**
 * Public data types shared across the parse / resolve / client surface.
 *
 * These mirror the Rust reference (`core-rs/src/models.rs`) and the normative
 * spec in `docs/architecture.md`. The `MapResult` and `Outcome` shapes use
 * snake_case property names directly so `JSON.stringify` matches the conformance
 * corpus byte-for-byte.
 */

/** One side (home or away) of an ESPN game. */
export interface EspnSide {
  abbr: string;
  displayName: string;
  shortName: string;
  location: string;
  nickname: string;
}

/** A normalized ESPN game (one scoreboard event). */
export interface EspnGame {
  league: string;
  espnEventId: string;
  kickoffUtc: string;
  home: EspnSide;
  away: EspnSide;
}

/** One Polymarket market within an event (moneyline, leg, spread, total, ...). */
export interface PmMarket {
  slug: string;
  question: string;
  groupItemTitle: string;
  sportsMarketType: string | null;
  outcomes: string[];
  /** Prices as verbatim strings from Polymarket (never floats). */
  outcomePrices: string[];
  clobTokenIds: string[];
}

/** A Polymarket "event" (a game), holding one or many markets. */
export interface PmEvent {
  slug: string;
  title: string;
  markets: PmMarket[];
}

/** ESPN ⇄ Polymarket identity for one side, as resolved. Serialized snake_case. */
export interface TeamBlock {
  espn_abbr: string;
  name: string;
  pm_code: string;
}

/**
 * A single resolved tradable outcome. Property names are snake_case so the
 * serialized JSON matches the corpus contract exactly.
 */
export interface Outcome {
  selection: "home" | "away" | "draw";
  /** Team display name, or `null` for the draw leg. */
  team: string | null;
  pm_market_slug: string;
  /** The Polymarket outcome label this selection corresponds to (e.g. "Yes" or "Knicks"). */
  pm_outcome: string;
  /** Index of `pm_outcome` within that market's `outcomes` array (integer). */
  outcome_index: number;
  token_id: string;
  /** Price, verbatim string from Polymarket (no floats in the contract). */
  price: string;
}

/**
 * The full mapping result for one ESPN game ⇄ Polymarket event. Property names
 * are snake_case so the serialized JSON matches the corpus contract exactly.
 */
export interface MapResult {
  resolved: boolean;
  league: string;
  /** "two_way" | "three_way". */
  kind: string;
  espn_event_id: string;
  pm_event_slug: string;
  /** The single moneyline market slug for two-way sports; `null` for three-way. */
  pm_market_slug: string | null;
  home: TeamBlock;
  away: TeamBlock;
  outcomes: Outcome[];
}
