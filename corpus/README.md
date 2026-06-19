# Conformance corpus

This is the **cross-language contract**. Each case is a recorded real-world input and its correct
output. Every implementation (Rust reference, Python, JS) runs the full corpus on every commit; a
green corpus means the implementations agree, by construction.

## Case format

One file per case, `cases/<name>.json`:

```jsonc
{
  "description": "human-readable: what failure mode this pins",
  "league": "fifa.world",                // key into data/slug-templates.json
  "espn":  { /* one recorded ESPN scoreboard `event` object */ },
  "polymarket": { /* one recorded Polymarket gamma `event` object (from /events?slug=...) */ },
  "expected": { /* the exact MapResult — see docs/architecture.md */ }
}
```

The runner does, for every case:

```
result = resolve(case.league, parse_espn_event(case.espn, case.league), parse_pm_event(case.polymarket))
assert deep_equal(result, case.expected)
```

There are **no floating-point values** in `expected` — `price` and `token_id` are verbatim strings —
so comparison is exact and language-independent.

## Rules

- **Record from real payloads, not hand-written stubs.** Real shapes are what break. Capture the
  slices straight from the live endpoints:
  ```sh
  curl 'https://site.api.espn.com/apis/site/v2/sports/<espn_path>/scoreboard?dates=YYYYMMDD'   # pick one .events[i]
  curl 'https://gamma-api.polymarket.com/events?slug=<slug>'                                    # take [0]
  ```
- **Every known historical failure mode gets a case.** The seed corpus already covers: word-order
  swaps (Congo DR ↔ DR Congo), the Curaçao=`kor` / Korea=`kr` code trap, ESPN→PM code divergences
  (SA→sas, VGK→las, CPV→cvi), ET-vs-UTC date rollover (±1 day), nickname vs full-name outcomes, and
  three-way home/away/draw legs.
- **Author `expected` from ground truth**, then confirm all three languages reproduce it. Don't
  regenerate `expected` from one implementation to make a test pass — that defeats the contract.

## Current cases

Twenty cases spanning all 15 leagues. The World Cup / NBA / MLB / NHL cases pin the trickiest
failure modes:

| File | Pins |
|------|------|
| `soccer-three-way-date-rollover` | 00:30Z kickoff → prior US-Eastern slug date; home-away order; 3 legs |
| `soccer-curacao-kor-trap` | Polymarket codes Curaçao as `kor` (not Korea) |
| `soccer-cape-verde-cabo-alias` | ESPN "Cape Verde" ↔ PM "Cabo Verde" via alias (CPV→cvi) |
| `soccer-congo-dr-word-order` | ESPN "Congo DR" ↔ PM "DR Congo" (COD→cdr) |
| `soccer-south-korea-kr-code` | ESPN South Korea ↔ PM "Korea Republic" (KOR→kr); date rollover |
| `nba-two-way-nickname-index` | nickname outcomes; SA→sas, NY→nyk; index resolution |
| `nhl-two-way-vgk-las-code` | VGK→las; date rollover; `[away, home]` outcomes |

The remaining cases lock one game per added league: `nfl-*`, `wnba-*` (moneyline in a `-moneyline`
suffixed market), `cfb-*`, `cbb-*`, and the soccer leagues `epl-*` (legs with `sportsMarketType:null`),
`ucl-*`, `laliga-*` (Real Madrid `rea` vs the shared-Madrid mis-join), `bundesliga-*` (Bayern `MUN→bay`),
`seriea-*`, `ligue1-*`, `mls-*`, plus `mlb-two-way-fullname-moneyline`.
