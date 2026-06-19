//! Public data types shared across the parse / resolve / client surface.

use serde::{Deserialize, Serialize};

/// One side (home or away) of an ESPN game.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EspnSide {
    pub abbr: String,
    pub display_name: String,
    pub short_name: String,
    pub location: String,
    pub nickname: String,
}

/// A normalized ESPN game (one scoreboard event).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EspnGame {
    pub league: String,
    pub espn_event_id: String,
    pub kickoff_utc: String,
    pub home: EspnSide,
    pub away: EspnSide,
}

/// One Polymarket market within an event (moneyline, leg, spread, total, ...).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PmMarket {
    pub slug: String,
    pub question: String,
    pub group_item_title: String,
    pub sports_market_type: Option<String>,
    pub outcomes: Vec<String>,
    pub outcome_prices: Vec<String>,
    pub clob_token_ids: Vec<String>,
}

/// A Polymarket "event" (a game), holding one or many markets.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PmEvent {
    pub slug: String,
    pub title: String,
    pub markets: Vec<PmMarket>,
}

/// ESPN ⇄ Polymarket identity for one side, as resolved.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TeamBlock {
    pub espn_abbr: String,
    pub name: String,
    pub pm_code: String,
}

/// A single resolved tradable outcome.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Outcome {
    /// "home" | "away" | "draw".
    pub selection: String,
    /// Team display name, or `null` for the draw leg.
    pub team: Option<String>,
    pub pm_market_slug: String,
    /// The Polymarket outcome label this selection corresponds to (e.g. "Yes" or "Knicks").
    pub pm_outcome: String,
    /// Index of `pm_outcome` within that market's `outcomes` array.
    pub outcome_index: u32,
    pub token_id: String,
    /// Price, verbatim string from Polymarket (no floats in the contract).
    pub price: String,
}

/// The full mapping result for one ESPN game ⇄ Polymarket event.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MapResult {
    pub resolved: bool,
    pub league: String,
    /// "two_way" | "three_way".
    pub kind: String,
    pub espn_event_id: String,
    pub pm_event_slug: String,
    /// The single moneyline market slug for two-way sports; `null` for three-way.
    pub pm_market_slug: Option<String>,
    pub home: TeamBlock,
    pub away: TeamBlock,
    pub outcomes: Vec<Outcome>,
}

impl Outcome {
    /// Convenience: parse `price` as `f64` (lossy; the contract value is the string).
    pub fn price_f64(&self) -> Option<f64> {
        self.price.parse().ok()
    }
}
