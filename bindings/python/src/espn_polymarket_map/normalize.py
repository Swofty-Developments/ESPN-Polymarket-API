"""Text normalization and order-independent team matching.

These functions are part of the cross-language contract -- see ``docs/architecture.md``.
"""

from __future__ import annotations

import unicodedata
from typing import List, Sequence

__all__ = ["normalize", "tokens", "content_tokens", "team_matches", "STOPWORDS"]

STOPWORDS = frozenset({"and", "the", "of", "fc", "sc", "afc", "cf"})


def normalize(s: str) -> str:
    """NFD-normalize, strip combining marks (U+0300..U+036F), lowercase, and
    collapse any run of non-``[a-z0-9]`` characters into a single space; trim.
    """
    out: List[str] = []
    prev_space = True  # suppress leading spaces
    for ch in unicodedata.normalize("NFD", s):
        cp = ord(ch)
        if 0x300 <= cp <= 0x36F:
            continue  # combining mark
        # ASCII lowercase mirrors Rust's char::to_ascii_lowercase (only A-Z fold).
        if "A" <= ch <= "Z":
            lower = ch.lower()
        else:
            lower = ch
        if ("a" <= lower <= "z") or ("0" <= lower <= "9"):
            out.append(lower)
            prev_space = False
        else:
            # Any other character (ASCII punctuation/space or surviving non-ASCII
            # letter) collapses to a single space.
            if not prev_space:
                out.append(" ")
                prev_space = True
    result = "".join(out)
    if result.endswith(" "):
        result = result[:-1]
    return result


def tokens(s: str) -> List[str]:
    """Split into non-empty whitespace tokens of the normalized string."""
    return [t for t in normalize(s).split(" ") if t]


def content_tokens(s: str) -> List[str]:
    """Tokens with stopwords removed; falls back to all tokens if removal empties the set."""
    all_tokens = tokens(s)
    filtered = [t for t in all_tokens if t not in STOPWORDS]
    return filtered if filtered else all_tokens


def _is_subset(a: Sequence[str], b: Sequence[str]) -> bool:
    return bool(a) and all(t in b for t in a)


def team_matches(names: Sequence[str], text: str) -> bool:
    """True if ``text`` refers to the same entity as one of ``names``
    (order-independent token subset).
    """
    p = content_tokens(text)
    if not p:
        return False
    for n in names:
        c = content_tokens(n)
        if not c:
            continue
        if _is_subset(c, p) or _is_subset(p, c):
            return True
    return False
