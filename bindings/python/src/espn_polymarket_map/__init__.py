"""espn-polymarket-map: ESPN <-> Polymarket market mapping.

A canonical, continuously-verified crosswalk between ESPN sports entities and
Polymarket markets: team-name normalization, market-slug derivation, and
outcome-index resolution. This is the Python binding -- a native port of the Rust
reference, verified against the same conformance corpus.

Offline core (the contract)::

    from espn_polymarket_map import parse_espn_event, parse_pm_event, resolve

    game = parse_espn_event(espn_json, "fifa.world")
    event = parse_pm_event(pm_json)
    result = resolve("fifa.world", game, event)
    print(result.resolved, result.pm_event_slug)
    print(result.to_dict())

Online client (standard-library HTTP)::

    from espn_polymarket_map.client import EspnClient, map_game

    for game in EspnClient.scoreboard("nba"):
        r = map_game(game)
        print(game.espn_event_id, r.pm_event_slug, r.resolved)
"""

from __future__ import annotations

from .crosswalk import crosswalk_entry, side_names, team_code, team_name
from .data import CrosswalkTeam, Data, LeagueConfig, abbr_key, data, data_version
from .datecalc import candidate_dates, civil_from_days, days_from_civil, parse_utc
from .models import (
    EspnGame,
    EspnSide,
    MapResult,
    Outcome,
    PmEvent,
    PmMarket,
    TeamBlock,
)
from .normalize import STOPWORDS, content_tokens, normalize, team_matches, tokens
from .parse import parse_espn_event, parse_pm_event
from .resolve import resolve
from .slug import candidate_slugs

__version__ = "0.1.0"

__all__ = [
    # models
    "EspnSide",
    "EspnGame",
    "PmMarket",
    "PmEvent",
    "TeamBlock",
    "Outcome",
    "MapResult",
    # normalize
    "normalize",
    "tokens",
    "content_tokens",
    "team_matches",
    "STOPWORDS",
    # datecalc
    "days_from_civil",
    "civil_from_days",
    "parse_utc",
    "candidate_dates",
    # crosswalk
    "team_code",
    "team_name",
    "side_names",
    "crosswalk_entry",
    # data
    "data",
    "data_version",
    "abbr_key",
    "Data",
    "LeagueConfig",
    "CrosswalkTeam",
    # parse / resolve / slug
    "parse_espn_event",
    "parse_pm_event",
    "resolve",
    "candidate_slugs",
    "__version__",
]
