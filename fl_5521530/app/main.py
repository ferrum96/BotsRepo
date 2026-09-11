from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from pydantic import ValidationError

from app.api.health import router as health_router
from app.api.max_webhook import router as webhook_router
from app.config import Settings, get_settings
from app.container import AppContainer, build_ai_client
from app.infrastructure.database.session import create_engine, create_session_factory
from app.infrastructure.max_api.client import MaxApiClient
from app.infrastructure.max_api.long_polling import run_long_polling
from app.infrastructure.scheduler.runner import create_scheduler
from app.logging import setup_logging
from app.max_bot.commands import BOT_COMMANDS, WEBHOOK_UPDATE_TYPES

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings | None = getattr(app.state, "settings", None)
    if settings is None:
        try:
            settings = get_settings()
        except ValidationError as exc:
            raise SystemExit(f"Invalid configuration, missing required secret: {exc}") from exc
        app.state.settings = settings
    setup_logging(settings.log_level)
    engine = create_engine(settings.database_url)
    session_factory = create_session_factory(engine)
    http_client = httpx.AsyncClient(timeout=settings.http_timeout_seconds)
    max_client = MaxApiClient(
        base_url=settings.max_api_base_url,
        token=settings.max_bot_token,
        timeout_seconds=settings.http_timeout_seconds,
        http_client=http_client,
    )
    ai_client = build_ai_client(settings, http_client)
    container = AppContainer(
        settings=settings,
        engine=engine,
        session_factory=session_factory,
        http_client=http_client,
        max_client=max_client,
        ai_client=ai_client,
    )
    app.state.container = container

    try:
        me = await max_client.get_me()
        logger.info("MAX bot connected user_id=%s username=%s", me.user_id, me.username)
        await max_client.set_commands(BOT_COMMANDS)
        if settings.max_use_long_polling:
            logger.warning("MAX_USE_LONG_POLLING=true; webhook will not be registered")
        elif settings.max_webhook_url:
            await max_client.subscribe_webhook(
                url=settings.max_webhook_url,
                secret=settings.max_webhook_secret,
                update_types=WEBHOOK_UPDATE_TYPES,
            )
            logger.info("MAX webhook registered")
    except Exception:
        logger.exception("MAX startup handshake failed")
        await http_client.aclose()
        await engine.dispose()
        raise

    scheduler = create_scheduler(container)
    scheduler.start()
    stop_polling = asyncio.Event()
    poll_task = None
    if settings.max_use_long_polling:
        poll_task = asyncio.create_task(run_long_polling(container, stop_polling))

    yield

    stop_polling.set()
    if poll_task is not None:
        poll_task.cancel()
        try:
            await poll_task
        except asyncio.CancelledError:
            pass
    scheduler.shutdown(wait=False)
    await ai_client.aclose()
    await max_client.aclose()
    await http_client.aclose()
    await engine.dispose()


def create_app(settings: Settings | None = None) -> FastAPI:
    application = FastAPI(title="MAX Shop Bot", lifespan=lifespan)
    application.include_router(health_router)
    application.include_router(webhook_router)
    if settings is not None:
        application.state.settings = settings
    return application


app = create_app()
