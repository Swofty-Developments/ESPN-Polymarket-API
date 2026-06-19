/**
 * Conformance corpus: every case in `corpus/cases/*.json` must resolve to its
 * frozen `expected` MapResult. This is the cross-language contract; the Rust
 * and Python bindings run the identical corpus.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseEspnEvent, parsePmEvent, resolve } from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
// dist-test -> bindings/js -> bindings -> repo root -> corpus/cases
const CORPUS_DIR = join(HERE, "..", "..", "..", "corpus", "cases");

interface Case {
  description?: string;
  league: string;
  espn: unknown;
  polymarket: unknown;
  expected: unknown;
}

test("corpus matches expected MapResult", async (t) => {
  const files = readdirSync(CORPUS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  assert.ok(files.length > 0, `no corpus cases found in ${CORPUS_DIR}`);

  for (const f of files) {
    const name = f.replace(/\.json$/, "");
    await t.test(name, () => {
      const c = JSON.parse(readFileSync(join(CORPUS_DIR, f), "utf8")) as Case;
      const game = parseEspnEvent(c.espn, c.league);
      assert.ok(game !== null, `${name}: failed to parse espn slice`);
      const event = parsePmEvent(c.polymarket);
      const got = resolve(c.league, game, event);
      // Compare as parsed objects (round-trip through JSON to normalize the
      // serialized shape against the frozen `expected`); deepStrictEqual is
      // structural and order-independent.
      assert.deepStrictEqual(JSON.parse(JSON.stringify(got)), c.expected);
    });
  }
});
