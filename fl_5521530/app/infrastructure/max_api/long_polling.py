from __future__ import annotations

import asyncio
import logging

from app.container import AppContainer, build_bot_services
from app.infrastructure.database.session import session_scope
from app.max_bot.commands import WEBHOOK_UPDATE_TYPES
from app.max_bot.handlers import dispatch
from app.max_bot.update_mapper import map_update
from app.api.max_webhook import _deliver

logger = logging.getLogger(__name__)


async def run_long_polling(container: AppContainer, stop: asyncio.Event) -> None:
    marker: int | None = None
    logger.warning("long polling enabled; production must use HTTPS webhook")
    while not stop.is_set():
        try:
            updates, marker = await container.max_client.get_updates(
                marker=marker,
                timeout=30,
                types=WEBHOOK_UPDATE_TYPES,
            )
            for raw in updates:
                event = map_update(raw)
                async with session_scope(container.session_factory) as session:
                    services = build_bot_services(session, container)
                    response = await dispatch(event, services)
                await _deliver(container.max_client, event, response)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("long polling cycle failed")
            await asyncio.sleep(3)
