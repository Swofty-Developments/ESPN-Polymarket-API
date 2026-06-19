//! Embedded data tables (crosswalk + slug templates), parsed once on first use.

use serde::Deserialize;
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Debug, Clone, Deserialize)]
pub struct LeagueConfig {
    pub espn_path: String,
    pub pm_prefix: String,
    pub kind: String,
    pub slug_order: String,
    pub date_basis: String,
    pub crosswalk: String,
}

#[derive(Debug, Deserialize)]
struct SlugTemplates {
    version: String,
    leagues: HashMap<String, LeagueConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CrosswalkTeam {
    pub espn: String,
    pub pm: String,
    pub name: String,
    pub aliases: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct CrosswalkFile {
    teams: HashMap<String, CrosswalkTeam>,
}

/// All embedded data, indexed for lookup.
pub struct Data {
    pub data_version: String,
    pub leagues: HashMap<String, LeagueConfig>,
    /// crosswalk stem -> (lowercased espn abbr -> team)
    crosswalks: HashMap<String, HashMap<String, CrosswalkTeam>>,
}

// Embedded at build time — single source of truth is `data/`.
const SLUG_TEMPLATES: &str = include_str!("../../data/slug-templates.json");
/// (crosswalk stem, embedded JSON) for every league.
const CROSSWALKS: &[(&str, &str)] = &[
    ("nba", include_str!("../../data/crosswalk/nba.json")),
    ("mlb", include_str!("../../data/crosswalk/mlb.json")),
    ("nhl", include_str!("../../data/crosswalk/nhl.json")),
    ("soccer", include_str!("../../data/crosswalk/soccer.json")),
    ("nfl", include_str!("../../data/crosswalk/nfl.json")),
    ("wnba", include_str!("../../data/crosswalk/wnba.json")),
    ("epl", include_str!("../../data/crosswalk/epl.json")),
    ("ucl", include_str!("../../data/crosswalk/ucl.json")),
    ("laliga", include_str!("../../data/crosswalk/laliga.json")),
    ("bundesliga", include_str!("../../data/crosswalk/bundesliga.json")),
    ("seriea", include_str!("../../data/crosswalk/seriea.json")),
    ("ligue1", include_str!("../../data/crosswalk/ligue1.json")),
    ("mls", include_str!("../../data/crosswalk/mls.json")),
    ("cfb", include_str!("../../data/crosswalk/cfb.json")),
    ("cbb", include_str!("../../data/crosswalk/cbb.json")),
];
/// data/VERSION, trimmed.
pub const DATA_VERSION: &str = include_str!("../../data/VERSION");

fn load() -> Data {
    let tmpl: SlugTemplates = serde_json::from_str(SLUG_TEMPLATES).expect("slug-templates.json");
    let mut crosswalks = HashMap::new();
    for &(stem, raw) in CROSSWALKS {
        let f: CrosswalkFile =
            serde_json::from_str(raw).unwrap_or_else(|e| panic!("crosswalk {stem}: {e}"));
        crosswalks.insert(stem.to_string(), f.teams);
    }
    Data {
        data_version: tmpl.version,
        leagues: tmpl.leagues,
        crosswalks,
    }
}

/// Process-wide singleton view of the embedded data.
pub fn data() -> &'static Data {
    static D: OnceLock<Data> = OnceLock::new();
    D.get_or_init(load)
}

impl Data {
    pub fn league(&self, league: &str) -> Option<&LeagueConfig> {
        self.leagues.get(league)
    }

    /// Look up a team by ESPN abbreviation within a league's crosswalk.
    pub fn crosswalk_entry(&self, league: &str, espn_abbr: &str) -> Option<&CrosswalkTeam> {
        let cfg = self.league(league)?;
        let table = self.crosswalks.get(&cfg.crosswalk)?;
        table.get(&crate::crosswalk::abbr_key(espn_abbr))
    }
}
