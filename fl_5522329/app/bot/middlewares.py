from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message, PreCheckoutQuery, TelegramObject, Update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.bot.keyboards import disclaimer_keyboard
from app.db.models import User
from app.texts import DISCLAIMER_MESSAGE

logger = logging.getLogger(__name__)


def _inner_event(event: TelegramObject) -> TelegramObject:
    if isinstance(event, Update):
        return event.event or event
    return event


def _from_user(event: TelegramObject):
    inner = _inner_event(event)
    if isinstance(inner, (Message, CallbackQuery, PreCheckoutQuery)):
        return inner.from_user
    return None


def _is_start(event: TelegramObject) -> bool:
    return isinstance(event, Message) and bool(event.text) and event.text.startswith("/start")


def _is_accept(event: TelegramObject) -> bool:
    return isinstance(event, CallbackQuery) and event.data == "disclaimer:accept"


def _is_payment(event: TelegramObject) -> bool:
    if isinstance(event, PreCheckoutQuery):
        return True
    return isinstance(event, Message) and event.successful_payment is not None


class DbSessionMiddleware(BaseMiddleware):
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self.session_factory = session_factory

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        async with self.session_factory() as session:
            data["session"] = session
            try:
                result = await handler(event, data)
            except Exception:
                await session.rollback()
                raise
            else:
                await session.commit()
                return result


class DisclaimerMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        inner = _inner_event(event)
        if _is_start(inner) or _is_accept(inner) or _is_payment(inner):
            return await handler(event, data)
        user: User | None = data.get("db_user")
        if user is not None and user.disclaimer_accepted_at is not None:
            return await handler(event, data)
        if isinstance(inner, Message):
            await inner.answer(DISCLAIMER_MESSAGE, reply_markup=disclaimer_keyboard())
        elif isinstance(inner, CallbackQuery):
            await inner.answer("Сначала прими дисклеймер через /start", show_alert=True)
        return None


class LoadUserMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        tg_user = _from_user(event)
        if tg_user is None:
            return await handler(event, data)
        session: AsyncSession = data["session"]
        data["db_user"] = await session.get(User, tg_user.id)
        return await handler(event, data)
