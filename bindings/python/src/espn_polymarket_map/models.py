"""Public data types shared across the parse / resolve / client surface.

These mirror the Rust reference ``models.rs``. ``MapResult.to_dict()`` and
``Outcome.to_dict()`` yield the exact conformance-corpus JSON shape (snake_case
keys, ``None`` for the draw team and three-way ``pm_market_slug``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

__all__ = [
    "EspnSide",
    "EspnGame",
    "PmMarket",
    "PmEvent",
    "TeamBlock",
    "Outcome",
    "MapResult",
]


@dataclass(frozen=True)
class EspnSide:
    """One side (home or away) of an ESPN game."""

    abbr: str
    display_name: str
    short_name: str
    location: str
    nickname: str


@dataclass(frozen=True)
class EspnGame:
    """A normalized ESPN game (one scoreboard event)."""

    league: str
    espn_event_id: str
    kickoff_utc: str
    home: EspnSide
    away: EspnSide


@dataclass(frozen=True)
class PmMarket:
    """One Polymarket market within an event (moneyline, leg, spread, total, ...)."""

    slug: str
    question: str
    group_item_title: str
    sports_market_type: Optional[str]
    outcomes: List[str] = field(default_factory=list)
    outcome_prices: List[str] = field(default_factory=list)
    clob_token_ids: List[str] = field(default_factory=list)


@dataclass(frozen=True)
class PmEvent:
    """A Polymarket "event" (a game), holding one or many markets."""

    slug: str
    title: str
    markets: List[PmMarket] = field(default_factory=list)


@dataclass(frozen=True)
class TeamBlock:
    """ESPN <-> Polymarket identity for one side, as resolved."""

    espn_abbr: str
    name: str
    pm_code: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "espn_abbr": self.espn_abbr,
            "name": self.name,
            "pm_code": self.pm_code,
        }


@dataclass(frozen=True)
class Outcome:
    """A single resolved tradable outcome.

    ``price`` and ``token_id`` are strings copied verbatim from Polymarket --
    there are no floats in the contract.
    """

    selection: str  # "home" | "away" | "draw"
    team: Optional[str]  # team display name, or None for the draw leg
    pm_market_slug: str
    pm_outcome: str  # the Polymarket outcome label (e.g. "Yes" or "Knicks")
    outcome_index: int  # index of pm_outcome within that market's outcomes array
    token_id: str
    price: str  # verbatim string from Polymarket (no floats)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "selection": self.selection,
            "team": self.team,
            "pm_market_slug": self.pm_market_slug,
            "pm_outcome": self.pm_outcome,
            "outcome_index": self.outcome_index,
            "token_id": self.token_id,
            "price": self.price,
        }

    def price_f64(self) -> Optional[float]:
        """Convenience: parse ``price`` as a float (lossy; the contract value is the string)."""
        try:
            return float(self.price)
        except (ValueError, TypeError):
            return None


@dataclass(frozen=True)
class MapResult:
    """The full mapping result for one ESPN game <-> Polymarket event."""

    resolved: bool
    league: str
    kind: str  # "two_way" | "three_way"
    espn_event_id: str
    pm_event_slug: str
    pm_market_slug: Optional[str]  # moneyline slug for two-way; None for three-way
    home: TeamBlock
    away: TeamBlock
    outcomes: List[Outcome] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "resolved": self.resolved,
            "league": self.league,
            "kind": self.kind,
            "espn_event_id": self.espn_event_id,
            "pm_event_slug": self.pm_event_slug,
            "pm_market_slug": self.pm_market_slug,
            "home": self.home.to_dict(),
            "away": self.away.to_dict(),
            "outcomes": [o.to_dict() for o in self.outcomes],
        }
