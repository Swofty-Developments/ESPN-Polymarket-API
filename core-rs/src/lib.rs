//! # espn-polymarket-map
//!
//! A canonical, continuously-verified crosswalk between ESPN sports entities and Polymarket
//! markets: team/athlete name normalization, market-slug derivation, and outcome-index
//! resolution. This is the **Rust reference implementation**; the Python and JS bindings are
//! native ports verified against the same conformance corpus.
//!
//! ## Offline core (the contract)
//! ```no_run
//! use espn_polymarket_map::{parse_espn_event, parse_pm_event, resolve};
//! # let espn_json: serde_json::Value = serde_json::json!({});
//! # let pm_json: serde_json::Value = serde_json::json!({});
//! let game = parse_espn_event(&espn_json, "fifa.world").unwrap();
//! let event = parse_pm_event(&pm_json);
//! let result = resolve("fifa.world", &game, &event);
//! println!("resolved: {} -> {}", result.resolved, result.pm_event_slug);
//! ```
//!
//! ## Online client (the `client` feature, on by default)
//! ```no_run
//! # #[cfg(feature = "client")] {
//! use espn_polymarket_map::client::{EspnClient, map_game};
//! for game in EspnClient::scoreboard("nba").unwrap() {
//!     let r = map_game(&game).unwrap();
//!     println!("{} -> {} ({})", game.espn_event_id, r.pm_event_slug, r.resolved);
//! }
//! # }
//! ```

mod crosswalk;
mod data;
mod datecalc;
mod normalize;
mod parse;
mod resolve;
mod slug;

pub mod models;

#[cfg(feature = "client")]
pub mod client;

pub use crosswalk::{side_names, team_code, team_name};
pub use data::{data, CrosswalkTeam, Data, LeagueConfig, DATA_VERSION};
pub use datecalc::candidate_dates;
pub use models::{EspnGame, EspnSide, MapResult, Outcome, PmEvent, PmMarket, TeamBlock};
pub use normalize::{normalize, team_matches, tokens};
pub use parse::{parse_espn_event, parse_pm_event};
pub use resolve::resolve;
pub use slug::candidate_slugs;

/// The embedded `data/VERSION`, trimmed.
pub fn data_version() -> &'static str {
    DATA_VERSION.trim()
}
