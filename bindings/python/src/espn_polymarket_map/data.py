"""Embedded data tables (crosswalk + slug templates), parsed once on first use.

The repo ``data/`` directory is the single source of truth; a synced copy is
embedded at ``espn_polymarket_map/_data`` and loaded from there at runtime.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

from .normalize import normalize

__all__ = [
    "LeagueConfig",
    "CrosswalkTeam",
    "Data",
    "data",
    "data_version",
    "abbr_key",
]

_DATA_DIR = Path(__file__).resolve().parent / "_data"


@dataclass(frozen=True)
class LeagueConfig:
    espn_path: str
    pm_prefix: str
    kind: str
    slug_order: str
    date_basis: str
    crosswalk: str


@dataclass(frozen=True)
class CrosswalkTeam:
    espn: str
    pm: str
    name: str
    aliases: List[str] = field(default_factory=list)


def abbr_key(espn_abbr: str) -> str:
    """Key used to index a crosswalk table from an ESPN abbreviation:
    normalized, spaces removed.
    """
    return normalize(espn_abbr).replace(" ", "")


class Data:
    """All embedded data, indexed for lookup."""

    def __init__(
        self,
        data_version: str,
        leagues: Dict[str, LeagueConfig],
        crosswalks: Dict[str, Dict[str, CrosswalkTeam]],
    ) -> None:
        self.data_version = data_version
        self.leagues = leagues
        self._crosswalks = crosswalks

    def league(self, league: str) -> Optional[LeagueConfig]:
        return self.leagues.get(league)

    def crosswalk_entry(self, league: str, espn_abbr: str) -> Optional[CrosswalkTeam]:
        """Look up a team by ESPN abbreviation within a league's crosswalk."""
        cfg = self.league(league)
        if cfg is None:
            return None
        table = self._crosswalks.get(cfg.crosswalk)
        if table is None:
            return None
        return table.get(abbr_key(espn_abbr))


def _load() -> Data:
    with (_DATA_DIR / "slug-templates.json").open(encoding="utf-8") as fh:
        tmpl = json.load(fh)
    leagues: Dict[str, LeagueConfig] = {}
    for key, raw in tmpl["leagues"].items():
        leagues[key] = LeagueConfig(
            espn_path=raw["espn_path"],
            pm_prefix=raw["pm_prefix"],
            kind=raw["kind"],
            slug_order=raw["slug_order"],
            date_basis=raw["date_basis"],
            crosswalk=raw["crosswalk"],
        )

    crosswalks: Dict[str, Dict[str, CrosswalkTeam]] = {}
    cw_dir = _DATA_DIR / "crosswalk"
    for path in sorted(cw_dir.glob("*.json")):
        stem = path.stem
        with path.open(encoding="utf-8") as fh:
            f = json.load(fh)
        teams: Dict[str, CrosswalkTeam] = {}
        for abbr, t in f["teams"].items():
            teams[abbr] = CrosswalkTeam(
                espn=t["espn"],
                pm=t["pm"],
                name=t["name"],
                aliases=list(t.get("aliases", [])),
            )
        crosswalks[stem] = teams

    version = (_DATA_DIR / "VERSION").read_text(encoding="utf-8").strip()
    return Data(data_version=version, leagues=leagues, crosswalks=crosswalks)


_DATA: Optional[Data] = None


def data() -> Data:
    """Process-wide singleton view of the embedded data."""
    global _DATA
    if _DATA is None:
        _DATA = _load()
    return _DATA


def data_version() -> str:
    """The embedded ``data/VERSION``, trimmed."""
    return data().data_version
