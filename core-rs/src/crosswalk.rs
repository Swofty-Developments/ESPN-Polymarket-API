//! Crosswalk lookups: ESPN abbreviation → Polymarket code, and match-name collection.

use crate::data::data;
use crate::models::EspnSide;
use crate::normalize::normalize;

/// Key used to index a crosswalk table from an ESPN abbreviation: normalized, spaces removed.
pub fn abbr_key(espn_abbr: &str) -> String {
    normalize(espn_abbr).replace(' ', "")
}

/// Polymarket team code for an ESPN abbreviation, falling back to the lowercased abbreviation.
pub fn team_code(league: &str, espn_abbr: &str) -> String {
    match data().crosswalk_entry(league, espn_abbr) {
        Some(e) => e.pm.clone(),
        None => abbr_key(espn_abbr),
    }
}

/// Canonical display name: crosswalk name if known, else the ESPN display name.
pub fn team_name(league: &str, side: &EspnSide) -> String {
    match data().crosswalk_entry(league, &side.abbr) {
        Some(e) => e.name.clone(),
        None => side.display_name.clone(),
    }
}

/// All candidate strings used to match a Polymarket outcome/leg label to this side.
pub fn side_names(league: &str, side: &EspnSide) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    let mut push = |s: &str| {
        let s = s.trim();
        if !s.is_empty() && !names.iter().any(|n| n == s) {
            names.push(s.to_string());
        }
    };
    push(&side.display_name);
    push(&side.short_name);
    push(&side.location);
    push(&side.nickname);
    if let Some(e) = data().crosswalk_entry(league, &side.abbr) {
        let name = e.name.clone();
        push(&name);
        for a in &e.aliases {
            push(a);
        }
    }
    names
}
