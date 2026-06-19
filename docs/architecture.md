# Architecture

This document is the **normative specification** of the mapping algorithm. Every language
implementation (Rust reference, Python, JS) MUST produce byte-identical `MapResult` JSON for
the conformance corpus. When this document and an implementation disagree, the corpus is the
tie-breaker and one of them is a bug.

## Three layers

| Layer | What | Where verified |
|-------|------|----------------|
| **Data** | crosswalk tables, slug templates | JSON Schema + corpus |
| **Algorithm** | normalize → derive slug → match → resolve outcome index | conformance corpus (offline, every commit) |
| **I/O** | hitting real ESPN / Polymarket, retries, search fallback | live canary (daily) |

The corpus tests the **pure algorithm** only: it feeds a recorded ESPN slice and a recorded
Polymarket event slice into `resolve(...)` and asserts the `MapResult`. No network. The I/O
layer (clients) is exercised by the canary, not the corpus.

## Data files (`data/`)

- `data/slug-templates.json` — per-league config: `espn_path`, `pm_prefix`, `kind`
  (`two_way` | `three_way`), `slug_order` (`away_home` | `home_away`), `date_basis` (`et`),
  `crosswalk` (file stem).
- `data/crosswalk/<stem>.json` — `teams` keyed by lowercased ESPN abbreviation; each entry has
  `espn` (raw abbr), `pm` (Polymarket code), `name` (canonical), `aliases` (normalized name
  variants for outcome matching).

Bindings embed a copy of `data/` at build time (`scripts/sync-data.mjs` keeps copies fresh;
Rust uses `include_str!`). There is exactly one source of truth: `data/`.

## Primitives (must be identical in every language)

### `normalize(s) -> string`
1. Unicode NFD normalize.
2. Remove combining marks (code points U+0300..U+036F).
3. Lowercase.
4. Replace every maximal run of characters **not** in `[a-z0-9]` with a single space.
5. Trim leading/trailing spaces.

`tokens(s)` = `normalize(s)` split on space, dropping empties.

`STOPWORDS = {"and", "the", "of", "fc", "sc", "afc", "cf"}`

`content_tokens(s)` = `tokens(s)` minus `STOPWORDS`; **but** if that becomes empty, fall back to
`tokens(s)` (so a team literally named "The" still has tokens).

### `team_matches(names, text) -> bool`
`names` is a list of candidate strings for one side (see `side_names`). Let `P = content_tokens(text)`.
If `P` is empty, return `false`. For each `n` in `names` with `C = content_tokens(n)` non-empty:
if `C ⊆ P` **or** `P ⊆ C` (set subset, order-independent), return `true`. Else `false`.

> This single rule handles word-order swaps (`{dr,congo} == {congo,dr}`), nickname-only
> outcomes (`{knicks} ⊆ {new,york,knicks}`), and full-name outcomes (exact set equality).

### Date candidates — `candidate_dates(kickoff_utc) -> [YYYY-MM-DD]`
Polymarket dates slugs by the **US-Eastern calendar date** of kickoff. We avoid a timezone
library (for cross-language determinism) by estimating Eastern as `UTC − 5h` and also trying the
UTC date and ±1 day — the Eastern date is always either the UTC date or one day earlier, and the
extra candidates cover any residual drift.

Parse `kickoff_utc` (RFC3339, UTC) into `(y, mo, d, h, mi)`. Using the civil-day helpers below:
```
days       = days_from_civil(y, mo, d)
minutes    = days*1440 + h*60 + mi
et_date    = civil_from_days(floor((minutes - 300) / 1440))   # UTC-5 estimate
utc_date   = (y, mo, d)
candidates = dedup_preserving_order([ et_date, utc_date, et_date - 1day, utc_date + 1day ])
```
Each formatted `YYYY-MM-DD` (zero-padded). `± 1day` is done via `days_from_civil ± 1` →
`civil_from_days`.

`days_from_civil` / `civil_from_days` are Howard Hinnant's algorithms (integer math, exact):
```
days_from_civil(y, m, d):
    y -= (m <= 2)
    era = (y >= 0 ? y : y-399) / 400            # integer division toward -inf via this form
    yoe = y - era*400                            # [0, 399]
    doy = (153*(m + (m > 2 ? -3 : 9)) + 2)/5 + d - 1   # [0, 365]
    doe = yoe*365 + yoe/4 - yoe/100 + doy        # [0, 146096]
    return era*146097 + doe - 719468

civil_from_days(z):
    z += 719468
    era = (z >= 0 ? z : z - 146096) / 146097
    doe = z - era*146097                         # [0, 146096]
    yoe = (doe - doe/1460 + doe/36524 - doe/146096) / 365   # [0, 399]
    y   = yoe + era*400
    doy = doe - (365*yoe + yoe/4 - yoe/100)      # [0, 365]
    mp  = (5*doy + 2)/153                         # [0, 11]
    d   = doy - (153*mp + 2)/5 + 1               # [1, 31]
    m   = mp + (mp < 10 ? 3 : -9)                # [1, 12]
    return (y + (m <= 2 ? 1 : 0), m, d)
```
All divisions are integer (floor for non-negative operands, which is all we need here).

### Team codes — `team_code(league, espn_abbr)`
Key = `normalize(espn_abbr)` with spaces removed. If `crosswalk[league].teams[key]` exists, return
its `pm`; else return the key (i.e. lowercased abbreviation). `crosswalk_entry(league, espn_abbr)`
returns the full entry or none.

### `side_names(espn_side, entry) -> [string]`
Collect, de-duplicated and non-empty: `espn_side.display_name`, `.short_name`, `.location`,
`.nickname`, and if `entry` present `entry.name` plus every `entry.aliases`.

## Input parsing

### `parse_espn_event(json, league) -> EspnGame`
`json` is one scoreboard `event`. `comp = json.competitions[0]`. `kickoff_utc = comp.date ?? json.date`.
From `comp.competitors`, the entry with `homeAway == "home"` is `home`, `"away"` is `away`. Each side:
`abbr = team.abbreviation`, `display_name = team.displayName`, `short_name = team.shortDisplayName`,
`location = team.location`, `nickname = team.name`. `espn_event_id = json.id`.

### `parse_pm_event(json) -> PmEvent`
`slug`, `title`, and `markets[]`. Polymarket encodes `outcomes`, `outcomePrices`, `clobTokenIds`
as **JSON strings** — parse each into a string array. Each market keeps: `slug`, `question`,
`group_item_title` (`groupItemTitle`), `sports_market_type` (`sportsMarketType`), `outcomes[]`,
`outcome_prices[]` (strings, verbatim), `clob_token_ids[]`.

## `resolve(league, espn_game, pm_event) -> MapResult`

```
cfg        = templates.leagues[league]
home_entry = crosswalk_entry(league, espn_game.home.abbr)
away_entry = crosswalk_entry(league, espn_game.away.abbr)
home_names = side_names(espn_game.home, home_entry)
away_names = side_names(espn_game.away, away_entry)
```
`home_block = { espn_abbr: home.abbr, name: home_entry?.name ?? home.display_name, pm_code: team_code(league, home.abbr) }` (same for away).

### two_way
- Moneyline market `ml` = the market whose `slug == pm_event.slug`; else the first with
  `sports_market_type == "moneyline"`; else none → `resolved=false`, `outcomes=[]`.
- For each index `i` in `ml.outcomes`: if `team_matches(home_names, ml.outcomes[i])` → side `home`;
  else if `team_matches(away_names, …)` → side `away`; else `none`.
- If exactly one index maps to `home` and one to `away` (distinct): `resolved=true` and emit one
  outcome per index **in ascending index order**:
  ```
  { selection: side(i), team: (side==home? home_block.name : away_block.name),
    pm_market_slug: ml.slug, pm_outcome: ml.outcomes[i], outcome_index: i,
    token_id: ml.clob_token_ids[i], price: ml.outcome_prices[i] }
  ```
  Else `resolved=false`, `outcomes=[]`.
- `pm_market_slug` (top level) = `ml.slug`.

### three_way
- `is_draw(m)` = `m.slug` ends with `-draw` OR `normalize(group_item_title)` starts with `draw`.
- Walk `pm_event.markets`. For each non-draw market, `label = group_item_title ?? question`; if
  `team_matches(home_names, label)` → home leg; else if `team_matches(away_names, label)` → away leg.
  Draw markets → draw leg. First match per slot wins.
- Each leg emits (its "Yes" side, index 0):
  ```
  { selection, team: (home/away name | null for draw), pm_market_slug: m.slug,
    pm_outcome: m.outcomes[0], outcome_index: 0,
    token_id: m.clob_token_ids[0], price: m.outcome_prices[0] }
  ```
- `resolved = home leg found AND away leg found`. `outcomes` ordered `[home, away, draw]`
  (draw included only if found). `pm_market_slug` (top level) = `null`.

### MapResult JSON shape
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
  "outcomes": [ /* see above */ ]
}
```
Field order is irrelevant (corpus compares structurally). `price` and `token_id` are **strings**
copied verbatim from Polymarket — there are no floats in `MapResult`, so equality is exact and
language-independent.

## I/O layer (clients — not corpus-tested)

`candidate_slugs(league, espn_game)`: `pairs = slug_order==away_home ? [[away,home],[home,away]] :
[[home,away],[away,home]]` (codes via `team_code`); for each `date` in `candidate_dates`, for each
`[x,y]` in `pairs`, emit `"{pm_prefix}-{x}-{y}-{date}"`; dedup preserving order.

`map_game(espn_game)` (online): for each candidate slug, GET
`https://gamma-api.polymarket.com/events?slug=<slug>`; on the first non-empty response, run
`resolve`; if `resolved`, return it. Fallback: `GET /public-search?q=<away> <home>` and try
`fifwc-`/`<prefix>-` event hits. ESPN scoreboards: `GET https://site.api.espn.com/apis/site/v2/
sports/<espn_path>/scoreboard?dates=YYYYMMDD`. Both APIs are keyless/public.

## Failure classification (canary)

- **Outage** — 5xx / timeout / 403 → retry; dashboard yellow; no issue.
- **Drift** — 200 but shape changed (missing field, JSON-string field not parseable) → open Issue.
- **Mapping gap** — shape fine but a live game didn't resolve, or a leg got no token → open auto-PR
  with the proposed crosswalk row.
