from __future__ import annotations

import logging
from datetime import UTC, datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.container import AppContainer, build_bot_services
from app.infrastructure.database.session import session_scope

logger = logging.getLogger(__name__)


def create_scheduler(container: AppContainer) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone=container.settings.timezone)

    async def publish_due_job() -> None:
        try:
            async with session_scope(container.session_factory) as session:
                services = build_bot_services(session, container)
                channel_id = await services.shop.channel_id()
                show_stock = await services.shop.show_stock()
                now = datetime.now(UTC)
                published = await services.scheduling.publish_due(
                    now, channel_id=channel_id, show_stock=show_stock
                )
                if published:
                    logger.info("scheduler published %s items", len(published))
        except Exception:
            logger.exception("scheduler job failed")

    scheduler.add_job(publish_due_job, "interval", minutes=1, id="publish_due")
    return scheduler
