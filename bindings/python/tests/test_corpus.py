"""Conformance corpus test.

Loads every frozen case in ``corpus/cases/*.json`` and asserts that
``resolve(league, parse_espn_event(case.espn), parse_pm_event(case.polymarket))``
serialized via ``to_dict()`` deep-equals the case's ``expected`` object.

The comparison is structural (parsed dicts), never a string compare.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import List

import pytest

from espn_polymarket_map import parse_espn_event, parse_pm_event, resolve

# tests/ -> python/ -> bindings/ -> repo root -> corpus/cases
CORPUS_DIR = Path(__file__).resolve().parents[3] / "corpus" / "cases"


def _case_files() -> List[Path]:
    return sorted(CORPUS_DIR.glob("*.json"))


def test_corpus_dir_exists() -> None:
    assert CORPUS_DIR.is_dir(), f"corpus dir not found: {CORPUS_DIR}"
    assert _case_files(), "no corpus cases discovered"


@pytest.mark.parametrize("case_path", _case_files(), ids=lambda p: p.stem)
def test_corpus_case(case_path: Path) -> None:
    with case_path.open(encoding="utf-8") as fh:
        case = json.load(fh)

    league = case["league"]
    game = parse_espn_event(case["espn"], league)
    assert game is not None, f"failed to parse ESPN event for {case_path.name}"
    event = parse_pm_event(case["polymarket"])
    result = resolve(league, game, event)

    assert result.to_dict() == case["expected"], (
        f"mismatch for {case_path.name}\n"
        f"got:      {json.dumps(result.to_dict(), sort_keys=True)}\n"
        f"expected: {json.dumps(case['expected'], sort_keys=True)}"
    )
