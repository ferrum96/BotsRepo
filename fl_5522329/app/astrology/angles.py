from __future__ import annotations

SIGNS = (
    "Овен",
    "Телец",
    "Близнецы",
    "Рак",
    "Лев",
    "Дева",
    "Весы",
    "Скорпион",
    "Стрелец",
    "Козерог",
    "Водолей",
    "Рыбы",
)

FLATLIB_SIGNS = {
    "Aries": "Овен",
    "Taurus": "Телец",
    "Gemini": "Близнецы",
    "Cancer": "Рак",
    "Leo": "Лев",
    "Virgo": "Дева",
    "Libra": "Весы",
    "Scorpio": "Скорпион",
    "Sagittarius": "Стрелец",
    "Capricorn": "Козерог",
    "Aquarius": "Водолей",
    "Pisces": "Рыбы",
}

ASPECTS = (
    ("conjunction", "соединение", 0, 8.0),
    ("sextile", "секстиль", 60, 4.0),
    ("square", "квадрат", 90, 6.0),
    ("trine", "трин", 120, 6.0),
    ("opposition", "оппозиция", 180, 8.0),
)

PLANET_ORDER = (
    "sun",
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto",
)

PLANET_NAMES = {
    "sun": "Солнце",
    "moon": "Луна",
    "mercury": "Меркурий",
    "venus": "Венера",
    "mars": "Марс",
    "jupiter": "Юпитер",
    "saturn": "Сатурн",
    "uranus": "Уран",
    "neptune": "Нептун",
    "pluto": "Плутон",
    "ascendant": "Асцендент",
}

SYNASTRY_BODIES = ("sun", "moon", "mercury", "venus", "mars", "ascendant")


def normalize_longitude(longitude: float) -> float:
    return longitude % 360.0


def sign_of(longitude: float) -> tuple[str, float]:
    lon = normalize_longitude(longitude)
    index = int(lon // 30) % 12
    return SIGNS[index], lon % 30.0


def angular_separation(first: float, second: float) -> float:
    gap = abs(normalize_longitude(first) - normalize_longitude(second)) % 360.0
    return min(gap, 360.0 - gap)


def find_aspect(first: float, second: float) -> dict | None:
    separation = angular_separation(first, second)
    best: dict | None = None
    for key, title, angle, orb in ASPECTS:
        delta = abs(separation - angle)
        if delta <= orb and (best is None or delta < best["orb"]):
            best = {
                "type": key,
                "title": title,
                "angle": angle,
                "orb": round(delta, 2),
            }
    return best


def in_house_arc(longitude: float, start: float, end: float) -> bool:
    lon = normalize_longitude(longitude)
    begin = normalize_longitude(start)
    finish = normalize_longitude(end)
    if begin == finish:
        return False
    if begin < finish:
        return begin <= lon < finish
    return lon >= begin or lon < finish


def house_of(longitude: float, cusps: list[float]) -> int:
    if len(cusps) != 12:
        raise ValueError("expected 12 house cusps")
    for index in range(12):
        if in_house_arc(longitude, cusps[index], cusps[(index + 1) % 12]):
            return index + 1
    return 12
