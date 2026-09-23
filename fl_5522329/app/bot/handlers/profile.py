from __future__ import annotations

import logging

import httpx
from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.keyboards import main_menu, place_keyboard
from app.bot.states import ProfileForm
from app.config import Settings
from app.db.models import User
from app.geo.coords import clean_place, parse_birth_date, parse_birth_time, parse_coord_pair
from app.geo.coords import InputError
from app.geo.nominatim import search_places
from app.services import save_profile
from app.texts import DISCLAIMER_LINE

logger = logging.getLogger(__name__)
router = Router(name="profile")


def _summary(row) -> str:
    note = ""
    if not row.birth_time_known:
        note = "\nВремя неизвестно: асцендент посчитан на 12:00 и может отличаться."
    return (
        "Натальная карта сохранена.\n"
        f"Солнце: {row.sun_sign}\n"
        f"Луна: {row.moon_sign}\n"
        f"Асцендент: {row.ascendant_sign}\n"
        f"Место: {row.birth_place} ({float(row.latitude):.4f}, {float(row.longitude):.4f})."
        f"{note}\n\n{DISCLAIMER_LINE}"
    )


async def _begin(message: Message, state: FSMContext) -> None:
    await state.set_state(ProfileForm.birth_date)
    await message.answer("Дата рождения в формате ДД.ММ.ГГГГ. Отмена: /cancel")


@router.message(Command("profile"))
@router.callback_query(F.data == "menu:profile")
async def begin_profile(event: Message | CallbackQuery, state: FSMContext, db_user: User | None) -> None:
    message = event if isinstance(event, Message) else event.message
    if db_user is None or message is None:
        if isinstance(event, CallbackQuery):
            await event.answer("Нажми /start", show_alert=True)
        return
    await _begin(message, state)
    if isinstance(event, CallbackQuery):
        await event.answer()


@router.message(Command("cancel"))
async def cancel(message: Message, state: FSMContext, settings: Settings) -> None:
    await state.clear()
    await message.answer("Форма сброшена.", reply_markup=main_menu(settings.webapp_url))


@router.message(ProfileForm.birth_date, F.text)
async def on_date(message: Message, state: FSMContext) -> None:
    if message.text.startswith("/"):
        return
    try:
        parsed = parse_birth_date(message.text)
    except InputError as exc:
        await message.answer(str(exc))
        return
    await state.update_data(birth_date=parsed.isoformat())
    await state.set_state(ProfileForm.birth_time)
    await message.answer("Время рождения, ЧЧ:ММ. Если не знаешь, напиши «не знаю».")


@router.message(ProfileForm.birth_time, F.text)
async def on_time(message: Message, state: FSMContext) -> None:
    if message.text.startswith("/"):
        return
    try:
        parsed, known = parse_birth_time(message.text)
    except InputError as exc:
        await message.answer(str(exc))
        return
    await state.update_data(birth_time=parsed.strftime("%H:%M"), birth_time_known=known)
    await state.set_state(ProfileForm.birth_place)
    await message.answer("Город и страна рождения. Или координаты: 55.75, 37.61")


@router.message(ProfileForm.birth_place, F.text)
async def on_place(
    message: Message,
    state: FSMContext,
    session: AsyncSession,
    db_user: User | None,
    http_client: httpx.AsyncClient,
    settings: Settings,
) -> None:
    if db_user is None or message.text.startswith("/"):
        return
    pair = None
    try:
        pair = parse_coord_pair(message.text)
    except InputError as exc:
        await message.answer(str(exc))
        return
    if pair is not None:
        await _store_coords(message, state, session, db_user, settings, "Координаты", pair[0], pair[1])
        return
    try:
        place = clean_place(message.text)
        hits = await search_places(http_client, place, user_agent=settings.nominatim_user_agent)
    except InputError as exc:
        await message.answer(str(exc))
        return
    except httpx.HTTPError:
        logger.exception("geocoder failed")
        await message.answer("Геокодер не ответил. Пришли координаты: широта, долгота.")
        return
    if not hits:
        await message.answer("Место не нашлось. Уточни город или пришли координаты.")
        return
    await state.update_data(
        hits=[{"label": hit.label, "latitude": hit.latitude, "longitude": hit.longitude} for hit in hits]
    )
    await state.set_state(ProfileForm.confirm_place)
    await message.answer("Какое место верное?", reply_markup=place_keyboard([hit.label for hit in hits]))


async def _store_coords(
    message: Message,
    state: FSMContext,
    session: AsyncSession,
    db_user: User,
    settings: Settings,
    place: str,
    latitude: float,
    longitude: float,
) -> None:
    data = await state.get_data()
    from datetime import date, time

    try:
        row = await save_profile(
            session,
            db_user.telegram_id,
            birth_date=date.fromisoformat(data["birth_date"]),
            birth_time=time.fromisoformat(data["birth_time"]),
            birth_time_known=bool(data["birth_time_known"]),
            birth_place=place,
            latitude=latitude,
            longitude=longitude,
        )
    except (InputError, ValueError):
        logger.exception("chart save failed")
        await message.answer("Карта не посчиталась. Проверь дату и координаты, начни с /profile.")
        return
    await state.clear()
    await message.answer(_summary(row), reply_markup=main_menu(settings.webapp_url))


@router.callback_query(ProfileForm.confirm_place, F.data == "place:cancel")
async def place_cancel(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(ProfileForm.birth_place)
    if callback.message:
        await callback.message.answer("Напиши место ещё раз.")
    await callback.answer()


@router.callback_query(ProfileForm.confirm_place, F.data.startswith("place:"))
async def place_pick(
    callback: CallbackQuery,
    state: FSMContext,
    session: AsyncSession,
    db_user: User | None,
    settings: Settings,
) -> None:
    if db_user is None or callback.message is None or callback.data is None:
        await callback.answer()
        return
    raw = callback.data.removeprefix("place:")
    if not raw.isdigit():
        await callback.answer()
        return
    data = await state.get_data()
    hits = data.get("hits") or []
    index = int(raw)
    if index >= len(hits):
        await callback.answer("Список устарел, введи место снова", show_alert=True)
        return
    hit = hits[index]
    await _store_coords(
        callback.message,
        state,
        session,
        db_user,
        settings,
        hit["label"],
        float(hit["latitude"]),
        float(hit["longitude"]),
    )
    await callback.answer()
