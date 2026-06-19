//! Parsing raw ESPN scoreboard events and Polymarket gamma events into typed models.

use crate::models::{EspnGame, EspnSide, PmEvent, PmMarket};
use serde_json::Value;

fn s(v: &Value, key: &str) -> String {
    v.get(key).and_then(Value::as_str).unwrap_or("").to_string()
}

/// Parse a Polymarket `outcomes`/`outcomePrices`/`clobTokenIds` field, which gamma encodes
/// as a JSON-string-of-array (e.g. `"[\"Yes\", \"No\"]"`). Also tolerates a real array.
fn string_array(v: Option<&Value>) -> Vec<String> {
    match v {
        Some(Value::String(s)) => serde_json::from_str::<Vec<Value>>(s)
            .map(|arr| arr.iter().map(value_to_string).collect())
            .unwrap_or_default(),
        Some(Value::Array(arr)) => arr.iter().map(value_to_string).collect(),
        _ => Vec::new(),
    }
}

fn value_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

/// Parse one ESPN scoreboard `event` object into an [`EspnGame`] for the given league.
pub fn parse_espn_event(json: &Value, league: &str) -> Option<EspnGame> {
    let comp = json
        .get("competitions")
        .and_then(|c| c.get(0))
        .unwrap_or(json);
    let kickoff = {
        let c = s(comp, "date");
        if c.is_empty() {
            s(json, "date")
        } else {
            c
        }
    };
    let competitors = comp.get("competitors").and_then(Value::as_array)?;

    let side_of = |home_away: &str| -> Option<EspnSide> {
        let c = competitors.iter().find(|c| s(c, "homeAway") == home_away)?;
        let team = c.get("team").unwrap_or(c);
        Some(EspnSide {
            abbr: s(team, "abbreviation"),
            display_name: s(team, "displayName"),
            short_name: s(team, "shortDisplayName"),
            location: s(team, "location"),
            nickname: s(team, "name"),
        })
    };

    Some(EspnGame {
        league: league.to_string(),
        espn_event_id: s(json, "id"),
        kickoff_utc: kickoff,
        home: side_of("home")?,
        away: side_of("away")?,
    })
}

/// Parse a Polymarket gamma `event` object into a [`PmEvent`].
pub fn parse_pm_event(json: &Value) -> PmEvent {
    let markets = json
        .get("markets")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .map(|m| PmMarket {
                    slug: s(m, "slug"),
                    question: s(m, "question"),
                    group_item_title: s(m, "groupItemTitle"),
                    sports_market_type: m
                        .get("sportsMarketType")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    outcomes: string_array(m.get("outcomes")),
                    outcome_prices: string_array(m.get("outcomePrices")),
                    clob_token_ids: string_array(m.get("clobTokenIds")),
                })
                .collect()
        })
        .unwrap_or_default();

    PmEvent {
        slug: s(json, "slug"),
        title: s(json, "title"),
        markets,
    }
}
