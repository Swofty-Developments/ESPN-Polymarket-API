# espn-polymarket-map (JavaScript / TypeScript)

Map ESPN scoreboard games to Polymarket prediction markets. This is one binding
of a **canonical cross-language port** — it produces byte-identical `MapResult`
JSON to the Rust reference implementation across the shared conformance corpus.

- Pure, deterministic algorithm (no network, no timezone library, no floats).
- Typed models for ESPN games, Polymarket events, and the resolved `MapResult`.
- An optional online client that uses the built-in `fetch` (Node 18+/24) — no
  third-party runtime dependencies.

The embedded crosswalk tables and slug templates are bundled in the package
(`dist/_data`) and loaded at runtime, so the library has the same data as the
reference no matter where it runs.

## Install

```sh
npm install espn-polymarket-map
```

Requires Node 18+ (the online client uses the global `fetch`). The offline
algorithm works anywhere ESM runs.

## Offline usage (the pure algorithm)

Feed a recorded ESPN scoreboard `event` and a Polymarket gamma `event` into
`resolve`. This is exactly what the conformance corpus exercises.

```ts
import { parseEspnEvent, parsePmEvent, resolve } from "espn-polymarket-map";

// `espnEventJson` is one element of an ESPN scoreboard `events[]` array.
// `pmEventJson`   is one Polymarket gamma `event` object.
const game = parseEspnEvent(espnEventJson, "fifa.world");
const event = parsePmEvent(pmEventJson);

const result = resolve("fifa.world", game!, event);
console.log(JSON.stringify(result, null, 2));
```

A resolved three-way (soccer) result looks like:

```json
{
  "resolved": true,
  "league": "fifa.world",
  "kind": "three_way",
  "espn_event_id": "760444",
  "pm_event_slug": "fifwc-bra-hai-2026-06-19",
  "pm_market_slug": null,
  "home": { "espn_abbr": "BRA", "name": "Brazil", "pm_code": "bra" },
  "away": { "espn_abbr": "HAI", "name": "Haiti", "pm_code": "hai" },
  "outcomes": [
    {
      "selection": "home",
      "team": "Brazil",
      "pm_market_slug": "fifwc-bra-hai-2026-06-19-bra",
      "pm_outcome": "Yes",
      "outcome_index": 0,
      "token_id": "1030410907...",
      "price": "0.885"
    }
    /* away, draw … */
  ]
}
```

`price` and `token_id` are always **strings copied verbatim** from Polymarket —
there are no floats anywhere in `MapResult`, so equality is exact and
language-independent.

## Online usage (built-in fetch)

```ts
import { EspnClient, PolymarketClient, mapGame } from "espn-polymarket-map";

// Today's NBA scoreboard, mapped to Polymarket.
const games = await EspnClient.scoreboard("nba");
for (const g of games) {
  const result = await mapGame(g);
  if (result.resolved) {
    console.log(g.away.displayName, "@", g.home.displayName, "→", result.pm_event_slug);
  }
}

// A specific UTC date (YYYYMMDD):
const onDate = await EspnClient.scoreboardOn("fifa.world", "20260619");

// Fetch a Polymarket event directly by slug:
const event = await PolymarketClient.eventBySlug("fifwc-bra-hai-2026-06-19");
```

`mapGame` tries each candidate slug (`candidateSlugs`) against the Polymarket
gamma API, then falls back to free-text search, returning the first `resolved`
result (or the best unresolved attempt for diagnostics).

## API

| Export | Description |
| --- | --- |
| `parseEspnEvent(json, league)` | Parse one ESPN scoreboard event → `EspnGame \| null`. |
| `parsePmEvent(json)` | Parse one Polymarket gamma event → `PmEvent`. |
| `resolve(league, game, event)` | The core mapping algorithm → `MapResult`. |
| `candidateSlugs(game)` | Ordered candidate Polymarket event slugs. |
| `candidateDates(kickoffUtc)` | Candidate US-Eastern slug dates. |
| `normalize(s)`, `tokens(s)`, `contentTokens(s)`, `teamMatches(names, text)` | Text primitives. |
| `teamCode`, `teamName`, `sideNames`, `abbrKey` | Crosswalk lookups. |
| `daysFromCivil`, `civilFromDays`, `parseUtc` | Calendar math (Howard Hinnant). |
| `EspnClient`, `PolymarketClient`, `mapGame`, `ClientError` | Online I/O layer. |
| Types | `EspnGame`, `EspnSide`, `PmEvent`, `PmMarket`, `MapResult`, `Outcome`, `TeamBlock`. |

## Development

```sh
npm install      # devDeps: typescript, @types/node
npm run build    # tsc src → dist (ESM + .d.ts) and copy dist/_data
npm test         # build, then run the corpus + unit tests on the compiled dist
```

`npm test` loads every case in `../../corpus/cases/*.json` and asserts
`resolve(...)` deep-equals the frozen `expected` `MapResult`, plus unit tests for
`normalize`, `teamMatches`, and the date math.
```
