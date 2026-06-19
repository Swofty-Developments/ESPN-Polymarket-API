"""Crosswalk lookups: ESPN abbreviation -> Polymarket code, and match-name collection."""

from __future__ import annotations

from typing import List

from .data import abbr_key, data
from .models import EspnSide

__all__ = ["team_code", "team_name", "side_names", "crosswalk_entry"]


def crosswalk_entry(league: str, espn_abbr: str):
    """Return the full crosswalk entry for an ESPN abbreviation, or ``None``."""
    return data().crosswalk_entry(league, espn_abbr)


def team_code(league: str, espn_abbr: str) -> str:
    """Polymarket team code for an ESPN abbreviation, falling back to the
    lowercased abbreviation.
    """
    entry = data().crosswalk_entry(league, espn_abbr)
    if entry is not None:
        return entry.pm
    return abbr_key(espn_abbr)


def team_name(league: str, side: EspnSide) -> str:
    """Canonical display name: crosswalk name if known, else the ESPN display name."""
    entry = data().crosswalk_entry(league, side.abbr)
    if entry is not None:
        return entry.name
    return side.display_name


def side_names(league: str, side: EspnSide) -> List[str]:
    """All candidate strings used to match a Polymarket outcome/leg label to this side."""
    names: List[str] = []

    def push(s: str) -> None:
        s = s.strip()
        if s and s not in names:
            names.append(s)

    push(side.display_name)
    push(side.short_name)
    push(side.location)
    push(side.nickname)
    entry = data().crosswalk_entry(league, side.abbr)
    if entry is not None:
        push(entry.name)
        for a in entry.aliases:
            push(a)
    return names
