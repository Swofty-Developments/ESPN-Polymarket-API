//! The core resolution algorithm — the cross-language contract (see `docs/architecture.md`).

use crate::crosswalk::{side_names, team_code, team_name};
use crate::data::data;
use crate::models::{EspnGame, MapResult, Outcome, PmEvent, PmMarket, TeamBlock};
use crate::normalize::{normalize, team_matches};

fn team_block(league: &str, side: &crate::models::EspnSide) -> TeamBlock {
    TeamBlock {
        espn_abbr: side.abbr.clone(),
        name: team_name(league, side),
        pm_code: team_code(league, &side.abbr),
    }
}

fn is_draw(m: &PmMarket) -> bool {
    m.slug.ends_with("-draw") || normalize(&m.group_item_title).starts_with("draw")
}

fn idx_str(arr: &[String], i: usize) -> String {
    arr.get(i).cloned().unwrap_or_default()
}

/// Resolve one ESPN game against a candidate Polymarket event.
pub fn resolve(league: &str, game: &EspnGame, pm: &PmEvent) -> MapResult {
    let home_block = team_block(league, &game.home);
    let away_block = team_block(league, &game.away);
    let kind = data()
        .league(league)
        .map(|c| c.kind.clone())
        .unwrap_or_default();

    let mut result = MapResult {
        resolved: false,
        league: league.to_string(),
        kind: kind.clone(),
        espn_event_id: game.espn_event_id.clone(),
        pm_event_slug: pm.slug.clone(),
        pm_market_slug: None,
        home: home_block,
        away: away_block,
        outcomes: Vec::new(),
    };

    let home_names = side_names(league, &game.home);
    let away_names = side_names(league, &game.away);

    if kind == "three_way" {
        let mut home_leg = None;
        let mut away_leg = None;
        let mut draw_leg = None;
        for m in &pm.markets {
            if is_draw(m) {
                draw_leg.get_or_insert(m);
                continue;
            }
            let label = if m.group_item_title.is_empty() {
                &m.question
            } else {
                &m.group_item_title
            };
            if home_leg.is_none() && team_matches(&home_names, label) {
                home_leg = Some(m);
            } else if away_leg.is_none() && team_matches(&away_names, label) {
                away_leg = Some(m);
            }
        }
        let leg_outcome = |selection: &str, team: Option<String>, m: &PmMarket| Outcome {
            selection: selection.to_string(),
            team,
            pm_market_slug: m.slug.clone(),
            pm_outcome: idx_str(&m.outcomes, 0),
            outcome_index: 0,
            token_id: idx_str(&m.clob_token_ids, 0),
            price: idx_str(&m.outcome_prices, 0),
        };
        if let Some(m) = home_leg {
            result
                .outcomes
                .push(leg_outcome("home", Some(result.home.name.clone()), m));
        }
        if let Some(m) = away_leg {
            result
                .outcomes
                .push(leg_outcome("away", Some(result.away.name.clone()), m));
        }
        if let Some(m) = draw_leg {
            result.outcomes.push(leg_outcome("draw", None, m));
        }
        result.resolved = home_leg.is_some() && away_leg.is_some();
        return result;
    }

    // two_way
    let ml = pm.markets.iter().find(|m| m.slug == pm.slug).or_else(|| {
        pm.markets
            .iter()
            .find(|m| m.sports_market_type.as_deref() == Some("moneyline"))
    });
    let Some(ml) = ml else {
        return result;
    };
    result.pm_market_slug = Some(ml.slug.clone());

    let mut home_idx = None;
    let mut away_idx = None;
    for (i, o) in ml.outcomes.iter().enumerate() {
        if home_idx.is_none() && team_matches(&home_names, o) {
            home_idx = Some(i);
        } else if away_idx.is_none() && team_matches(&away_names, o) {
            away_idx = Some(i);
        }
    }
    if let (Some(hi), Some(ai)) = (home_idx, away_idx) {
        if hi != ai {
            for i in 0..ml.outcomes.len() {
                let (selection, team) = if i == hi {
                    ("home", Some(result.home.name.clone()))
                } else if i == ai {
                    ("away", Some(result.away.name.clone()))
                } else {
                    continue;
                };
                result.outcomes.push(Outcome {
                    selection: selection.to_string(),
                    team,
                    pm_market_slug: ml.slug.clone(),
                    pm_outcome: idx_str(&ml.outcomes, i),
                    outcome_index: i as u32,
                    token_id: idx_str(&ml.clob_token_ids, i),
                    price: idx_str(&ml.outcome_prices, i),
                });
            }
            result.resolved = true;
        }
    }
    result
}
