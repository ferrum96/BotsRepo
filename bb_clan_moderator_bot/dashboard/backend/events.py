"""In-memory WebSocket hub for live dashboard updates."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class EventHub:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._clients.add(websocket)
        logger.info("Dashboard WS connected (clients=%s)", len(self._clients))

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(websocket)
        logger.info("Dashboard WS disconnected (clients=%s)", len(self._clients))

    async def broadcast(self, event: dict[str, Any]) -> int:
        payload = json.dumps(event, ensure_ascii=False)
        async with self._lock:
            clients = list(self._clients)
        if not clients:
            return 0

        dead: list[WebSocket] = []
        sent = 0
        for websocket in clients:
            try:
                await websocket.send_text(payload)
                sent += 1
            except Exception:
                logger.debug("Failed to push WS event to client", exc_info=True)
                dead.append(websocket)

        if dead:
            async with self._lock:
                for websocket in dead:
                    self._clients.discard(websocket)
        return sent
