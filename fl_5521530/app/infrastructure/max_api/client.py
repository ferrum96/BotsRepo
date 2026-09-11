from __future__ import annotations

import asyncio
import logging
from typing import Any, Protocol

import httpx

from app.infrastructure.max_api.errors import classify_max_error
from app.infrastructure.max_api.models import BotInfo, SentMessage, UploadSlot

logger = logging.getLogger(__name__)

_RETRYABLE = {429, 503}
_MAX_RETRIES = 3


class MessengerGateway(Protocol):
    """Outbound MAX operations used by application services."""

    async def send_message(
        self,
        *,
        user_id: int | None = None,
        chat_id: int | None = None,
        text: str,
        attachments: list[dict[str, Any]] | None = None,
        format: str | None = None,
        notify: bool = True,
    ) -> SentMessage: ...

    async def answer_callback(
        self,
        callback_id: str,
        *,
        message: dict[str, Any] | None = None,
        notification: str | None = None,
    ) -> None: ...

    async def prepare_image_upload(self) -> UploadSlot: ...

    async def upload_file(self, upload_url: str, data: bytes, filename: str) -> str: ...


class MaxApiClient:
    """Thin HTTP client for platform-api2.max.ru. No business logic."""

    def __init__(
        self,
        *,
        base_url: str,
        token: str,
        timeout_seconds: float,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._token = token
        self._timeout = httpx.Timeout(timeout_seconds, connect=10.0)
        self._owns_client = http_client is None
        self._http = http_client or httpx.AsyncClient(timeout=self._timeout)

    async def aclose(self) -> None:
        if self._owns_client:
            await self._http.aclose()

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": self._token,
            "Content-Type": "application/json",
        }

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        retry: bool = True,
    ) -> dict[str, Any] | list[Any] | None:
        url = f"{self._base_url}{path}"
        last_error: Exception | None = None
        attempts = _MAX_RETRIES if retry else 1
        for attempt in range(1, attempts + 1):
            response = await self._http.request(
                method,
                url,
                headers=self._headers(),
                params=params,
                json=json,
                timeout=self._timeout,
            )
            if response.status_code == 200:
                if not response.content:
                    return None
                try:
                    return response.json()
                except ValueError as exc:
                    raise classify_max_error(200, "invalid JSON in MAX response") from exc
            retry_after = _parse_retry_after(response)
            error = classify_max_error(
                response.status_code,
                _safe_body(response),
                retry_after=retry_after,
            )
            if response.status_code in _RETRYABLE and attempt < attempts:
                wait = retry_after if retry_after is not None else 0.05 * attempt
                logger.warning("MAX API %s, retry %s in %ss", response.status_code, attempt, wait)
                await asyncio.sleep(wait)
                last_error = error
                continue
            raise error
        raise last_error or classify_max_error(500, "MAX request failed")

    async def get_me(self) -> BotInfo:
        payload = await self._request("GET", "/me")
        data = _as_dict(payload)
        return BotInfo(
            user_id=int(data.get("user_id") or 0),
            username=data.get("username"),
            first_name=data.get("first_name"),
            raw=data,
        )

    async def set_commands(self, commands: list[dict[str, str]]) -> None:
        await self._request("PATCH", "/me/commands", json={"commands": commands})

    async def subscribe_webhook(
        self, *, url: str, secret: str, update_types: list[str]
    ) -> None:
        await self._request(
            "POST",
            "/subscriptions",
            json={"url": url, "secret": secret, "update_types": update_types},
        )

    async def list_subscriptions(self) -> list[dict[str, Any]]:
        payload = await self._request("GET", "/subscriptions")
        if payload is None:
            return []
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        data = _as_dict(payload)
        items = data.get("subscriptions") or []
        return [item for item in items if isinstance(item, dict)]

    async def get_updates(
        self,
        *,
        marker: int | None = None,
        timeout: int = 30,
        types: list[str] | None = None,
    ) -> tuple[list[dict[str, Any]], int | None]:
        params: dict[str, Any] = {"timeout": timeout}
        if marker is not None:
            params["marker"] = marker
        if types:
            params["types"] = ",".join(types)
        payload = await self._request("GET", "/updates", params=params, retry=False)
        data = _as_dict(payload)
        updates = data.get("updates") or []
        next_marker = data.get("marker")
        return list(updates), next_marker

    async def send_message(
        self,
        *,
        user_id: int | None = None,
        chat_id: int | None = None,
        text: str,
        attachments: list[dict[str, Any]] | None = None,
        format: str | None = None,
        notify: bool = True,
    ) -> SentMessage:
        params: dict[str, Any] = {}
        if user_id is not None:
            params["user_id"] = user_id
        if chat_id is not None:
            params["chat_id"] = chat_id
        body: dict[str, Any] = {"text": text, "notify": notify}
        if attachments:
            body["attachments"] = attachments
        if format:
            body["format"] = format
        payload = await self._request("POST", "/messages", params=params, json=body)
        data = _as_dict(payload)
        message = data.get("message") if isinstance(data.get("message"), dict) else data
        body_block = message.get("body") if isinstance(message.get("body"), dict) else {}
        recipient = message.get("recipient") if isinstance(message.get("recipient"), dict) else {}
        message_id = body_block.get("mid") or message.get("body", {}).get("mid") if isinstance(message.get("body"), dict) else None
        if message_id is None:
            message_id = message.get("id")
        return SentMessage(
            message_id=str(message_id) if message_id is not None else None,
            chat_id=recipient.get("chat_id"),
            raw=data,
        )

    async def answer_callback(
        self,
        callback_id: str,
        *,
        message: dict[str, Any] | None = None,
        notification: str | None = None,
    ) -> None:
        body: dict[str, Any] = {}
        if message is not None:
            body["message"] = message
        if notification is not None:
            body["notification"] = notification
        await self._request(
            "POST",
            "/answers",
            params={"callback_id": callback_id},
            json=body,
        )

    async def prepare_image_upload(self) -> UploadSlot:
        payload = await self._request("POST", "/uploads", params={"type": "image"})
        data = _as_dict(payload)
        url = data.get("url")
        if not url:
            raise classify_max_error(400, "uploads response missing url")
        return UploadSlot(url=str(url), token=data.get("token"))

    async def upload_file(self, upload_url: str, data: bytes, filename: str) -> str:
        response = await self._http.post(
            upload_url,
            files={"data": (filename, data)},
            timeout=httpx.Timeout(60.0, connect=10.0),
        )
        if response.status_code != 200:
            raise classify_max_error(response.status_code, _safe_body(response))
        try:
            payload = response.json()
        except ValueError as exc:
            raise classify_max_error(response.status_code, "invalid upload JSON") from exc
        token = _extract_token(payload)
        if not token:
            raise classify_max_error(400, "upload response missing token")
        return token


def _as_dict(payload: dict[str, Any] | list[Any] | None) -> dict[str, Any]:
    if isinstance(payload, dict):
        return payload
    return {}


def _safe_body(response: httpx.Response) -> str:
    text = response.text or ""
    return text[:500]


def _parse_retry_after(response: httpx.Response) -> int | None:
    raw = response.headers.get("Retry-After")
    if not raw:
        return None
    try:
        return max(0, int(raw))
    except ValueError:
        return None


def _extract_token(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    if payload.get("token"):
        return str(payload["token"])
    photos = payload.get("photos")
    if isinstance(photos, dict):
        for item in photos.values():
            if isinstance(item, dict) and item.get("token"):
                return str(item["token"])
    nested = payload.get("payload")
    if isinstance(nested, dict) and nested.get("token"):
        return str(nested["token"])
    return None
