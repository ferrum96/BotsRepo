from __future__ import annotations

import httpx
import pytest

from app.infrastructure.max_api.client import MaxApiClient
from app.infrastructure.max_api.errors import (
    MaxAuthError,
    MaxRateLimitError,
    MaxUnavailableError,
)


def _client(status: int, text: str = "err") -> MaxApiClient:
    def handler(request: httpx.Request) -> httpx.Response:
        assert "access_token" not in str(request.url)
        assert request.headers.get("Authorization") == "secret-token"
        return httpx.Response(status, text=text, headers={"Retry-After": "0"})

    transport = httpx.MockTransport(handler)
    http = httpx.AsyncClient(transport=transport)
    return MaxApiClient(
        base_url="https://platform-api2.max.ru",
        token="secret-token",
        timeout_seconds=5,
        http_client=http,
    )


async def test_max_api_401():
    client = _client(401)
    with pytest.raises(MaxAuthError) as exc:
        await client.get_me()
    assert exc.value.status_code == 401


async def test_max_api_429():
    client = _client(429)
    with pytest.raises(MaxRateLimitError) as exc:
        await client.get_me()
    assert exc.value.status_code == 429


async def test_max_api_503():
    client = _client(503)
    with pytest.raises(MaxUnavailableError) as exc:
        await client.get_me()
    assert exc.value.status_code == 503
