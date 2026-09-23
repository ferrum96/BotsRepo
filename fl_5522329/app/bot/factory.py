from __future__ import annotations

import logging

from aiogram import Dispatcher, Router
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.types import ErrorEvent
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.bot.handlers import billing, chat, profile, readings, start
from app.bot.middlewares import DbSessionMiddleware, DisclaimerMiddleware, LoadUserMiddleware

logger = logging.getLogger(__name__)


def build_router() -> Router:
    root = Router()
    root.include_router(start.router)
    root.include_router(billing.router)
    root.include_router(readings.router)
    root.include_router(profile.router)
    root.include_router(chat.router)
    return root


def make_dispatcher(
    redis_url: str,
    session_factory: async_sessionmaker[AsyncSession],
    redis: Redis | None = None,
) -> Dispatcher:
    storage = RedisStorage.from_url(redis_url) if redis is None else RedisStorage(redis=redis)
    dp = Dispatcher(storage=storage)
    dp.update.middleware(DbSessionMiddleware(session_factory))
    dp.update.middleware(LoadUserMiddleware())
    dp.update.middleware(DisclaimerMiddleware())
    dp.include_router(build_router())

    @dp.error()
    async def on_error(event: ErrorEvent) -> None:
        logger.exception("handler failed", exc_info=event.exception)
        update = event.update
        message = update.message or (update.callback_query.message if update.callback_query else None)
        if message is not None:
            await message.answer("Не получилось обработать запрос. Попробуй ещё раз.")

    return dp
