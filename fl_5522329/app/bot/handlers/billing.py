from __future__ import annotations

import logging

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, LabeledPrice, Message, PreCheckoutQuery
from sqlalchemy.ext.asyncio import AsyncSession

from app.billing.subscription import activate_pro
from app.bot.keyboards import main_menu
from app.config import Settings
from app.db.models import User

logger = logging.getLogger(__name__)
router = Router(name="billing")

_TITLE = "Pro на 30 дней"
_DESCRIPTION = (
    "Безлимит таро и вопросов астрологу, синастрия и прогноз на месяц. "
    "Цена продукта 299 ₽/мес, списание в Telegram Stars."
)


async def _invoice(bot, chat_id: int, user_id: int, settings: Settings) -> None:
    await bot.send_invoice(
        chat_id=chat_id,
        title=_TITLE,
        description=_DESCRIPTION,
        payload=f"pro:{user_id}",
        currency="XTR",
        prices=[LabeledPrice(label="Pro 30 дней", amount=settings.pro_price_stars)],
    )


@router.message(Command("pro"))
@router.callback_query(F.data == "buy_pro")
async def buy(event: Message | CallbackQuery, db_user: User | None, settings: Settings, bot) -> None:
    if db_user is None:
        if isinstance(event, CallbackQuery):
            await event.answer("Нажми /start", show_alert=True)
        return
    chat_id = event.chat.id if isinstance(event, Message) else event.from_user.id
    await _invoice(bot, chat_id, db_user.telegram_id, settings)
    if isinstance(event, CallbackQuery):
        await event.answer()


@router.pre_checkout_query()
async def pre_checkout(query: PreCheckoutQuery) -> None:
    expected = f"pro:{query.from_user.id}"
    if query.invoice_payload != expected or query.currency != "XTR":
        await query.answer(ok=False, error_message="Этот счёт не подходит.")
        return
    await query.answer(ok=True)


@router.message(F.successful_payment)
async def paid(message: Message, session: AsyncSession, settings: Settings, db_user: User | None) -> None:
    payment = message.successful_payment
    if payment is None or db_user is None:
        return
    expected = f"pro:{message.from_user.id}"
    if payment.invoice_payload != expected or payment.currency != "XTR":
        await message.answer("Оплата пришла, но не совпала с этим аккаунтом. Напиши в поддержку бота.")
        return
    await activate_pro(
        session,
        message.from_user.id,
        payment.telegram_payment_charge_id,
        settings.pro_period_days,
    )
    await message.answer(
        f"Pro включён на {settings.pro_period_days} дней. Лимиты таро и вопросов сняты.",
        reply_markup=main_menu(settings.webapp_url),
    )
