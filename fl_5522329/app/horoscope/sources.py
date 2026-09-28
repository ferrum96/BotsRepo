from __future__ import annotations

import logging

import httpx

from app.horoscope.knowledge import ASPECT_RU, PHASE_RU, PLANET_RU, ZODIAC_SIGNS

logger = logging.getLogger(__name__)


class SourceError(Exception):
    pass


async def fetch_sigastra_day(client: httpx.AsyncClient, *, base_url: str, sign: str) -> tuple[dict, list, dict, str]:
    root = f"{base_url.rstrip('/')}/api/v1"
    daily_payload, cosmic_payload, moon_payload = await _gather(
        _get_json(client, f"{root}/daily", {"lang": "en", "sign": sign, "full": "1"}),
        _get_json(client, f"{root}/cosmic", {"lang": "en"}),
        _get_json(client, f"{root}/moon", {"lang": "en"}),
    )
    return (
        parse_daily(daily_payload, sign),
        parse_aspects(cosmic_payload),
        parse_moon(moon_payload),
        _credit_href(daily_payload, cosmic_payload, moon_payload),
    )


def parse_daily(payload: dict, sign: str) -> dict:
    items = payload.get("items") or []
    if not items or not isinstance(items[0], dict):
        raise SourceError("Sigastra не прислала гороскоп знака.")
    item = items[0]
    raw = item.get("data") if isinstance(item.get("data"), dict) else {}
    info = ZODIAC_SIGNS.get(sign, {"ru": sign, "element": "?", "ruler": "?"})
    ratings = {}
    for key in ("love", "work", "energy"):
        value = raw.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            ratings[key] = int(value)
    return {
        "date": str(payload.get("date") or ""),
        "sign": sign,
        "sign_ru": info["ru"],
        "element": info["element"],
        "ruler": info["ruler"],
        "ratings": ratings,
    }


def parse_aspects(payload: dict) -> list[dict]:
    aspects = []
    for item in payload.get("items") or []:
        if not isinstance(item, dict) or not isinstance(item.get("data"), dict):
            continue
        raw = item["data"]
        left = str(raw.get("a") or "")
        right = str(raw.get("b") or "")
        aspect = str(raw.get("aspect") or "")
        orb = raw.get("orb")
        if left not in PLANET_RU or right not in PLANET_RU or aspect not in ASPECT_RU:
            continue
        if not isinstance(orb, (int, float)) or isinstance(orb, bool):
            continue
        aspects.append(
            {
                "planet1": PLANET_RU[left],
                "planet2": PLANET_RU[right],
                "aspect": ASPECT_RU[aspect],
                "orb": round(float(orb), 1),
                "raw_a": left,
                "raw_b": right,
                "raw_aspect": aspect,
            }
        )
    return aspects


def parse_moon(payload: dict) -> dict:
    items = payload.get("items") or []
    if not items or not isinstance(items[0], dict) or not isinstance(items[0].get("data"), dict):
        raise SourceError("Sigastra не прислала фазу Луны.")
    raw = items[0]["data"]
    phase = str(raw.get("phase") or "")
    sign = str(raw.get("moonSign") or "")
    illumination = raw.get("illumination")
    if not isinstance(illumination, (int, float)) or isinstance(illumination, bool):
        illumination = 0
    return {
        "phase": PHASE_RU.get(phase, phase),
        "illumination": illumination,
        "moon_sign": _moon_sign_ru(sign),
        "waxing": bool(raw.get("waxing")),
    }


def _moon_sign_ru(sign: str) -> str:
    from app.horoscope.knowledge import MOON_SIGN_RU

    return MOON_SIGN_RU.get(sign, sign)


async def _gather(*aws):
    import asyncio

    return await asyncio.gather(*aws)


async def _get_json(client: httpx.AsyncClient, url: str, params: dict) -> dict:
    try:
        response = await client.get(url, params=params)
    except httpx.HTTPError as exc:
        logger.warning("sigastra request failed")
        raise SourceError("Sigastra не ответила.") from exc
    if response.status_code >= 400:
        logger.warning("sigastra status %s", response.status_code)
        raise SourceError("Sigastra не ответила.")
    try:
        payload = response.json()
    except ValueError as exc:
        raise SourceError("Sigastra вернула неразборчивый ответ.") from exc
    if not isinstance(payload, dict):
        raise SourceError("Sigastra вернула пустой ответ.")
    return payload


def _credit_href(*payloads: dict) -> str:
    for payload in payloads:
        attribution = payload.get("attribution") if isinstance(payload.get("attribution"), dict) else {}
        href = str(attribution.get("localizedHref") or "")
        if href.startswith("https://"):
            return href
    return "https://sigastra.com/"
