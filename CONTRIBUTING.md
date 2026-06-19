# Contributing

Thanks for helping keep the ESPN ↔ Polymarket map honest.

## The 90% case: a team mapping

If a team didn't resolve, or resolved to the wrong side, it's almost always **data drift**. Follow
[`docs/adding-a-team-mapping.md`](docs/adding-a-team-mapping.md): edit one crosswalk row, add a
regression case, prove it green in all three languages. You don't need to touch the algorithm.

## Repository layout

```
data/        THE PRODUCT — crosswalk tables + slug templates (+ JSON Schema). Single source of truth.
corpus/      THE CONTRACT — recorded {espn, polymarket} -> expected cases, run by every language.
core-rs/     Rust reference implementation.
bindings/    Native ports: python/ (PyPI), js/ (npm).
canary/      Daily live-API verification job + status dashboard.
docs/        architecture.md (normative spec) + adding-a-team-mapping.md.
scripts/     seed-crosswalk.mjs (bootstrap), sync-data.mjs (embed data into bindings).
```

## Local setup & tests

```sh
# Rust reference (also runs the corpus)
cd core-rs && cargo test && cargo clippy --all-targets && cargo fmt --check

# Python binding
cd bindings/python && uv run --with pytest pytest

# JS binding
cd bindings/js && npm install && npm test

# Canary (live; safe to run, hits only public/keyless endpoints)
node canary/run.mjs
```

## Rules of the road

- **`data/` is the source of truth.** After editing it, run `node scripts/sync-data.mjs` and commit
  the synced copies. CI fails if they're stale.
- **The algorithm is specified in `docs/architecture.md`.** Any change to resolution logic must land
  in all three implementations and keep the corpus green. The corpus is the tie-breaker.
- **Record corpus cases from real payloads**, never hand-written stubs. See
  [`corpus/README.md`](corpus/README.md).
- **Versioning:** `data/VERSION` is its own semver — a crosswalk fix is a data patch, not a library
  release.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `<type>[scope]: <description>`
(lowercase, imperative). Keep changes in small, logical commits.

## Legal

This project consumes unofficial ESPN endpoints and Polymarket's public gamma API and is not
affiliated with either. Contributions are dual-licensed under MIT and Apache-2.0.
