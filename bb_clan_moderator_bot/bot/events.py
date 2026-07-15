"""Fire-and-forget dashboard event publisher used by the Telegram bot."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from bot.config import Config

logger = logging.getLogger(__name__)


async def publish_dashboard_event(config: Config, event: dict[str, Any]) -> None:
    """Notify dashboard API so connected WebSocket clients refresh.

    Never raises — bot flows must not fail because UI push failed.
    """
    base = (config.dashboard_events_url or "").rstrip("/")
    if not base:
        return

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if config.dashboard_api_key:
        headers["X-API-Key"] = config.dashboard_api_key

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.post(
                f"{base}/internal/events",
                json=event,
                headers=headers,
            )
        if response.status_code >= 400:
            logger.warning(
                "Dashboard event publish failed status=%s body=%s",
                response.status_code,
                response.text[:200],
            )
    except Exception:
        logger.warning("Dashboard event publish error", exc_info=True)
