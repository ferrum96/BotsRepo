from __future__ import annotations

import json
import logging
from typing import Any, Protocol

import httpx

from app.domain.exceptions import AIGenerationError
from app.infrastructure.ai.schemas import JSON_SCHEMA, ProductContentSchema, SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class AIProvider(Protocol):
    async def generate_product_content(
        self, product_data: dict[str, Any], *, show_stock: bool
    ) -> ProductContentSchema: ...


class OpenAIResponsesClient:
    """OpenAI Responses API adapter. Validates output with Pydantic."""

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model: str,
        timeout_seconds: float,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout = httpx.Timeout(timeout_seconds, connect=10.0)
        self._owns_client = http_client is None
        self._http = http_client or httpx.AsyncClient(timeout=self._timeout)

    async def aclose(self) -> None:
        if self._owns_client:
            await self._http.aclose()

    async def generate_product_content(
        self, product_data: dict[str, Any], *, show_stock: bool
    ) -> ProductContentSchema:
        user_payload = {
            "PRODUCT_DATA": product_data,
            "SHOW_STOCK": show_stock,
        }
        body = {
            "model": self._model,
            "input": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(user_payload, ensure_ascii=False),
                },
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "product_post",
                    "strict": True,
                    "schema": JSON_SCHEMA,
                }
            },
        }
        response = await self._http.post(
            f"{self._base_url}/responses",
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            json=body,
            timeout=self._timeout,
        )
        if response.status_code != 200:
            logger.warning("AI provider HTTP %s", response.status_code)
            raise AIGenerationError(f"AI provider returned HTTP {response.status_code}")
        try:
            payload = response.json()
        except ValueError as exc:
            raise AIGenerationError("AI provider returned invalid JSON") from exc
        raw_text = _extract_output_text(payload)
        try:
            data = json.loads(raw_text)
        except json.JSONDecodeError as exc:
            raise AIGenerationError("AI output is not valid JSON") from exc
        try:
            return ProductContentSchema.model_validate(data)
        except Exception as exc:
            raise AIGenerationError(f"AI output failed validation: {exc}") from exc


def _extract_output_text(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str) and payload["output_text"].strip():
        return payload["output_text"]
    chunks: list[str] = []
    for item in payload.get("output") or []:
        if not isinstance(item, dict):
            continue
        for content in item.get("content") or []:
            if not isinstance(content, dict):
                continue
            text = content.get("text") or content.get("output_text")
            if isinstance(text, str):
                chunks.append(text)
    if chunks:
        return "\n".join(chunks)
    raise AIGenerationError("AI provider response has no text output")
