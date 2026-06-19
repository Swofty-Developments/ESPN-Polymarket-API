"""Blocking HTTP clients for ESPN and Polymarket (the I/O layer).

These are thin, retrying wrappers around the public, keyless endpoints, built on
the standard library (``urllib.request``) -- no third-party runtime dependencies.
They are *not* part of the conformance corpus; only :func:`resolve` is.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, List, Optional

from .data import data
from .models import EspnGame, MapResult, PmEvent
from .parse import parse_espn_event, parse_pm_event
from .resolve import resolve
from .slug import candidate_slugs

__all__ = ["ClientError", "EspnClient", "PolymarketClient", "map_game"]

ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports"
GAMMA_BASE = "https://gamma-api.polymarket.com"
_USER_AGENT = (
    "espn-polymarket-map/0.1 "
    "(+https://github.com/Swofty-Developments/ESPN-Polymarket-API)"
)
_TIMEOUT_SECS = 25.0
_MAX_ATTEMPTS = 3


class ClientError(Exception):
    """Network or decoding error from the I/O layer."""


def _get_json(url: str) -> Any:
    last = "no attempt"
    for attempt in range(_MAX_ATTEMPTS):
        req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=_TIMEOUT_SECS) as resp:
                body = resp.read().decode("utf-8")
            try:
                return json.loads(body)
            except ValueError as e:
                raise ClientError(f"decode error: {e}") from e
        except urllib.error.URLError as e:
            last = str(e)
            time.sleep(0.3 * (attempt + 1))
        except TimeoutError as e:  # pragma: no cover - network timing
            last = str(e)
            time.sleep(0.3 * (attempt + 1))
    raise ClientError(f"http error: {last}")


class EspnClient:
    """ESPN site.api scoreboard client."""

    @staticmethod
    def scoreboard(league: str) -> List[EspnGame]:
        """Today's scoreboard for a league key (e.g. ``"nba"``, ``"fifa.world"``)."""
        return EspnClient._fetch(league, None)

    @staticmethod
    def scoreboard_on(league: str, yyyymmdd: str) -> List[EspnGame]:
        """Scoreboard for a specific UTC date (``YYYYMMDD``)."""
        return EspnClient._fetch(league, yyyymmdd)

    @staticmethod
    def _fetch(league: str, date: Optional[str]) -> List[EspnGame]:
        cfg = data().league(league)
        if cfg is None:
            raise ClientError(f"unknown league {league}")
        url = f"{ESPN_BASE}/{cfg.espn_path}/scoreboard"
        if date:
            url += f"?dates={date}"
        payload = _get_json(url)
        events = payload.get("events") if isinstance(payload, dict) else None
        if not isinstance(events, list):
            events = []
        games: List[EspnGame] = []
        for e in events:
            g = parse_espn_event(e, league)
            if g is not None:
                games.append(g)
        return games


class PolymarketClient:
    """Polymarket gamma client."""

    @staticmethod
    def event_by_slug(slug: str) -> Optional[PmEvent]:
        """Fetch an event by exact slug, if it exists."""
        url = f"{GAMMA_BASE}/events?slug={urllib.parse.quote(slug, safe='')}"
        payload = _get_json(url)
        if isinstance(payload, list) and payload:
            return parse_pm_event(payload[0])
        return None

    @staticmethod
    def search(query: str) -> List[PmEvent]:
        """Free-text search returning candidate events."""
        q = urllib.parse.quote(query, safe="")
        url = f"{GAMMA_BASE}/public-search?q={q}&limit_per_type=10"
        payload = _get_json(url)
        events = payload.get("events") if isinstance(payload, dict) else None
        if not isinstance(events, list):
            return []
        return [parse_pm_event(e) for e in events]


def map_game(game: EspnGame) -> MapResult:
    """End-to-end: given an ESPN game, find and resolve its Polymarket event.

    Tries each candidate slug, then falls back to search. Returns the first
    ``resolved`` result, or the best unresolved attempt (so callers can classify
    mapping gaps).
    """
    cfg = data().league(game.league)
    if cfg is None:
        raise ClientError(f"unknown league {game.league}")

    last: Optional[MapResult] = None
    for slug in candidate_slugs(game):
        ev = PolymarketClient.event_by_slug(slug)
        if ev is not None:
            r = resolve(game.league, game, ev)
            if r.resolved:
                return r
            last = r

    # Search fallback.
    query = f"{game.away.display_name} {game.home.display_name}"
    try:
        events = PolymarketClient.search(query)
    except ClientError:
        events = []
    prefix = f"{cfg.pm_prefix}-"
    for ev in events:
        if not ev.slug.startswith(prefix):
            continue
        r = resolve(game.league, game, ev)
        if r.resolved:
            return r
        if last is None:
            last = r

    if last is not None:
        return last
    empty = PmEvent(slug="", title="", markets=[])
    return resolve(game.league, game, empty)
