from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.geo.coords import clean_place, validate_coords

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"


@dataclass(frozen=True)
class PlaceHit:
    label: str
    latitude: float
    longitude: float


def _label(item: dict) -> str:
    name = item.get("display_name") or item.get("name") or ""
    return clean_place(str(name))


async def search_places(
    client: httpx.AsyncClient,
    query: str,
    *,
    user_agent: str,
    limit: int = 3,
) -> list[PlaceHit]:
    place = clean_place(query)
    response = await client.get(
        NOMINATIM_URL,
        params={"q": place, "format": "jsonv2", "limit": limit, "addressdetails": 0},
        headers={"User-Agent": user_agent, "Accept-Language": "ru"},
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        return []
    hits: list[PlaceHit] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        try:
            latitude = float(item["lat"])
            longitude = float(item["lon"])
            validate_coords(latitude, longitude)
            label = _label(item)
        except (KeyError, TypeError, ValueError):
            continue
        hits.append(PlaceHit(label=label, latitude=latitude, longitude=longitude))
    return hits
