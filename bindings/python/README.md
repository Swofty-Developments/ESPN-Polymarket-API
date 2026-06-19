# espn-polymarket-map (Python)

Canonical crosswalk between **ESPN** sports entities and **Polymarket** markets:
team-name normalization, market-slug derivation, and outcome-index resolution.

This is the Python binding of `espn-polymarket-map`. It is a native port of the
Rust reference implementation and is verified against the same frozen conformance
corpus, producing **byte-identical** `MapResult` JSON. The runtime depends only on
the Python standard library (no third-party packages); the online client uses
`urllib.request`.

- Import path: `espn_polymarket_map`
- Distribution name: `espn-polymarket-map`
- Python: 3.9+

## Install

```bash
pip install espn-polymarket-map
```

From a checkout of this repo, for development:

```bash
# inside bindings/python
uv run --project . python -c "import espn_polymarket_map; print(espn_polymarket_map.data_version())"
```

The embedded data tables (`slug-templates.json`, `crosswalk/*.json`, `VERSION`)
are packaged inside `espn_polymarket_map/_data` and loaded from there at runtime.

## Offline core (the contract)

```python
from espn_polymarket_map import parse_espn_event, parse_pm_event, resolve

game = parse_espn_event(espn_scoreboard_event, "fifa.world")   # one ESPN event dict
event = parse_pm_event(polymarket_gamma_event)                  # one Polymarket event dict
result = resolve("fifa.world", game, event)

print(result.resolved, result.pm_event_slug)
print(result.to_dict())   # exact corpus JSON shape (snake_case keys)
```

`MapResult.to_dict()` yields the contract shape. `price` and `token_id` are
**strings** copied verbatim from Polymarket — there are no floats anywhere in the
result, so equality is exact and language-independent.

### Primitives

```python
from espn_polymarket_map import normalize, team_matches, candidate_dates, candidate_slugs

normalize("Côte d'Ivoire")            # -> "cote d ivoire"
team_matches(["Congo DR"], "DR Congo")  # -> True  (order-independent)
candidate_dates("2026-06-20T00:30Z")    # -> ["2026-06-19", "2026-06-20", ...]
candidate_slugs(game)                    # -> ["fifwc-bra-hai-2026-06-19", ...]
```

## Online client

The client hits the public, keyless ESPN and Polymarket endpoints using only the
standard library.

```python
from espn_polymarket_map.client import EspnClient, PolymarketClient, map_game

# ESPN scoreboards
games = EspnClient.scoreboard("nba")              # today
games = EspnClient.scoreboard_on("nba", "20260613")  # a specific UTC date

# Polymarket gamma
event = PolymarketClient.event_by_slug("nba-nyk-sas-2026-06-13")
events = PolymarketClient.search("Knicks Spurs")

# End-to-end: candidate-slug lookups, then a search fallback.
for game in EspnClient.scoreboard("nba"):
    result = map_game(game)
    print(game.espn_event_id, result.pm_event_slug, result.resolved)
```

A full runnable example lives in [`examples/usage.py`](examples/usage.py):

```bash
uv run --project . python examples/usage.py
```

## Testing

The corpus test loads `corpus/cases/*.json` from the repo and asserts
`resolve(...).to_dict()` deep-equals each case's `expected` object. Unit tests
cover `normalize`, the date math, `team_matches`, and crosswalk lookups.

```bash
# inside bindings/python
uv run --with pytest pytest
```
