/**
 * Unit tests for the cross-language primitives: normalize, team_matches, and
 * the calendar / date-candidate math. These mirror the Rust reference tests.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalize,
  teamMatches,
  candidateDates,
  daysFromCivil,
  civilFromDays,
} from "../dist/index.js";

test("normalize: diacritics and punctuation", () => {
  assert.strictEqual(normalize("Türkiye"), "turkiye");
  assert.strictEqual(normalize("Curaçao"), "curacao");
  assert.strictEqual(normalize("Côte d'Ivoire"), "cote d ivoire");
  assert.strictEqual(normalize("  San  Antonio  "), "san antonio");
});

test("teamMatches: word-order swap", () => {
  assert.ok(teamMatches(["Congo DR"], "DR Congo"));
});

test("teamMatches: nickname subset and non-match", () => {
  assert.ok(teamMatches(["New York Knicks"], "Knicks"));
  assert.ok(!teamMatches(["New York Knicks"], "Brooklyn Nets"));
});

test("teamMatches: empty text does not match", () => {
  assert.ok(!teamMatches(["Brazil"], ""));
});

test("datecalc: civil round-trip", () => {
  for (const [y, m, d] of [
    [2026, 6, 20],
    [2026, 1, 1],
    [1999, 12, 31],
    [2024, 2, 29],
  ] as [number, number, number][]) {
    const z = daysFromCivil(y, m, d);
    assert.deepStrictEqual(civilFromDays(z), [y, m, d]);
  }
});

test("candidateDates: eastern rollover", () => {
  const c = candidateDates("2026-06-20T00:30Z");
  assert.strictEqual(c[0], "2026-06-19");
  assert.ok(c.includes("2026-06-20"));
});

test("candidateDates: daytime same day", () => {
  const c = candidateDates("2026-06-15T16:00Z");
  assert.strictEqual(c[0], "2026-06-15");
});
