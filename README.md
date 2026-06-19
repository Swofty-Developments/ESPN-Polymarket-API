# ESPN ↔ Polymarket Map

Map an ESPN game to its Polymarket market — event slug, the "yes" outcome, and token id — across
**15 leagues**. One Rust reference plus native Python and JS ports, all **byte-identical** (enforced
by a shared corpus), with a daily canary that checks the real APIs.

[![corpus](https://github.com/Swofty-Developments/ESPN-Polymarket-API/actions/workflows/corpus.yml/badge.svg)](https://github.com/Swofty-Developments/ESPN-Polymarket-API/actions/workflows/corpus.yml)
[![canary](https://github.com/Swofty-Developments/ESPN-Polymarket-API/actions/workflows/canary.yml/badge.svg)](https://github.com/Swofty-Developments/ESPN-Polymarket-API/actions/workflows/canary.yml)
[![license](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](#license)

**Leagues** (the key you pass to `scoreboard` / the clients):

| Sport | Leagues |
|---|---|
| US (2-way moneyline) | `nfl` · `nba` · `wnba` · `mlb` · `nhl` · `college-football` · `mens-college-basketball` |
| Soccer (3-way home/away/draw) | `fifa.world` · `eng.1` (EPL) · `esp.1` (La Liga) · `ger.1` (Bundesliga) · `ita.1` (Serie A) · `fra.1` (Ligue 1) · `uefa.champions` (UCL) · `usa.1` (MLS) |

## Install

> Not on the registries yet — install from this repo for now.

```sh
cargo add espn-polymarket-map      # Rust
pip install espn-polymarket-map    # Python
npm install espn-polymarket-map    # JS / TS
```

## Usage

```ts
import { EspnClient, mapGame } from "espn-polymarket-map";

for (const game of await EspnClient.scoreboard("fifa.world")) {
  const r = await mapGame(game);
  console.log(`${game.away.abbr} @ ${game.home.abbr} -> ${r.pm_event_slug} (${r.resolved})`);
  for (const o of r.outcomes) console.log(` ${o.selection} ${o.price} ${o.token_id}`);
}
```

```python
from espn_polymarket_map import EspnClient, map_game

for game in EspnClient.scoreboard("nba"):
    r = map_game(game)
    print(game.away.abbr, "@", game.home.abbr, "->", r.pm_event_slug, r.resolved)
```

```rust
use espn_polymarket_map::client::{map_game, EspnClient};

for game in EspnClient::scoreboard("mlb")? {
    let r = map_game(&game)?;
    println!("{} -> {} ({})", game.espn_event_id, r.pm_event_slug, r.resolved);
}
```

The clients use the public, keyless ESPN and Polymarket endpoints. Already have the payloads? Call the
offline core directly — `parseEspnEvent` / `parsePmEvent` / `resolve` / `candidateSlugs` (snake_case
in Rust and Python).

## Result

```jsonc
{
  "resolved": true,
  "league": "fifa.world",
  "kind": "three_way",                       // "two_way" for NBA/MLB/NHL moneylines
  "pm_event_slug": "fifwc-bra-hai-2026-06-19",
  "home": { "espn_abbr": "BRA", "name": "Brazil", "pm_code": "bra" },
  "away": { "espn_abbr": "HAI", "name": "Haiti",  "pm_code": "hai" },
  "outcomes": [
    { "selection": "home", "team": "Brazil", "token_id": "10304…4686", "price": "0.885", "…": "…" },
    { "selection": "away", "team": "Haiti",  "…": "…" },
    { "selection": "draw", "team": null,     "…": "…" }
  ]
}
```

Indices resolve by team name (not position); `price` and `token_id` are verbatim strings, so output is
identical across languages. Full type/field reference: [`docs/architecture.md`](docs/architecture.md).

## Docs

- [`docs/architecture.md`](docs/architecture.md) — how resolution works (normalization, slug dates,
  outcome matching) and the exact `MapResult` schema.
- [`docs/adding-a-team-mapping.md`](docs/adding-a-team-mapping.md) — fix or add a team in one line.
- [`corpus/README.md`](corpus/README.md) — the recorded `{espn, polymarket} → expected` cases every
  language must pass.

## Develop

```sh
(cd core-rs && cargo test)                       # Rust reference
(cd bindings/python && uv run --with pytest pytest)
(cd bindings/js && npm test)
node canary/run.mjs                              # live check against the real APIs
```

## License

Dual-licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your option. Consumes
unofficial ESPN endpoints and Polymarket's public gamma API; not affiliated with or endorsed by either.
