from __future__ import annotations

from urllib.parse import urlparse

import httpx

from app.domain.exceptions import ValidationError


class HttpFileFetcher:
    def __init__(self, http_client: httpx.AsyncClient, *, max_token: str) -> None:
        self._http = http_client
        self._max_token = max_token

    async def fetch(self, url: str, *, max_bytes: int) -> bytes:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            raise ValidationError("File URL must be http or https")
        headers: dict[str, str] = {}
        host = (parsed.hostname or "").lower()
        if host.endswith("max.ru") or host.endswith("oneme.ru") or host.endswith("okcdn.ru"):
            headers["Authorization"] = self._max_token
        response = await self._http.get(
            url, headers=headers, follow_redirects=False, timeout=30.0
        )
        if response.status_code != 200:
            raise ValidationError(f"Failed to download file: HTTP {response.status_code}")
        data = response.content
        if len(data) > max_bytes:
            raise ValidationError("File exceeds size limit")
        return data
