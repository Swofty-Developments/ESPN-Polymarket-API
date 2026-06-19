"""Candidate Polymarket slug derivation (I/O layer helper)."""

from __future__ import annotations

from typing import List

from .crosswalk import team_code
from .data import data
from .datecalc import candidate_dates
from .models import EspnGame

__all__ = ["candidate_slugs"]


def candidate_slugs(game: EspnGame) -> List[str]:
    """Ordered, de-duplicated candidate Polymarket event slugs for a game.

    Tries the league's preferred team ordering first, then the reverse, across
    all candidate dates (see :func:`candidate_dates`).
    """
    cfg = data().league(game.league)
    if cfg is None:
        return []
    # Athlete sports (tennis, MMA) have unpredictable slug codes — looked up by search.
    if cfg.entity == "athlete":
        return []
    away = team_code(game.league, game.away.abbr)
    home = team_code(game.league, game.home.abbr)
    if cfg.slug_order == "away_home":
        pairs = [(away, home), (home, away)]
    else:
        pairs = [(home, away), (away, home)]
    out: List[str] = []
    for date in candidate_dates(game.kickoff_utc):
        for x, y in pairs:
            s = f"{cfg.pm_prefix}-{x}-{y}-{date}"
            if s not in out:
                out.append(s)
    return out
