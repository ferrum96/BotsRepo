from __future__ import annotations

import math
import re
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from app.timeutil import MSK

_DATE_FORMATS = ("%d.%m.%Y", "%Y-%m-%d")
_TIME_RE = re.compile(r"^(\d{1,2})[:.](\d{2})$")
_COORD_RE = re.compile(
    r"^\s*([+-]?\d+(?:\.\d+)?)\s*[, ]\s*([+-]?\d+(?:\.\d+)?)\s*$"
)
_UNKNOWN_TIME = {"не знаю", "неизвестно", "нет", "unknown"}


class InputError(ValueError):
    pass


def validate_coords(latitude: float, longitude: float) -> None:
    if isinstance(latitude, bool) or isinstance(longitude, bool):
        raise InputError("координаты должны быть числами")
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        raise InputError("координаты должны быть конечными числами")
    if not -90.0 <= latitude <= 90.0 or not -180.0 <= longitude <= 180.0:
        raise InputError("широта от -90 до 90, долгота от -180 до 180")


def clean_place(value: str) -> str:
    place = " ".join(value.split())
    if not place or len(place) > 200:
        raise InputError("место рождения: от 1 до 200 символов")
    return place


def parse_birth_date(value: str, today: date | None = None) -> date:
    raw = value.strip()
    parsed: date | None = None
    for fmt in _DATE_FORMATS:
        try:
            parsed = datetime.strptime(raw, fmt).date()
            break
        except ValueError:
            continue
    if parsed is None:
        raise InputError("дата в формате ДД.ММ.ГГГГ")
    current = today or datetime.now(ZoneInfo("Europe/Moscow")).date()
    if parsed.year < 1900 or parsed > current:
        raise InputError("дата рождения с 1900 года и не из будущего")
    return parsed


def parse_birth_time(value: str) -> tuple[time, bool]:
    raw = value.strip().lower().replace("ё", "е")
    if raw in _UNKNOWN_TIME:
        return time(12, 0), False
    match = _TIME_RE.fullmatch(raw)
    if match is None:
        raise InputError("время в формате ЧЧ:ММ или «не знаю»")
    hour = int(match.group(1))
    minute = int(match.group(2))
    if hour > 23 or minute > 59:
        raise InputError("время в формате ЧЧ:ММ или «не знаю»")
    return time(hour, minute), True


def parse_coord_pair(value: str) -> tuple[float, float] | None:
    match = _COORD_RE.fullmatch(value.strip())
    if match is None:
        return None
    latitude = float(match.group(1))
    longitude = float(match.group(2))
    validate_coords(latitude, longitude)
    return latitude, longitude


def msk_date_for_inputs(now: datetime | None = None) -> date:
    current = now or datetime.now(MSK)
    return current.astimezone(MSK).date()
