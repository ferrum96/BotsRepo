from __future__ import annotations

import logging

from aiogram import F, Router
from aiogram.filters import Command, CommandObject
from aiogram.types import CallbackQuery, Message
from sqlalchemy.ext.asyncio import AsyncSession

from app.billing.subscription import user_is_pro
from app.bot.keyboards import buy_keyboard
from app.config import Settings
from app.db.models import User
from app.limits.service import TAROT, LimitService
from app.services import find_by_username, increment_daily_limit, latest_chart
from app.services.readings import daily_horoscope, monthly_forecast, synastry_text
from app.tarot.draw import draw_three, render_spread
from app.timeutil import msk_today

logger = logging.getLogger(__name__)
router = Router(name="readings")

_NEED_CHART = "Сначала сохрани дату рождения: /profile"


async def _send(event: Message | CallbackQuery, text: str, markup=None) -> None:
    message = event if isinstance(event, Message) else event.message
    if message is None:
        if isinstance(event, CallbackQuery):
            await event.answer()
        return
    await message.answer(text, reply_markup=markup)
    if isinstance(event, CallbackQuery):
        await event.answer()


async def _require_chart(event: Message | CallbackQuery, session: AsyncSession, user_id: int):
    row = await latest_chart(session, user_id)
    if row is None:
        await _send(event, _NEED_CHART)
    return row


async def _require_pro(event: Message | CallbackQuery, session: AsyncSession, user_id: int) -> bool:
    if await user_is_pro(session, user_id):
        return True
    await _send(event, "Синастрия и прогноз на месяц входят в Pro.", buy_keyboard())
    return False


@router.message(Command("horoscope"))
@router.callback_query(F.data == "menu:horoscope")
async def horoscope(event: Message | CallbackQuery, session: AsyncSession, db_user: User | None) -> None:
    if db_user is None:
        return
    row = await _require_chart(event, session, db_user.telegram_id)
    if row is None:
        return
    await _send(event, daily_horoscope(row))


@router.message(Command("tarot"))
@router.callback_query(F.data == "menu:tarot")
async def tarot(
    event: Message | CallbackQuery,
    session: AsyncSession,
    db_user: User | None,
    limit_service: LimitService,
) -> None:
    if db_user is None:
        return
    row = await _require_chart(event, session, db_user.telegram_id)
    if row is None:
        return
    is_pro = await user_is_pro(session, db_user.telegram_id)
    decision = await limit_service.consume(db_user.telegram_id, TAROT, is_pro)
    if not decision.allowed:
        await _send(
            event,
            "На сегодня бесплатное таро уже использовано. Pro снимает лимит.",
            buy_keyboard(),
        )
        return
    if not is_pro:
        await increment_daily_limit(session, db_user.telegram_id, TAROT, msk_today())
    await _send(event, render_spread(draw_three()))


@router.message(Command("monthly"))
async def monthly(
    message: Message,
    session: AsyncSession,
    db_user: User | None,
) -> None:
    if db_user is None:
        return
    if not await _require_pro(message, session, db_user.telegram_id):
        return
    row = await _require_chart(message, session, db_user.telegram_id)
    if row is None:
        return
    await message.answer(monthly_forecast(row))


@router.message(Command("synastry"))
async def synastry(
    message: Message,
    command: CommandObject,
    session: AsyncSession,
    db_user: User | None,
    bot,
) -> None:
    if db_user is None:
        return
    if not await _require_pro(message, session, db_user.telegram_id):
        return
    left = await _require_chart(message, session, db_user.telegram_id)
    if left is None:
        return
    username = (command.args or "").strip()
    if not username:
        await message.answer("Формат: /synastry @username")
        return
    other = await find_by_username(session, username)
    if other is not None and other.telegram_id == db_user.telegram_id:
        await message.answer("С собой синастрию не считаю. Нужен другой человек.")
        return
    if other is None:
        me = await bot.get_me()
        from app.referral import referral_link

        link = referral_link(me.username or "", db_user.telegram_id)
        await message.answer(
            "Нужна карта человека, который уже запускал бота и сохранил дату рождения. "
            f"Приглашение: {link}"
        )
        return
    right = await latest_chart(session, other.telegram_id)
    if right is None:
        await message.answer("У этого человека ещё нет натальной карты.")
        return
    report = synastry_text(
        left,
        right,
        db_user.username or "ты",
        other.username or username.lstrip("@"),
    )
    await message.answer(report.text)
