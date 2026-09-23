from __future__ import annotations

import logging

import httpx
import uvicorn
from aiogram import Bot
from redis.asyncio import Redis

from app.api.app import create_api
from app.bot.factory import make_dispatcher
from app.config import get_settings
from app.db.session import make_engine, make_session_factory
from app.limits.service import LimitService

logger = logging.getLogger(__name__)


def build():
    settings = get_settings()
    if not settings.bot_token:
        raise SystemExit("BOT_TOKEN is required")
    engine = make_engine(settings.database_url)
    session_factory = make_session_factory(engine)
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    http_client = httpx.AsyncClient(timeout=settings.http_timeout_seconds)
    bot = Bot(token=settings.bot_token)
    limit_service = LimitService(redis, settings)
    dispatcher = make_dispatcher(settings.redis_url, session_factory)
    dispatcher.workflow_data.update(
        {
            "settings": settings,
            "http_client": http_client,
            "limit_service": limit_service,
        }
    )
    app = create_api(settings, session_factory, bot, dispatcher, limit_service, http_client)
    app.state.engine = engine
    app.state.redis = redis
    return app


def main() -> None:
    settings = get_settings()
    logging.basicConfig(level=settings.log_level.upper())
    uvicorn.run(
        "app.main:build",
        factory=True,
        host=settings.app_host,
        port=settings.app_port,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
