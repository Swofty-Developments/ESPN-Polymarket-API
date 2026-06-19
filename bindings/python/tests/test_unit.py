"""Unit tests for the cross-language primitives: normalize, dates, team_matches."""

from __future__ import annotations

from espn_polymarket_map import (
    candidate_dates,
    civil_from_days,
    content_tokens,
    days_from_civil,
    normalize,
    team_code,
    team_matches,
    tokens,
)


# --- normalize -------------------------------------------------------------


def test_normalize_diacritics_and_punct() -> None:
    assert normalize("Türkiye") == "turkiye"
    assert normalize("Curaçao") == "curacao"
    assert normalize("Côte d'Ivoire") == "cote d ivoire"
    assert normalize("  San  Antonio  ") == "san antonio"


def test_normalize_collapses_and_trims() -> None:
    assert normalize("New York Knicks!!!") == "new york knicks"
    assert normalize("---") == ""
    assert normalize("") == ""


def test_tokens_and_content_tokens() -> None:
    assert tokens("New York Knicks") == ["new", "york", "knicks"]
    assert content_tokens("Bayern of Munich") == ["bayern", "munich"]
    # Falls back to all tokens when removal empties the set.
    assert content_tokens("The") == ["the"]


# --- team_matches ----------------------------------------------------------


def test_team_matches_word_order_swap() -> None:
    assert team_matches(["Congo DR"], "DR Congo")


def test_team_matches_nickname_subset() -> None:
    assert team_matches(["New York Knicks"], "Knicks")
    assert not team_matches(["New York Knicks"], "Brooklyn Nets")


def test_team_matches_empty_text() -> None:
    assert not team_matches(["Knicks"], "")
    assert not team_matches(["Knicks"], "---")


# --- date math -------------------------------------------------------------


def test_days_civil_roundtrip() -> None:
    for y, m, d in [(2026, 6, 20), (2026, 1, 1), (1999, 12, 31), (2024, 2, 29)]:
        z = days_from_civil(y, m, d)
        assert civil_from_days(z) == (y, m, d)


def test_candidate_dates_eastern_rollover() -> None:
    # 00:30Z on the 20th is the previous evening (19th) in US Eastern.
    c = candidate_dates("2026-06-20T00:30Z")
    assert c[0] == "2026-06-19"
    assert "2026-06-20" in c


def test_candidate_dates_daytime_same_day() -> None:
    c = candidate_dates("2026-06-15T16:00Z")
    assert c[0] == "2026-06-15"


def test_candidate_dates_dedup_order() -> None:
    c = candidate_dates("2026-06-20T00:30Z")
    assert len(c) == len(set(c))


# --- crosswalk -------------------------------------------------------------


def test_team_code_known_and_fallback() -> None:
    # Known crosswalk mapping (Vegas Golden Knights ESPN abbr VGK -> pm code las).
    assert team_code("nhl", "VGK") == "las"
    # Unknown abbreviation falls back to the lowercased key.
    assert team_code("nba", "ZZZ") == "zzz"
