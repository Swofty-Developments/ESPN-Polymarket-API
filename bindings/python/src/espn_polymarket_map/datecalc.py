"""Calendar math for deriving Polymarket slug dates (US-Eastern, no timezone library).

See ``docs/architecture.md``. Uses Howard Hinnant's ``days_from_civil`` /
``civil_from_days`` integer algorithms so every binding produces identical dates.
"""

from __future__ import annotations

from typing import List, Optional, Tuple

__all__ = [
    "days_from_civil",
    "civil_from_days",
    "parse_utc",
    "candidate_dates",
]


def days_from_civil(y: int, m: int, d: int) -> int:
    """Days since 1970-01-01 for a proleptic Gregorian ``(y, m, d)``. ``m`` in 1..=12."""
    y = y - (1 if m <= 2 else 0)
    era = (y if y >= 0 else y - 399) // 400
    yoe = y - era * 400  # [0, 399]
    doy = (153 * (m + (-3 if m > 2 else 9)) + 2) // 5 + d - 1  # [0, 365]
    doe = yoe * 365 + yoe // 4 - yoe // 100 + doy  # [0, 146096]
    return era * 146097 + doe - 719468


def civil_from_days(z: int) -> Tuple[int, int, int]:
    """Inverse of :func:`days_from_civil`: returns ``(y, m, d)``."""
    z = z + 719468
    era = (z if z >= 0 else z - 146096) // 146097
    doe = z - era * 146097  # [0, 146096]
    yoe = (doe - doe // 1460 + doe // 36524 - doe // 146096) // 365  # [0, 399]
    y = yoe + era * 400
    doy = doe - (365 * yoe + yoe // 4 - yoe // 100)  # [0, 365]
    mp = (5 * doy + 2) // 153  # [0, 11]
    d = doy - (153 * mp + 2) // 5 + 1  # [1, 31]
    m = mp + (3 if mp < 10 else -9)  # [1, 12]
    return (y + (1 if m <= 2 else 0), m, d)


def _fmt_date(y: int, m: int, d: int) -> str:
    return f"{y:04d}-{m:02d}-{d:02d}"


def parse_utc(ts: str) -> Optional[Tuple[int, int, int, int, int]]:
    """Parse an RFC3339 UTC timestamp into ``(y, mo, d, h, mi)``.

    Tolerates ``Z`` or ``+00:00``, missing seconds, and fractional seconds.
    Returns ``None`` if the leading date/time cannot be read.
    """
    if len(ts) < 16 or ts[4:5] != "-" or ts[7:8] != "-":
        return None

    def num(start: int, length: int) -> Optional[int]:
        slice_ = ts[start : start + length]
        if len(slice_) != length:
            return None
        try:
            return int(slice_)
        except ValueError:
            return None

    y = num(0, 4)
    mo = num(5, 2)
    d = num(8, 2)
    # position 10 is 'T' (or space)
    h = num(11, 2)
    mi = num(14, 2)
    if None in (y, mo, d, h, mi):
        return None
    return (y, mo, d, h, mi)  # type: ignore[return-value]


def candidate_dates(kickoff_utc: str) -> List[str]:
    """Candidate Polymarket slug dates (``YYYY-MM-DD``) for a kickoff, ordered
    most-likely first: US-Eastern estimate (UTC-5), the UTC date, Eastern-1,
    UTC+1. De-duplicated, order preserved.
    """
    out: List[str] = []

    def push(s: str) -> None:
        if s not in out:
            out.append(s)

    parsed = parse_utc(kickoff_utc)
    if parsed is not None:
        y, mo, d, h, mi = parsed
        days = days_from_civil(y, mo, d)
        minutes = days * 1440 + h * 60 + mi
        # Floor division on a possibly-negative numerator (Python // is floor).
        et_days = (minutes - 300) // 1440
        ey, em, ed = civil_from_days(et_days)
        push(_fmt_date(ey, em, ed))  # Eastern estimate
        push(_fmt_date(y, mo, d))  # UTC date
        em1y, em1m, em1d = civil_from_days(et_days - 1)
        push(_fmt_date(em1y, em1m, em1d))  # Eastern - 1
        up1y, up1m, up1d = civil_from_days(days + 1)
        push(_fmt_date(up1y, up1m, up1d))  # UTC + 1
    return out
