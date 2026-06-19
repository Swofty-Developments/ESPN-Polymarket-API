"""Usage example for espn-polymarket-map.

Run with:  uv run --project . python examples/usage.py
(or set PYTHONPATH=src and run with any Python 3.9+)
"""

from __future__ import annotations

import json

from espn_polymarket_map import (
    candidate_slugs,
    data_version,
    normalize,
    parse_espn_event,
    parse_pm_event,
    resolve,
    team_matches,
)

# --- Primitives ------------------------------------------------------------

print("data version:", data_version())
print("normalize('Côte d\\'Ivoire'):", normalize("Côte d'Ivoire"))
print("team_matches(['Congo DR'], 'DR Congo'):", team_matches(["Congo DR"], "DR Congo"))

# --- Offline resolve (the contract) ----------------------------------------

espn_event = {
    "id": "401859967",
    "date": "2026-06-13T23:00Z",
    "competitions": [
        {
            "date": "2026-06-13T23:00Z",
            "competitors": [
                {
                    "homeAway": "home",
                    "team": {
                        "abbreviation": "SA",
                        "displayName": "San Antonio Spurs",
                        "shortDisplayName": "Spurs",
                        "location": "San Antonio",
                        "name": "Spurs",
                    },
                },
                {
                    "homeAway": "away",
                    "team": {
                        "abbreviation": "NY",
                        "displayName": "New York Knicks",
                        "shortDisplayName": "Knicks",
                        "location": "New York",
                        "name": "Knicks",
                    },
                },
            ],
        }
    ],
}

pm_event = {
    "slug": "nba-nyk-sas-2026-06-13",
    "title": "Knicks vs. Spurs",
    "markets": [
        {
            "slug": "nba-nyk-sas-2026-06-13",
            "question": "Knicks vs. Spurs",
            "sportsMarketType": "moneyline",
            "outcomes": '["Knicks", "Spurs"]',
            "outcomePrices": '["1", "0"]',
            "clobTokenIds": '["111", "222"]',
        }
    ],
}

game = parse_espn_event(espn_event, "nba")
assert game is not None
event = parse_pm_event(pm_event)
result = resolve("nba", game, event)

print("\ncandidate slugs:", candidate_slugs(game)[:4])
print("\nresolved:", result.resolved, "->", result.pm_event_slug)
print(json.dumps(result.to_dict(), indent=2))

# --- Online client ---------------------------------------------------------
#
# from espn_polymarket_map.client import EspnClient, map_game
# for g in EspnClient.scoreboard("nba"):
#     r = map_game(g)
#     print(g.espn_event_id, r.pm_event_slug, r.resolved)
