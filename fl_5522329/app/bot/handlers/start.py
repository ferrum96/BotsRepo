from __future__ import annotations

import logging

from aiogram import F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.keyboards import disclaimer_keyboard, main_menu, share_keyboard
from app.db.models import User
from app.referral import parse_referrer, referral_link, share_url
from app.services import accept_disclaimer, referral_count, upsert_user
from app.texts import DISCLAIMER_MESSAGE

logger = logging.getLogger(__name__)
router = Router(name="start")


def _menu_text(is_ready: bool) -> str:
    if is_ready:
        return (
            "Можно смотреть гороскоп, тянуть таро или просто написать вопрос. "
            "Pro снимает дневные лимиты и открывает синастрию с прогнозом на месяц."
        )
    return "Сначала прими короткое условие, потом бот откроет меню."


@router.message(CommandStart())
async def cmd_start(
    message: Message,
    command: CommandObject,
    session: AsyncSession,
    db_user: User | None,
    state: FSMContext,
    settings,
) -> None:
    await state.clear()
    referrer = parse_referrer(command.args)
    if db_user is not None and referrer == message.from_user.id:
        referrer = None
    user = await upsert_user(
        session,
        message.from_user.id,
        message.from_user.username,
        referred_by=None if db_user is not None else referrer,
    )
    if user.disclaimer_accepted_at is None:
        await message.answer(DISCLAIMER_MESSAGE, reply_markup=disclaimer_keyboard())
        return
    await message.answer(_menu_text(True), reply_markup=main_menu(settings.webapp_url))


@router.callback_query(F.data == "disclaimer:accept")
async def accept(callback: CallbackQuery, session: AsyncSession, db_user: User | None, settings) -> None:
    if db_user is None or callback.message is None:
        await callback.answer("Нажми /start", show_alert=True)
        return
    await accept_disclaimer(session, db_user)
    await callback.message.answer(_menu_text(True), reply_markup=main_menu(settings.webapp_url))
    await callback.answer("Принято")


@router.callback_query(F.data == "menu:invite")
@router.message(Command("invite"))
async def invite(event: Message | CallbackQuery, session: AsyncSession, db_user: User | None, bot) -> None:
    message = event if isinstance(event, Message) else event.message
    if db_user is None or message is None:
        if isinstance(event, CallbackQuery):
            await event.answer("Нажми /start", show_alert=True)
        return
    me = await bot.get_me()
    link = referral_link(me.username or "", db_user.telegram_id)
    count = await referral_count(session, db_user.telegram_id)
    text = (
        f"Проверь совместимость с другом. Твоя ссылка:\n{link}\n"
        f"Уже пришли по ней: {count}."
    )
    await message.answer(text, reply_markup=share_keyboard(share_url(link)))
    if isinstance(event, CallbackQuery):
        await event.answer()
