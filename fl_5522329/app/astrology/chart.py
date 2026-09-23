from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from timezonefinder import TimezoneFinder

from app.astrology.angles import (
    FLATLIB_SIGNS,
    PLANET_NAMES,
    PLANET_ORDER,
    find_aspect,
    house_of,
    sign_of,
)

logger = logging.getLogger(__name__)
_finder = TimezoneFinder()

class ChartError(ValueError):
    pass


@dataclass(frozen=True)
class ChartResult:
    sun_sign: str
    moon_sign: str
    ascendant_sign: str
    planets: dict
    houses: list
    aspects: list
    timezone_name: str
    birth_utc: datetime
    flatlib_sun_sign: str | None

    def as_dict(self) -> dict:
        return {
            "sun_sign": self.sun_sign,
            "moon_sign": self.moon_sign,
            "ascendant_sign": self.ascendant_sign,
            "planets": self.planets,
            "houses": self.houses,
            "aspects": self.aspects,
            "timezone": self.timezone_name,
            "birth_utc": self.birth_utc.isoformat(),
            "flatlib_sun_sign": self.flatlib_sun_sign,
        }


def resolve_timezone(latitude: float, longitude: float) -> str:
    name = _finder.timezone_at(lat=latitude, lng=longitude)
    if name:
        return name
    hours = max(-12, min(14, int(round(longitude / 15.0))))
    return f"FIXED{hours:+d}"


def _zone(name: str):
    if name.startswith("FIXED"):
        hours = int(name.removeprefix("FIXED"))
        return timezone(timedelta(hours=hours))
    return ZoneInfo(name)


def local_birth_utc(
    birth_date: date,
    birth_time: time,
    latitude: float,
    longitude: float,
) -> tuple[datetime, datetime, str]:
    tz_name = resolve_timezone(latitude, longitude)
    local = datetime.combine(birth_date, birth_time, tzinfo=_zone(tz_name))
    return local, local.astimezone(timezone.utc), tz_name


def _offset_label(local: datetime) -> str:
    offset = local.utcoffset() or timedelta(0)
    total = int(offset.total_seconds())
    sign = "+" if total >= 0 else "-"
    total = abs(total)
    hours, minutes = divmod(total // 60, 60)
    return f"{sign}{hours:02d}:{minutes:02d}"


def _julian_day(moment_utc: datetime) -> float:
    import swisseph as swe

    moment = moment_utc.astimezone(timezone.utc)
    hour = moment.hour + moment.minute / 60.0 + moment.second / 3600.0 + moment.microsecond / 3_600_000_000.0
    return swe.julday(moment.year, moment.month, moment.day, hour)


def _body_ids() -> dict[str, int]:
    import swisseph as swe

    return {
        "sun": swe.SUN,
        "moon": swe.MOON,
        "mercury": swe.MERCURY,
        "venus": swe.VENUS,
        "mars": swe.MARS,
        "jupiter": swe.JUPITER,
        "saturn": swe.SATURN,
        "uranus": swe.URANUS,
        "neptune": swe.NEPTUNE,
        "pluto": swe.PLUTO,
    }


def _calc_longitude(jd: float, body: int) -> tuple[float, float]:
    import swisseph as swe

    for flag in (swe.FLG_SWIEPH, swe.FLG_MOSEPH):
        xx, ret = swe.calc_ut(jd, body, flag | swe.FLG_SPEED)
        if ret >= 0:
            return float(xx[0]), float(xx[3])
    raise ChartError("ephemeris calculation failed")


def _house_cusps(jd: float, latitude: float, longitude: float) -> tuple[list[float], float, float]:
    import swisseph as swe

    last_error: Exception | None = None
    for system in (b"P", b"O", b"E"):
        try:
            cusps, ascmc = swe.houses(jd, latitude, longitude, system)
        except swe.Error as exc:
            last_error = exc
            continue
        values = list(cusps)
        if len(values) >= 13:
            twelve = [float(values[i]) for i in range(1, 13)]
        elif len(values) == 12:
            twelve = [float(item) for item in values]
        else:
            continue
        return twelve, float(ascmc[0]), float(ascmc[1])
    raise ChartError(f"houses failed: {last_error}")


def _flatlib_sun(birth_date: date, birth_time: time, latitude: float, longitude: float, offset: str) -> str | None:
    try:
        from flatlib import const
        from flatlib.chart import Chart
        from flatlib.datetime import Datetime
        from flatlib.geopos import GeoPos
    except Exception:
        logger.info("flatlib is not importable")
        return None
    try:
        moment = Datetime(birth_date.strftime("%Y/%m/%d"), birth_time.strftime("%H:%M"), offset)
        chart = Chart(moment, GeoPos(latitude, longitude))
        return FLATLIB_SIGNS.get(chart.get(const.SUN).sign)
    except Exception:
        logger.info("flatlib chart failed", exc_info=True)
        return None


def calculate_chart_at(
    moment_utc: datetime,
    latitude: float,
    longitude: float,
    *,
    timezone_name: str = "UTC",
    birth_local: datetime | None = None,
    birth_date: date | None = None,
    birth_time: time | None = None,
) -> ChartResult:
    try:
        import swisseph as swe  # noqa: F401
    except ImportError as exc:
        raise ChartError("pyswisseph is not installed") from exc

    jd = _julian_day(moment_utc)
    cusps, ascendant, midheaven = _house_cusps(jd, latitude, longitude)
    planets: dict[str, dict] = {}
    for key in PLANET_ORDER:
        longitude_deg, speed = _calc_longitude(jd, _body_ids()[key])
        sign, degree = sign_of(longitude_deg)
        planets[key] = {
            "name": PLANET_NAMES[key],
            "longitude": round(longitude_deg, 4),
            "sign": sign,
            "degree": round(degree, 2),
            "house": house_of(longitude_deg, cusps),
            "speed": round(speed, 4),
            "retrograde": speed < 0,
        }
    asc_sign, asc_degree = sign_of(ascendant)
    mc_sign, mc_degree = sign_of(midheaven)
    planets["ascendant"] = {
        "name": PLANET_NAMES["ascendant"],
        "longitude": round(ascendant, 4),
        "sign": asc_sign,
        "degree": round(asc_degree, 2),
        "house": 1,
        "speed": 0.0,
        "retrograde": False,
    }
    houses = []
    for index, cusp in enumerate(cusps, start=1):
        sign, degree = sign_of(cusp)
        houses.append(
            {
                "number": index,
                "cusp": round(cusp, 4),
                "sign": sign,
                "degree": round(degree, 2),
            }
        )
    aspects = []
    keys = list(PLANET_ORDER)
    for left in range(len(keys)):
        for right in range(left + 1, len(keys)):
            aspect = find_aspect(planets[keys[left]]["longitude"], planets[keys[right]]["longitude"])
            if aspect is None:
                continue
            aspects.append(
                {
                    **aspect,
                    "a": keys[left],
                    "b": keys[right],
                    "a_name": PLANET_NAMES[keys[left]],
                    "b_name": PLANET_NAMES[keys[right]],
                }
            )
    aspects.sort(key=lambda item: item["orb"])
    flatlib_sun = None
    if birth_local is not None and birth_date is not None and birth_time is not None:
        flatlib_sun = _flatlib_sun(birth_date, birth_time, latitude, longitude, _offset_label(birth_local))
        if flatlib_sun and flatlib_sun != planets["sun"]["sign"]:
            logger.info(
                "flatlib sun %s differs from swisseph %s; swisseph kept",
                flatlib_sun,
                planets["sun"]["sign"],
            )
    return ChartResult(
        sun_sign=planets["sun"]["sign"],
        moon_sign=planets["moon"]["sign"],
        ascendant_sign=asc_sign,
        planets=planets,
        houses=houses,
        aspects=aspects,
        timezone_name=timezone_name,
        birth_utc=moment_utc.astimezone(timezone.utc),
        flatlib_sun_sign=flatlib_sun,
    )


def calculate_natal_chart(
    birth_date: date,
    birth_time: time,
    latitude: float,
    longitude: float,
) -> ChartResult:
    local, moment_utc, tz_name = local_birth_utc(birth_date, birth_time, latitude, longitude)
    return calculate_chart_at(
        moment_utc,
        latitude,
        longitude,
        timezone_name=tz_name,
        birth_local=local,
        birth_date=birth_date,
        birth_time=birth_time,
    )
