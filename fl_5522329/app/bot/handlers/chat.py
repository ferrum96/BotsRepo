from __future__ import annotations

import logging

import httpx
from aiogram import F, Router
from aiogram.types import Message
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.client import AiError
from app.billing.subscription import user_is_pro
from app.bot.keyboards import buy_keyboard
from app.config import Settings
from app.db.models import User
from app.limits.service import AI, LimitService
from app.services import increment_daily_limit, latest_chart
from app.services.chat import answer_astrology_question
from app.timeutil import msk_today

logger = logging.getLogger(__name__)
router = Router(name="chat")


@router.message(F.text, ~F.text.startswith("/"))
async def ask(
    message: Message,
    session: AsyncSession,
    db_user: User | None,
    limit_service: LimitService,
    settings: Settings,
    http_client: httpx.AsyncClient,
) -> None:
    if db_user is None or message.text is None:
        return
    row = await latest_chart(session, db_user.telegram_id)
    if row is None:
        await message.answer("Сначала сохрани дату рождения: /profile")
        return
    if not settings.openrouter_api_key:
        await message.answer("ИИ-чат не настроен: в окружении нет OPENROUTER_API_KEY.")
        return
    is_pro = await user_is_pro(session, db_user.telegram_id)
    decision = await limit_service.consume(db_user.telegram_id, AI, is_pro)
    if not decision.allowed:
        await message.answer(
            "Бесплатный вопрос на сегодня уже использован. Pro снимает лимит.",
            reply_markup=buy_keyboard(),
        )
        return
    try:
        answer = await answer_astrology_question(
            session, http_client, settings, row, message.text
        )
    except AiError:
        logger.exception("ai chat failed")
        await limit_service.refund(db_user.telegram_id, AI)
        await message.answer("Астролог сейчас не отвечает. Лимит этого вопроса не списан.")
        return
    if not is_pro:
        await increment_daily_limit(session, db_user.telegram_id, AI, msk_today())
    await message.answer(answer)
