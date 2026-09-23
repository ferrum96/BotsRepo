from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

MSK = ZoneInfo("Europe/Moscow")
TROPICAL_YEAR_DAYS = 365.242189


def as_utc(moment: datetime) -> datetime:
    if moment.tzinfo is None:
        raise ValueError("datetime must be timezone-aware")
    return moment.astimezone(timezone.utc)


def msk_today(now: datetime | None = None) -> date:
    current = now or datetime.now(timezone.utc)
    return as_utc(current).astimezone(MSK).date()


def seconds_until_msk_midnight(now: datetime | None = None) -> int:
    current = as_utc(now or datetime.now(timezone.utc)).astimezone(MSK)
    nxt = (current + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(60, int((nxt - current).total_seconds()))


def secondary_progression_days(birth_utc: datetime, now_utc: datetime) -> float:
    age_days = (as_utc(now_utc) - as_utc(birth_utc)).total_seconds() / 86400.0
    if age_days < 0:
        raise ValueError("birth is in the future")
    return age_days / TROPICAL_YEAR_DAYS
