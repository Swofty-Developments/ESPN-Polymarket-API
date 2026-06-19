/**
 * Text normalization and order-independent team matching.
 *
 * These functions are part of the cross-language contract — see
 * `docs/architecture.md` and the Rust reference (`core-rs/src/normalize.rs`).
 */

const STOPWORDS = new Set(["and", "the", "of", "fc", "sc", "afc", "cf"]);

/**
 * NFD-normalize, strip combining marks (U+0300..U+036F), lowercase, and collapse
 * any run of non-`[a-z0-9]` characters into a single space; trim ends.
 */
export function normalize(s: string): string {
  // NFD decomposition so diacritics become base char + combining mark.
  const decomposed = s.normalize("NFD");
  let out = "";
  let prevSpace = true; // suppress leading spaces
  for (const ch of decomposed) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x300 && cp <= 0x36f) {
      continue; // combining mark
    }
    const lower = asciiLower(ch);
    if (isAsciiAlphanumeric(lower)) {
      out += lower;
      prevSpace = false;
    } else {
      // Any non-alphanumeric (ASCII punctuation/space or surviving non-ASCII
      // letter) collapses to a single separating space.
      if (!prevSpace) {
        out += " ";
        prevSpace = true;
      }
    }
  }
  if (out.endsWith(" ")) {
    out = out.slice(0, -1);
  }
  return out;
}

/** ASCII-only lowercasing (matches Rust `to_ascii_lowercase`): A-Z -> a-z, else unchanged. */
function asciiLower(ch: string): string {
  const cp = ch.codePointAt(0)!;
  if (cp >= 0x41 && cp <= 0x5a) {
    return String.fromCharCode(cp + 0x20);
  }
  return ch;
}

function isAsciiAlphanumeric(ch: string): boolean {
  if (ch.length !== 1) return false;
  const cp = ch.charCodeAt(0);
  return (
    (cp >= 0x30 && cp <= 0x39) || // 0-9
    (cp >= 0x61 && cp <= 0x7a) // a-z (already lowercased)
  );
}

/** Split into non-empty whitespace tokens of the normalized string. */
export function tokens(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((t) => t.length > 0);
}

/** Tokens with stopwords removed; falls back to all tokens if removal empties the set. */
export function contentTokens(s: string): string[] {
  const all = tokens(s);
  const filtered = all.filter((t) => !STOPWORDS.has(t));
  return filtered.length === 0 ? all : filtered;
}

/** True iff `a` is a non-empty subset of `b` (every token in `a` is in `b`). */
function isSubset(a: string[], b: string[]): boolean {
  if (a.length === 0) return false;
  const bset = new Set(b);
  return a.every((t) => bset.has(t));
}

/**
 * True if `text` refers to the same entity as one of `names`
 * (order-independent token subset, either direction).
 */
export function teamMatches(names: string[], text: string): boolean {
  const p = contentTokens(text);
  if (p.length === 0) return false;
  for (const n of names) {
    const c = contentTokens(n);
    if (c.length === 0) continue;
    if (isSubset(c, p) || isSubset(p, c)) return true;
  }
  return false;
}
