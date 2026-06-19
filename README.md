# ESPN ↔ Polymarket Map

A canonical, continuously-verified crosswalk between **ESPN sports entities** and
**Polymarket markets** — team/athlete name normalization, market-slug derivation,
and outcome-index resolution — with a live conformance signal that hits the real
APIs every day and tells you the moment the mapping drifts.

> Status: design / planning. This README is the spec. No implementation yet.

---

## Why this exists

Anyone mirroring or arbing sports prediction markets has to answer one annoying
question over and over: *given an ESPN game, which Polymarket market is the same
event, and which outcome is "yes"?* There is no published, maintained answer. The
join is fragile in a handful of recurring ways:

1. **Team-name / abbreviation mismatches** — ESPN's abbreviation is not Polymarket's
   team code (`COD` vs `cdr`, `URU` vs `ury`), and full names get word-order-swapped
   (`Congo DR` vs `DR Congo`). Noisy country names defeat Polymarket's search.
2. **Outcome-index flips** — Polymarket lists outcomes `[away, home]`; if you assume
   `home` is index 0 you quote the wrong side of the book.
3. **Slug-format drift** — date basis (ET vs UTC, ±1 day), missing year, endpoint
   version changes.
4. **Market-type assumptions** — building a sub-market suffix from an abbreviation
   only ever matches the home team; 3-way soccer needs home/away/draw legs.
5. **Caching brittleness** — a market listed late (near kickoff) stays unresolved if
   a failed lookup is cached permanently.
6. **Upstream instability** — ESPN silently changes payload shapes; Polymarket
   returns 403s and reshapes search relevance.

Each of those is normally discovered *in production, minutes after it breaks*. This
project's job is to make every one of them a deterministic test failure or a
one-line reviewable PR **before** it costs anything.

### Scope

**In scope (public):** the mapping data, the normalization/resolution algorithm, the
conformance corpus, and the live verification job.

**Out of scope:** anything downstream of the mapping — trading, market-making,
order routing, private schemas. This library answers "which market, which outcome,"
and stops there.

---

## The core idea: three layers, three different problems

The "mapping" is really three different kinds of thing. Treating them separately is
the whole design.

| Layer | Examples | Cross-language? | How it's verified |
|---|---|---|---|
| **Data tables** | abbreviation crosswalks (`COD→cdr`), team aliases (`congo dr ↔ dr congo`), slug templates (`{league}-{away}-{home}-{date}`) | Trivially — it's just data | JSON Schema + corpus |
| **Algorithm** | normalize → template slug → candidate dates → token-match → resolve outcome index | Yes — one reference impl, others verified against the shared corpus | Conformance corpus (every commit) |
| **I/O adaptation** | reacting to ESPN payload-shape changes, Polymarket 403s / search reshuffles | No — this is reactive glue to opaque third parties | Live canary (daily, against real APIs) |

Almost all real-world breakage is **layer 1 (data drift)** or **layer 3 (upstream
changed)**. Very little is layer-2 algorithm bugs. That split drives the testing
strategy below.

### Two changers, two defenses

"Find every problem when the mapping changes" conflates two different *changers*:

- **A teammate edits the mapping** → caught by the **conformance corpus**: frozen
  (real ESPN payload + real Polymarket payload → expected output) cases that every
  language implementation must pass on every commit. Deterministic, fast, offline.
- **ESPN or Polymarket changes their data** → frozen fixtures can *never* catch
  this. Caught by the **live canary**: a scheduled job that hits the real APIs,
  runs the mapping, and asserts coverage/sanity on live games.

You need both. Neither alone is "finds all problems."

---

## Repository structure

```
espn-polymarket-map/
├── data/                          # THE PRODUCT — language-neutral source of truth
│   ├── schema/                    # JSON Schema for every data file below
│   │   ├── crosswalk.schema.json
│   │   └── slug-templates.schema.json
│   ├── crosswalk/                 # ESPN ↔ Polymarket entity tables, per sport
│   │   ├── soccer.json            # abbr ↔ PM code ↔ aliases (from _SOCCER_* tables)
│   │   ├── nba.json
│   │   ├── mlb.json
│   │   └── nhl.json
│   ├── slug-templates.json        # {league}-{away}-{home}-{date}, date-basis rules
│   └── VERSION                    # data semver — bumped on every crosswalk change
│
├── corpus/                        # THE CROSS-LANGUAGE CONTRACT
│   ├── cases/                     # one file per case: inputs → expected output
│   │   ├── soccer-congo-dr-word-order.json
│   │   ├── nba-outcome-index-flip.json
│   │   └── ...
│   └── README.md                  # how to record a new case
│
├── core-rs/                       # reference implementation (Rust)
│   ├── src/
│   └── Cargo.toml
│
├── bindings/
│   ├── python/                    # native port → published to PyPI
│   └── js/                        # native port → published to npm
│
├── canary/                        # the daily live-API verification job
│   ├── run.*                      # hit real ESPN + PM, run mapping, classify result
│   └── dashboard/                 # published status page (GitHub Pages)
│
├── docs/
│   ├── adding-a-team-mapping.md   # highest-leverage contributor doc
│   └── architecture.md
│
└── .github/workflows/
    ├── corpus.yml                 # runs the corpus across all langs on every push
    └── canary.yml                 # cron — runs the live check, publishes status
```

The **crown jewel is `data/`, not code.** The algorithm is small and stable; the
thing that rots daily is the crosswalk. Everything else is a thin wrapper around the
data.

---

## Cross-language strategy

Public adoption rewards **idiomatic native packages** — a Rust dev wants a real
crate, a Python dev wants a wheel that isn't secretly a wasm blob. So:

**One reference implementation + corpus-as-contract.**

- **Rust (`core-rs`)** is the reference implementation.
- **Python** and **JS** are real native ports published to PyPI / npm.
- All three are *required to pass the identical `corpus/cases/*.json`* in CI on every
  PR. The corpus **is** the spec. If a change makes Python disagree with the corpus,
  CI goes red. This is what lets the README claim "verified identical across
  languages" without shipping a compiled core to people who wanted a library.
- The `data/` tables are embedded into each binding at build time, so there is
  exactly one source for the crosswalk.

A single compiled core (Rust → PyO3 + WASM) was considered and **rejected for v1**:
the algorithm is ~300 lines, triple-maintenance is cheap, and native packages are
friendlier to adopt. Revisit only if the algorithm grows substantially complex or an
external consumer needs guaranteed bit-identical behavior.

---

## The conformance corpus

A corpus case is a recorded real-world input and its correct output:

```jsonc
// corpus/cases/soccer-congo-dr-word-order.json
{
  "description": "ESPN 'Congo DR' must match Polymarket 'DR Congo' despite word order",
  "espn":  { /* recorded ESPN scoreboard/summary slice */ },
  "polymarket": { /* recorded Polymarket gamma/search slice */ },
  "expected": {
    "pm_slug": "fifwc-cdr-mar-2026-06-20",
    "yes_index": 0,
    "resolved": true
  }
}
```

Rules:
- Cases are recorded from **real** API payloads, not hand-written stubs, so they
  capture the actual shapes that break.
- Every known historical failure mode gets a regression case (word-order swaps,
  index flips, late listings, missing year in slug, etc.).
- Every language implementation runs the full corpus. Green corpus = the
  implementations agree, by construction.

---

## The live canary

A scheduled GitHub Action (cron, e.g. each morning) that:

1. hits the **real** ESPN API for today's games,
2. hits the **real** Polymarket API,
3. runs the mapping on them,
4. asserts: every active game resolved to a PM market; every leg got a token; no
   market sits at an untraded 50%; `P(home) + P(away) ≈ 1`.

It needs **no secrets** — ESPN's `site.api` is keyless and Polymarket's gamma is
public — which is exactly what lets the whole job be public and reproducible.

### Failure classification (this is what makes the signal trustworthy)

A canary that flips red on every upstream hiccup is noise. Every failure is bucketed:

| Bucket | Meaning | Action |
|---|---|---|
| **Outage** | ESPN/PM returned 5xx / timeout / 403 | retry w/ backoff; if still down, mark dashboard **yellow**. No issue, no PR. Nothing is broken on our end. |
| **Drift** | request succeeded but the *shape* changed (missing field, enum became object) | **fail loud**, auto-open an **Issue**. A human must change code. |
| **Mapping gap** | shape fine, but an active game/team didn't resolve, or a leg got no token, or indices look inverted | auto-open a **PR** with the proposed crosswalk row already filled in. |

### Auto-PR for mapping gaps

When the canary finds an unmapped entity it can confidently guess (ESPN team `CPV`
unmapped; a live PM market's name contains "Cape Verde"), it **writes the data row
and opens a PR with a real diff**:

```diff
// data/crosswalk/soccer.json
     "cmr": { "espn": "CMR", "pm": "cmr", "name": "Cameroon" },
+    "cpv": { "espn": "CPV", "pm": "cpv", "name": "Cape Verde",
+             "aliases": ["cabo verde"] },
```

PR body: "canary saw ESPN game 401234 with team `CPV` unmapped; PM market
`fifwc-cpv-mex-2026-06-20` looks like the match; proposed row above." You review one
line and merge, or correct the guess and merge.

This turns "discover in prod 25 minutes after it broke" into "approve a one-line PR
before kickoff," and turns public maintenance into a contribution funnel: anyone can
fix a mapping without understanding the algorithm.

### Off-season / no-games

The canary must no-op gracefully when there are no live games (coverage = N/A, not
0% red), or it screams every off-season.

### Public dashboard

The canary publishes a GitHub Pages status page: per-sport coverage %, last-good
timestamp, open drift issues, and a history graph. The README badge reads the latest
run. "Green, and it checks real APIs every morning" is the trust signal.

---

## Versioning & releases

The **data** changes far more often than the **code**, so version it independently:

- `data/VERSION` is its own semver. A crosswalk fix is a **data patch release**, not
  a library release.
- Language bindings depend on a data version and re-release when they need a newer
  one.

This keeps each changelog honest — "added Cape Verde" is a data bump, not a v2.

---

## Contributing

The single most important doc is [`docs/adding-a-team-mapping.md`](docs/adding-a-team-mapping.md):

1. Record a corpus case from the real payloads.
2. Add the crosswalk row.
3. CI proves it (corpus passes in every language).

Because the canary auto-files gap PRs with the row already written, most mapping
contributions are "review one line and merge."

---

## Legal / ToS

This project consumes **unofficial** ESPN endpoints and Polymarket's public gamma
API. It publishes a *crosswalk and code* — not bulk ESPN/Polymarket data. It is not
affiliated with or endorsed by ESPN or Polymarket, and the upstream endpoints may
change or break without notice. Code is released under an OSI-approved license
(MIT/Apache-2.0); see `LICENSE`.

---

## Roadmap

- **v0.1** — `data/` schema + soccer/NBA/MLB/NHL crosswalks; Rust reference impl;
  conformance corpus seeded from known historical failures.
- **v0.2** — Python binding on PyPI; corpus CI across Rust + Python.
- **v0.3** — live canary with failure classification + Pages dashboard.
- **v0.4** — auto-PR funnel for mapping gaps.
- **v0.5** — JS binding on npm once the corpus contract is proven.
- **Later** — additional sports; reconsider a compiled shared core only if needed.
