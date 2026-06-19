# ESPN ↔ Polymarket Map

A canonical, continuously-verified crosswalk between **ESPN games** and **Polymarket markets**:
given an ESPN game, it tells you the Polymarket event slug, which outcome is "yes", and the token id
to trade — across **NBA, MLB, NHL, and the FIFA World Cup**. A daily canary hits the real APIs and
flags the moment the mapping drifts.

[![corpus](https://github.com/Swofty-Developments/ESPN-Polymarket-API/actions/workflows/corpus.yml/badge.svg)](https://github.com/Swofty-Developments/ESPN-Polymarket-API/actions/workflows/corpus.yml)
[![canary](https://github.com/Swofty-Developments/ESPN-Polymarket-API/actions/workflows/canary.yml/badge.svg)](https://github.com/Swofty-Developments/ESPN-Polymarket-API/actions/workflows/canary.yml)
[![license](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](#license--disclaimer)

The library ships in three languages — a Rust reference and native Python and JS ports — that all
produce **byte-identical results**, enforced by a shared conformance corpus on every commit.

## Install

> Registry publishing is pending the org's tokens; until then, install from this repo.

```sh
# Rust
cargo add espn-polymarket-map            # or: git = "https://github.com/Swofty-Developments/ESPN-Polymarket-API"

# Python
pip install espn-polymarket-map          # or: pip install "git+https://github.com/Swofty-Developments/ESPN-Polymarket-API#subdirectory=bindings/python"

# JavaScript / TypeScript
npm install espn-polymarket-map
```

## Usage

Map today's games against live Polymarket data. The clients use the public, keyless ESPN and
Polymarket endpoints — no API key, no secrets.

**TypeScript**

```ts
import { EspnClient, mapGame } from "espn-polymarket-map";

for (const game of await EspnClient.scoreboard("fifa.world")) {
  const r = await mapGame(game);
  console.log(`${game.away.abbr} @ ${game.home.abbr} -> ${r.pm_event_slug} (${r.resolved})`);
  for (const o of r.outcomes) console.log(` ${o.selection} ${o.price} ${o.token_id}`);
}
```

**Python**

```python
from espn_polymarket_map import EspnClient, map_game

for game in EspnClient.scoreboard("nba"):
    r = map_game(game)
    print(game.away.abbr, "@", game.home.abbr, "->", r.pm_event_slug, r.resolved)
    for o in r.outcomes:
        print(" ", o.selection, o.price, o.token_id)
```

**Rust**

```rust
use espn_polymarket_map::client::{map_game, EspnClient};

for game in EspnClient::scoreboard("mlb")? {
    let r = map_game(&game)?;
    println!("{} @ {} -> {} ({})", game.away.abbr, game.home.abbr, r.pm_event_slug, r.resolved);
}
```

Already have the payloads? Skip the network and call the **pure core** the corpus tests directly —
`parseEspnEvent` / `parsePmEvent` / `resolve` / `candidateSlugs` / `normalize` (snake_case in Rust
and Python). It is deterministic and offline.

## What you get back

`resolve` returns a `MapResult`. Outcome indices are resolved by **matching team names, never by
position**, so an `[away, home]` flip can't quote you the wrong side. `price` and `token_id` are
verbatim strings from Polymarket (no floats), so the result is identical across languages.

```jsonc
{
  "resolved": true,
  "league": "fifa.world",
  "kind": "three_way",                       // or "two_way" for NBA/MLB/NHL moneylines
  "espn_event_id": "760444",
  "pm_event_slug": "fifwc-bra-hai-2026-06-19",
  "pm_market_slug": null,                    // set for two_way; null for three_way
  "home": { "espn_abbr": "BRA", "name": "Brazil", "pm_code": "bra" },
  "away": { "espn_abbr": "HAI", "name": "Haiti",  "pm_code": "hai" },
  "outcomes": [
    { "selection": "home", "team": "Brazil", "pm_market_slug": "fifwc-bra-hai-2026-06-19-bra",
      "pm_outcome": "Yes", "outcome_index": 0, "token_id": "10304…4686", "price": "0.885" },
    { "selection": "away", "team": "Haiti",  "pm_market_slug": "fifwc-bra-hai-2026-06-19-hai", "…": "…" },
    { "selection": "draw", "team": null,     "pm_market_slug": "fifwc-bra-hai-2026-06-19-draw", "…": "…" }
  ]
}
```

## The hard cases it handles

The ESPN→Polymarket join is fragile in recurring ways. Each is a regression case in the corpus:

- **Team-code divergence** — ESPN's abbreviation is not Polymarket's code: `SA`→`sas`, `VGK`→`las`,
  `COD`→`cdr`, `CPV`→`cvi`. Curaçao is even coded `kor` on Polymarket (and South Korea is `kr`).
- **Word-order swaps** — ESPN `Congo DR` vs Polymarket `DR Congo`; matched by token set, not string.
- **Outcome-index flips** — Polymarket lists `[away, home]` for some sports; the side is resolved by name.
- **Name spelling** — ESPN `Cape Verde` vs Polymarket `Cabo Verde`; ESPN `South Korea` vs `Korea Republic`.
- **Date-basis drift** — Polymarket dates slugs by the **US-Eastern** day, so a `00:30Z` kickoff lands on
  the previous calendar date. Candidate dates cover Eastern, UTC, and ±1.
- **Market shape** — 2-way sports have one moneyline market `[teamA, teamB]`; soccer is three Yes/No legs
  (home / away / draw), each a separate market.

## How it works

The mapping is three different kinds of thing, verified three different ways:

| Layer | What | Verified by |
|---|---|---|
| **Data** | crosswalk tables + slug templates (`data/`) | JSON Schema + corpus |
| **Algorithm** | normalize → derive slug → match teams → resolve outcome | conformance corpus, offline, every commit |
| **I/O** | reacting to live ESPN/Polymarket changes | the canary, against real APIs, daily |

Almost all breakage is data drift or an upstream change — rarely an algorithm bug. The **corpus** is
the cross-language contract: each case is a recorded `{espn, polymarket} → expected` pair, and all
three implementations must reproduce every `expected` exactly (see [`corpus/README.md`](corpus/README.md)).
The full algorithm is specified in [`docs/architecture.md`](docs/architecture.md). A single compiled
core (PyO3 + WASM) was considered and rejected for v1: the algorithm is small, and native packages
adopt better than a wasm blob.

## Repository layout

```
data/        the product — crosswalk tables + slug templates (+ JSON Schema). single source of truth.
corpus/      the contract — recorded {espn, polymarket} -> expected cases, run by every language.
core-rs/     Rust reference implementation (offline core + optional HTTP clients).
bindings/    native ports: python/ and js/.
canary/      daily live-API verification job (run.mjs, classify.mjs) + status dashboard.
docs/        architecture.md (normative spec), adding-a-team-mapping.md (top contributor doc).
scripts/     seed-crosswalk.mjs (bootstrap data), sync-data.mjs (embed into bindings), validate-data.mjs.
```

## The data is the product

`data/crosswalk/<league>.json` is keyed by lowercased ESPN abbreviation:

```jsonc
"vgk": { "espn": "VGK", "pm": "las", "name": "Vegas Golden Knights",
         "aliases": ["golden knights", "vegas", "las vegas"] }
```

`pm` is the Polymarket slug code; `aliases` are extra labels used to match Polymarket outcome strings.
The data is versioned independently (`data/VERSION`) — a crosswalk fix is a data patch, not a library
release — and embedded into each binding at build time by `scripts/sync-data.mjs`.

## Live canary

A daily GitHub Action maps every live game and buckets each result, so the signal stays trustworthy
instead of flipping red on every upstream hiccup:

| Bucket | Meaning | Action |
|---|---|---|
| **outage** | ESPN/Polymarket 5xx / timeout / 403 | retry; dashboard yellow. Nothing is broken here. |
| **drift** | request succeeded but the payload shape changed | open an Issue — a human must change code. |
| **gap** | shape fine, but a live game/team didn't resolve | open a PR with the proposed crosswalk row filled in. |

The gap auto-PR ([`scripts/canary-followup.mjs`](scripts/canary-followup.mjs)) turns "discover in prod
after it broke" into "approve a one-line PR before kickoff." Status is published to a GitHub Pages
dashboard (`canary/dashboard/`); the canary no-ops gracefully off-season.

> Two repo settings enable the scheduled canary: Settings → Pages → Source = **GitHub Actions**, and
> Settings → Actions → Workflow permissions → **Read and write** + **Allow Actions to create PRs**.

## Contributing

Most contributions are a one-line data fix. See [`docs/adding-a-team-mapping.md`](docs/adding-a-team-mapping.md):
record a corpus case from the real payloads, add the crosswalk row, and CI proves it green in all three
languages. Run the suites with `cargo test` (Rust), `uv run --with pytest pytest` (Python), and
`npm test` (JS).

## License & disclaimer

Dual-licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your option.

This project consumes unofficial ESPN endpoints and Polymarket's public gamma API, and publishes a
crosswalk and code — not bulk ESPN/Polymarket data. It is not affiliated with or endorsed by ESPN or
Polymarket, and those endpoints may change or break without notice.
