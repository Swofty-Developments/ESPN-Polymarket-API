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
    if competitors.len() < 2 {
        return None;
    }

    // A side is a team (most sports) or an athlete (tennis, MMA); read whichever is present.
    let side = |c: &Value| -> EspnSide {
        let t = c.get("team").or_else(|| c.get("athlete")).unwrap_or(c);
        EspnSide {
            abbr: s(t, "abbreviation"),
            display_name: s(t, "displayName"),
            short_name: {
                let sd = s(t, "shortDisplayName");
                if sd.is_empty() {
                    s(t, "shortName")
                } else {
                    sd
                }
            },
            location: s(t, "location"),
            nickname: {
                let n = s(t, "name");
                if n.is_empty() {
                    s(t, "lastName")
                } else {
                    n
                }
            },
        }
    };

    // Use explicit home/away when present; otherwise fall back to competitor order
    // (athlete head-to-head events have no home/away).
    let find = |ha: &str| competitors.iter().find(|c| s(c, "homeAway") == ha);
    let (home, away) = match (find("home"), find("away")) {
        (Some(h), Some(a)) => (h, a),
        _ => (&competitors[1], &competitors[0]),
    };

    Some(EspnGame {
        league: league.to_string(),
        espn_event_id: s(json, "id"),
        kickoff_utc: kickoff,
        home: side(home),
        away: side(away),
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
