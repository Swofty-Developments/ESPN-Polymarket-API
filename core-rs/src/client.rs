//! Blocking HTTP clients for ESPN and Polymarket (enabled by the `client` feature).
//!
//! These are the I/O layer: thin, retrying wrappers around the public, keyless endpoints.
//! They are *not* part of the conformance corpus — only `resolve` is.

use crate::data::data;
use crate::models::{EspnGame, MapResult, PmEvent};
use crate::parse::{parse_espn_event, parse_pm_event};
use crate::resolve::resolve;
use crate::slug::candidate_slugs;
use serde_json::Value;
use std::time::Duration;

const ESPN_BASE: &str = "https://site.api.espn.com/apis/site/v2/sports";
const GAMMA_BASE: &str = "https://gamma-api.polymarket.com";

/// Network / decoding error.
#[derive(Debug)]
pub enum ClientError {
    Http(String),
    Decode(String),
    Unknown(String),
}

impl std::fmt::Display for ClientError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ClientError::Http(e) => write!(f, "http error: {e}"),
            ClientError::Decode(e) => write!(f, "decode error: {e}"),
            ClientError::Unknown(e) => write!(f, "error: {e}"),
        }
    }
}
impl std::error::Error for ClientError {}

fn get_json(url: &str) -> Result<Value, ClientError> {
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(25))
        .user_agent(
            "espn-polymarket-map/0.1 (+https://github.com/Swofty-Developments/ESPN-Polymarket-API)",
        )
        .build();
    let mut last = String::from("no attempt");
    for attempt in 0..3 {
        match agent.get(url).call() {
            Ok(resp) => {
                let body = resp
                    .into_string()
                    .map_err(|e| ClientError::Decode(e.to_string()))?;
                return serde_json::from_str(&body).map_err(|e| ClientError::Decode(e.to_string()));
            }
            Err(e) => {
                last = e.to_string();
                std::thread::sleep(Duration::from_millis(300 * (attempt + 1)));
            }
        }
    }
    Err(ClientError::Http(last))
}

/// ESPN site.api scoreboard client.
pub struct EspnClient;

impl EspnClient {
    /// Today's scoreboard for a league key (e.g. `"nba"`, `"fifa.world"`).
    pub fn scoreboard(league: &str) -> Result<Vec<EspnGame>, ClientError> {
        Self::fetch(league, None)
    }

    /// Scoreboard for a specific UTC date (`YYYYMMDD`).
    pub fn scoreboard_on(league: &str, yyyymmdd: &str) -> Result<Vec<EspnGame>, ClientError> {
        Self::fetch(league, Some(yyyymmdd))
    }

    fn fetch(league: &str, date: Option<&str>) -> Result<Vec<EspnGame>, ClientError> {
        let cfg = data()
            .league(league)
            .ok_or_else(|| ClientError::Unknown(format!("unknown league {league}")))?;
        let mut url = format!("{ESPN_BASE}/{}/scoreboard", cfg.espn_path);
        if let Some(d) = date {
            url.push_str(&format!("?dates={d}"));
        }
        let json = get_json(&url)?;
        let events = json
            .get("events")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        Ok(events
            .iter()
            .filter_map(|e| parse_espn_event(e, league))
            .collect())
    }
}

/// Polymarket gamma client.
pub struct PolymarketClient;

impl PolymarketClient {
    /// Fetch an event by exact slug, if it exists.
    pub fn event_by_slug(slug: &str) -> Result<Option<PmEvent>, ClientError> {
        let url = format!("{GAMMA_BASE}/events?slug={slug}");
        let json = get_json(&url)?;
        Ok(json.as_array().and_then(|a| a.first()).map(parse_pm_event))
    }

    /// Free-text search returning candidate events.
    pub fn search(query: &str) -> Result<Vec<PmEvent>, ClientError> {
        let q = urlencode(query);
        let url = format!("{GAMMA_BASE}/public-search?q={q}&limit_per_type=10");
        let json = get_json(&url)?;
        Ok(json
            .get("events")
            .and_then(Value::as_array)
            .map(|a| a.iter().map(parse_pm_event).collect())
            .unwrap_or_default())
    }
}

fn urlencode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// End-to-end: given an ESPN game, find and resolve its Polymarket event.
///
/// Tries each candidate slug, then falls back to search. Returns the first `resolved`
/// result, or the best unresolved attempt (so callers can classify mapping gaps).
pub fn map_game(game: &EspnGame) -> Result<MapResult, ClientError> {
    let cfg = data()
        .league(&game.league)
        .ok_or_else(|| ClientError::Unknown(format!("unknown league {}", game.league)))?;

    let mut last: Option<MapResult> = None;
    for slug in candidate_slugs(game) {
        if let Some(ev) = PolymarketClient::event_by_slug(&slug)? {
            let r = resolve(&game.league, game, &ev);
            if r.resolved {
                return Ok(r);
            }
            last = Some(r);
        }
    }

    // Search fallback.
    let query = format!("{} {}", game.away.display_name, game.home.display_name);
    if let Ok(events) = PolymarketClient::search(&query) {
        for ev in events {
            if !ev.slug.starts_with(&format!("{}-", cfg.pm_prefix)) {
                continue;
            }
            let r = resolve(&game.league, game, &ev);
            if r.resolved {
                return Ok(r);
            }
            last = last.or(Some(r));
        }
    }

    let empty = PmEvent {
        slug: String::new(),
        title: String::new(),
        markets: vec![],
    };
    Ok(last.unwrap_or_else(|| resolve(&game.league, game, &empty)))
}
