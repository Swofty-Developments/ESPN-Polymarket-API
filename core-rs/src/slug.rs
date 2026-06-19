//! Candidate Polymarket slug derivation (I/O layer helper).

use crate::crosswalk::team_code;
use crate::data::data;
use crate::datecalc::candidate_dates;
use crate::models::EspnGame;

/// Ordered, de-duplicated candidate Polymarket event slugs for a game.
///
/// Tries the league's preferred team ordering first, then the reverse, across all
/// candidate dates (see [`candidate_dates`]).
pub fn candidate_slugs(game: &EspnGame) -> Vec<String> {
    let Some(cfg) = data().league(&game.league) else {
        return Vec::new();
    };
    let away = team_code(&game.league, &game.away.abbr);
    let home = team_code(&game.league, &game.home.abbr);
    let pairs: [(String, String); 2] = if cfg.slug_order == "away_home" {
        [(away.clone(), home.clone()), (home.clone(), away.clone())]
    } else {
        [(home.clone(), away.clone()), (away.clone(), home.clone())]
    };
    let mut out: Vec<String> = Vec::new();
    for date in candidate_dates(&game.kickoff_utc) {
        for (x, y) in &pairs {
            let s = format!("{}-{}-{}-{}", cfg.pm_prefix, x, y, date);
            if !out.contains(&s) {
                out.push(s);
            }
        }
    }
    out
}
