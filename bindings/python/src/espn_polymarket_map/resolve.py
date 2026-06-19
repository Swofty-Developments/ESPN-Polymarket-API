"""The core resolution algorithm -- the cross-language contract (see ``docs/architecture.md``)."""

from __future__ import annotations

from typing import List, Optional

from .crosswalk import side_names, team_code, team_name
from .data import data
from .models import EspnGame, EspnSide, MapResult, Outcome, PmEvent, PmMarket, TeamBlock
from .normalize import normalize, team_matches

__all__ = ["resolve"]


def _team_block(league: str, side: EspnSide) -> TeamBlock:
    return TeamBlock(
        espn_abbr=side.abbr,
        name=team_name(league, side),
        pm_code=team_code(league, side.abbr),
    )


def _is_draw(m: PmMarket) -> bool:
    return m.slug.endswith("-draw") or normalize(m.group_item_title).startswith("draw")


def _idx_str(arr: List[str], i: int) -> str:
    return arr[i] if 0 <= i < len(arr) else ""


def resolve(league: str, game: EspnGame, pm: PmEvent) -> MapResult:
    """Resolve one ESPN game against a candidate Polymarket event."""
    home_block = _team_block(league, game.home)
    away_block = _team_block(league, game.away)
    cfg = data().league(league)
    kind = cfg.kind if cfg is not None else ""

    outcomes: List[Outcome] = []
    resolved = False
    pm_market_slug: Optional[str] = None

    home_names = side_names(league, game.home)
    away_names = side_names(league, game.away)

    if kind == "three_way":
        home_leg: Optional[PmMarket] = None
        away_leg: Optional[PmMarket] = None
        draw_leg: Optional[PmMarket] = None
        for m in pm.markets:
            if _is_draw(m):
                if draw_leg is None:
                    draw_leg = m
                continue
            label = m.group_item_title if m.group_item_title else m.question
            if home_leg is None and team_matches(home_names, label):
                home_leg = m
            elif away_leg is None and team_matches(away_names, label):
                away_leg = m

        def leg_outcome(selection: str, team: Optional[str], m: PmMarket) -> Outcome:
            return Outcome(
                selection=selection,
                team=team,
                pm_market_slug=m.slug,
                pm_outcome=_idx_str(m.outcomes, 0),
                outcome_index=0,
                token_id=_idx_str(m.clob_token_ids, 0),
                price=_idx_str(m.outcome_prices, 0),
            )

        if home_leg is not None:
            outcomes.append(leg_outcome("home", home_block.name, home_leg))
        if away_leg is not None:
            outcomes.append(leg_outcome("away", away_block.name, away_leg))
        if draw_leg is not None:
            outcomes.append(leg_outcome("draw", None, draw_leg))
        resolved = home_leg is not None and away_leg is not None

        return MapResult(
            resolved=resolved,
            league=league,
            kind=kind,
            espn_event_id=game.espn_event_id,
            pm_event_slug=pm.slug,
            pm_market_slug=None,
            home=home_block,
            away=away_block,
            outcomes=outcomes,
        )

    # two_way
    ml: Optional[PmMarket] = next((m for m in pm.markets if m.slug == pm.slug), None)
    if ml is None:
        ml = next((m for m in pm.markets if m.sports_market_type == "moneyline"), None)

    if ml is not None:
        pm_market_slug = ml.slug
        home_idx: Optional[int] = None
        away_idx: Optional[int] = None
        for i, o in enumerate(ml.outcomes):
            if home_idx is None and team_matches(home_names, o):
                home_idx = i
            elif away_idx is None and team_matches(away_names, o):
                away_idx = i
        if home_idx is not None and away_idx is not None and home_idx != away_idx:
            for i in range(len(ml.outcomes)):
                if i == home_idx:
                    selection = "home"
                    team: Optional[str] = home_block.name
                elif i == away_idx:
                    selection = "away"
                    team = away_block.name
                else:
                    continue
                outcomes.append(
                    Outcome(
                        selection=selection,
                        team=team,
                        pm_market_slug=ml.slug,
                        pm_outcome=_idx_str(ml.outcomes, i),
                        outcome_index=i,
                        token_id=_idx_str(ml.clob_token_ids, i),
                        price=_idx_str(ml.outcome_prices, i),
                    )
                )
            resolved = True

    return MapResult(
        resolved=resolved,
        league=league,
        kind=kind,
        espn_event_id=game.espn_event_id,
        pm_event_slug=pm.slug,
        pm_market_slug=pm_market_slug,
        home=home_block,
        away=away_block,
        outcomes=outcomes,
    )
