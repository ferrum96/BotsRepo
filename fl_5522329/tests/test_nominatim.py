from urllib.parse import unquote

import httpx

from app.geo.nominatim import search_places


async def test_nominatim_parses_hits():
    def handler(request: httpx.Request) -> httpx.Response:
        assert "Москва" in unquote(str(request.url))
        return httpx.Response(
            200,
            json=[
                {"lat": "55.75", "lon": "37.61", "display_name": "Москва, Россия"},
                {"lat": "999", "lon": "0", "display_name": "bad"},
            ],
        )

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        hits = await search_places(client, "Москва", user_agent="test-agent")
    assert len(hits) == 1
    assert hits[0].latitude == 55.75
    assert "Москва" in hits[0].label
