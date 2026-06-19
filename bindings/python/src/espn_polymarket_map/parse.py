"""Parsing raw ESPN scoreboard events and Polymarket gamma events into typed models."""

from __future__ import annotations

import json
from typing import Any, List, Optional

from .models import EspnGame, EspnSide, PmEvent, PmMarket

__all__ = ["parse_espn_event", "parse_pm_event"]


def _s(v: Any, key: str) -> str:
    """Read ``v[key]`` as a string, returning ``""`` if missing or not a string."""
    if isinstance(v, dict):
        val = v.get(key)
        if isinstance(val, str):
            return val
    return ""


def _value_to_string(v: Any) -> str:
    """Mirror serde_json's ``Value::to_string`` for non-string elements.

    Strings pass through verbatim; any other JSON value is serialized compactly.
    """
    if isinstance(v, str):
        return v
    if v is True:
        return "true"
    if v is False:
        return "false"
    if v is None:
        return "null"
    if isinstance(v, (int, float)):
        # serde_json renders integers without a decimal point and floats minimally;
        # json.dumps matches for the integer/float string forms encountered here.
        return json.dumps(v)
    return json.dumps(v, separators=(",", ":"))


def _string_array(v: Any) -> List[str]:
    """Parse a Polymarket ``outcomes`` / ``outcomePrices`` / ``clobTokenIds`` field.

    Gamma encodes these as a JSON-string-of-array (e.g. ``"[\\"Yes\\", \\"No\\"]"``).
    Also tolerates a real array.
    """
    if isinstance(v, str):
        try:
            arr = json.loads(v)
        except (ValueError, TypeError):
            return []
        if isinstance(arr, list):
            return [_value_to_string(x) for x in arr]
        return []
    if isinstance(v, list):
        return [_value_to_string(x) for x in v]
    return []


def parse_espn_event(json_obj: Any, league: str) -> Optional[EspnGame]:
    """Parse one ESPN scoreboard ``event`` object into an :class:`EspnGame`."""
    comp = json_obj
    if isinstance(json_obj, dict):
        comps = json_obj.get("competitions")
        if isinstance(comps, list) and comps:
            comp = comps[0]

    kickoff = _s(comp, "date")
    if not kickoff:
        kickoff = _s(json_obj, "date")

    competitors = comp.get("competitors") if isinstance(comp, dict) else None
    if not isinstance(competitors, list) or len(competitors) < 2:
        return None

    def side(c: Any) -> EspnSide:
        # A side is a team (most sports) or an athlete (tennis, MMA).
        t = c.get("team") if isinstance(c, dict) else None
        if not isinstance(t, dict):
            t = c.get("athlete") if isinstance(c, dict) else None
        if not isinstance(t, dict):
            t = c
        return EspnSide(
            abbr=_s(t, "abbreviation"),
            display_name=_s(t, "displayName"),
            short_name=_s(t, "shortDisplayName") or _s(t, "shortName"),
            location=_s(t, "location"),
            nickname=_s(t, "name") or _s(t, "lastName"),
        )

    def find(home_away: str) -> Any:
        for c in competitors:
            if _s(c, "homeAway") == home_away:
                return c
        return None

    h, a = find("home"), find("away")
    if h is None or a is None:
        # Athlete head-to-head events carry no home/away — fall back to competitor order.
        a, h = competitors[0], competitors[1]
    home = side(h)
    away = side(a)

    return EspnGame(
        league=league,
        espn_event_id=_s(json_obj, "id"),
        kickoff_utc=kickoff,
        home=home,
        away=away,
    )


def parse_pm_event(json_obj: Any) -> PmEvent:
    """Parse a Polymarket gamma ``event`` object into a :class:`PmEvent`."""
    markets: List[PmMarket] = []
    raw_markets = json_obj.get("markets") if isinstance(json_obj, dict) else None
    if isinstance(raw_markets, list):
        for m in raw_markets:
            smt_raw = m.get("sportsMarketType") if isinstance(m, dict) else None
            smt = smt_raw if isinstance(smt_raw, str) else None
            markets.append(
                PmMarket(
                    slug=_s(m, "slug"),
                    question=_s(m, "question"),
                    group_item_title=_s(m, "groupItemTitle"),
                    sports_market_type=smt,
                    outcomes=_string_array(m.get("outcomes") if isinstance(m, dict) else None),
                    outcome_prices=_string_array(
                        m.get("outcomePrices") if isinstance(m, dict) else None
                    ),
                    clob_token_ids=_string_array(
                        m.get("clobTokenIds") if isinstance(m, dict) else None
                    ),
                )
            )

    return PmEvent(
        slug=_s(json_obj, "slug"),
        title=_s(json_obj, "title"),
        markets=markets,
    )
