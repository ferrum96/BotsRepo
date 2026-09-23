from __future__ import annotations

from datetime import datetime, timezone

from app.astrology.angles import PLANET_NAMES, PLANET_ORDER, find_aspect, house_of
from app.astrology.chart import ChartResult, calculate_chart_at
from app.texts import ensure_disclaimer
from app.timeutil import secondary_progression_days


def _cusps(chart: dict) -> list[float]:
    houses = sorted(chart["houses"], key=lambda item: item["number"])
    return [float(item["cusp"]) for item in houses]


def transit_aspects(natal: dict, current: ChartResult) -> list[dict]:
    cusps = _cusps(natal)
    found = []
    for key in PLANET_ORDER:
        moving = current.planets[key]
        house = house_of(moving["longitude"], cusps)
        for natal_key in ("sun", "moon", "mercury", "venus", "mars", "ascendant"):
            natal_body = natal["planets"][natal_key]
            aspect = find_aspect(moving["longitude"], natal_body["longitude"])
            if aspect is None:
                continue
            found.append(
                {
                    **aspect,
                    "transit": key,
                    "transit_name": PLANET_NAMES[key],
                    "natal": natal_key,
                    "natal_name": natal_body["name"],
                    "house": house,
                    "transit_sign": moving["sign"],
                }
            )
    found.sort(key=lambda item: item["orb"])
    return found


def aspects_summary(aspects: list[dict], limit: int = 8) -> str:
    if not aspects:
        return "точных мажорных аспектов в выборке нет"
    chunks = []
    for aspect in aspects[:limit]:
        left = aspect.get("a_name") or aspect.get("transit_name")
        right = aspect.get("b_name") or aspect.get("natal_name")
        chunks.append(f"{left} {aspect['title']} {right} (орб {aspect['orb']}°)")
    return "; ".join(chunks)


def transits_summary(aspects: list[dict], limit: int = 5) -> str:
    if not aspects:
        return "сильных транзитов к личным планетам нет"
    chunks = []
    for aspect in aspects[:limit]:
        chunks.append(
            f"{aspect['transit_name']} в {aspect['house']} доме, "
            f"{aspect['title']} к {aspect['natal_name']} (орб {aspect['orb']}°)"
        )
    return "; ".join(chunks)


def _transit_sentence(aspect: dict) -> str:
    house = aspect["house"]
    if aspect["type"] in {"trine", "sextile"}:
        tone = "даёт поддержку"
    elif aspect["type"] in {"square", "opposition"}:
        tone = "просит не торопить события"
    else:
        tone = "делает тему заметнее"
    return (
        f"{aspect['transit_name']} в {house}-м доме {tone}: "
        f"{aspect['title']} к натальной точке «{aspect['natal_name']}»."
    )


def render_daily(chart: dict, transit_rows: list[dict], day_label: str) -> str:
    lines = [
        f"Гороскоп на {day_label}. Солнце в знаке {chart['sun_sign']}, "
        f"Луна в знаке {chart['moon_sign']}, Асцендент {chart['ascendant_sign']}."
    ]
    if not transit_rows:
        lines.append(
            "Сегодня нет тесных транзитов к личным планетам. "
            "День лучше потратить на текущие дела и одно спокойное решение."
        )
    else:
        lines.extend(_transit_sentence(row) for row in transit_rows[:3])
    lines.append("Опирайся на факты дня, а карту используй как подсказку, где не давить.")
    return ensure_disclaimer(" ".join(lines))


def render_monthly(chart: dict, progressed: ChartResult, transit_rows: list[dict], month_label: str) -> str:
    moon = progressed.planets["moon"]
    lines = [
        f"Прогноз на {month_label}. Натальное Солнце в знаке {chart['sun_sign']}.",
        (
            f"Прогрессивная Луна в знаке {moon['sign']} — месяц про эмоциональный фон "
            f"и привычки, а не про резкий разворот."
        ),
    ]
    if transit_rows:
        lines.append(_transit_sentence(transit_rows[0]))
    else:
        lines.append("Транзиты к личным планетам спокойные: удобно закрывать хвосты, а не начинать всё сразу.")
    lines.append("Выбери один практический шаг на неделю и оставь запас по срокам.")
    return ensure_disclaimer(" ".join(lines))


def current_chart(latitude: float, longitude: float, now: datetime | None = None) -> ChartResult:
    moment = now or datetime.now(timezone.utc)
    return calculate_chart_at(moment, latitude, longitude, timezone_name="UTC")


def progressed_chart(natal_birth_utc: datetime, latitude: float, longitude: float, now: datetime | None = None) -> ChartResult:
    moment = now or datetime.now(timezone.utc)
    from datetime import timedelta

    offset_days = secondary_progression_days(natal_birth_utc, moment)
    progressed_moment = natal_birth_utc + timedelta(days=offset_days)
    return calculate_chart_at(progressed_moment, latitude, longitude, timezone_name="UTC")
