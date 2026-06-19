# Adding or fixing a team mapping

This is the highest-leverage contribution. Because the algorithm is small and stable, almost all
real breakage is **data drift** — a team ESPN and Polymarket spell or code differently. Fixing it
is a one- or two-line data change plus a regression case. You do **not** need to understand the
resolver.

> The live canary auto-opens most of these PRs with the row already filled in (see
> [architecture.md](./architecture.md)). When that happens, you're just reviewing one line.

## The shape of a mapping

Each league has a crosswalk at `data/crosswalk/<stem>.json`, keyed by **lowercased ESPN
abbreviation**:

```jsonc
"vgk": {
  "espn": "VGK",                       // ESPN abbreviation, verbatim (case-sensitive)
  "pm": "las",                         // Polymarket slug code (Vegas is "las", not "vgk"!)
  "name": "Vegas Golden Knights",      // canonical display name
  "aliases": ["golden knights", "vegas", "las vegas"]   // extra labels to match PM outcomes/legs
}
```

- **`pm`** is what appears in the Polymarket slug (`nhl-car-`**`las`**`-2026-06-14`) and, for soccer,
  the leg suffix (`fifwc-bra-hai-...-`**`bra`**). Default would be `lowercase(espn)`; only list teams
  where they differ — but the file lists every team for clarity.
- **`aliases`** are normalized (lowercased, diacritics stripped) name variants used to match the
  Polymarket **outcome string** (two-way) or **leg `groupItemTitle`** (three-way). Add one whenever
  ESPN and Polymarket use *different words* for the same team (e.g. ESPN "Cape Verde" vs Polymarket
  "Cabo Verde"). You do **not** need an alias for mere word-order swaps ("Congo DR" vs "DR Congo") —
  matching is token-set based and order-independent.

## Step by step

1. **Find the divergence.** Look at the real payloads:
   - ESPN: `https://site.api.espn.com/apis/site/v2/sports/<espn_path>/scoreboard`
   - Polymarket: `https://gamma-api.polymarket.com/public-search?q=<team>` then
     `https://gamma-api.polymarket.com/events?slug=<slug>` (inspect `slug`, `outcomes`,
     `groupItemTitle`).
2. **Edit the crosswalk row** in `data/crosswalk/<stem>.json`. Fix `pm` and/or add an `aliases`
   entry. Bump `data/VERSION` (a crosswalk fix is a *data* patch release).
3. **Sync the embedded copies:** `node scripts/sync-data.mjs`.
4. **Add a regression case** (see [`corpus/README.md`](../corpus/README.md)) recorded from the real
   payloads, so this exact failure can never silently return.
5. **Prove it across languages:**
   ```sh
   (cd core-rs && cargo test)
   (cd bindings/python && uv run --with pytest pytest)
   (cd bindings/js && npm test)
   ```
   Green corpus in all three = the implementations agree, by construction.

## Worked example: Curaçao is `kor`

Polymarket codes **Curaçao** as `kor` (yes — the code that *looks* like South Korea) and **South
Korea** as `kr`. Assuming `kor`=Korea would silently quote the wrong country. The crosswalk encodes
the truth:

```jsonc
// data/crosswalk/soccer.json
"cuw": { "espn": "CUW", "pm": "kor", "name": "Curaçao", "aliases": [] },
"kor": { "espn": "KOR", "pm": "kr",  "name": "South Korea", "aliases": ["korea republic", "south korea"] }
```

and the regression case `corpus/cases/soccer-curacao-kor-trap.json` pins it. This is exactly the
class of bug this project exists to make a deterministic test failure instead of a production
surprise.
