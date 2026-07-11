"""Lead form handler for collecting product information."""

import logging
from html import escape

from aiogram import Router, F
from aiogram.types import Message, CallbackQuery
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup

from bot.config import Config
from bot.database import Database
from bot.keyboards import (
    CATEGORY_KB, BUDGET_KB, TIMELINE_KB, BACK_ONLY_KB,
    ADD_MORE_KB, AFTER_DESC_KB, NEW_REQUEST_KB,
    CATEGORIES, BUDGETS, TIMELINES,
)

router = Router()
logger = logging.getLogger(__name__)


class LeadForm(StatesGroup):
    category = State()
    product_description = State()
    product_files = State()
    budget = State()
    timeline = State()


def calculate_lead_score(budget: str, timeline: str) -> str:
    budget_val = 0
    if "50" in budget:
        budget_val = 50000
    elif "30" in budget:
        budget_val = 30000
    elif "10" in budget:
        budget_val = 10000

    if budget_val >= 50000:
        return "ГОРЯЧИЙ 🔥"
    if budget_val >= 30000 and "этой неделе" in timeline:
        return "ГОРЯЧИЙ 🔥"
    if budget_val >= 10000 and ("2 недели" in timeline or "месяце" in timeline):
        return "Теплый 💛"
    return "Холодный 🧊"


def get_file_url(config: Config, file_id: int) -> str:
    return f"http://{config.hostname}:{config.file_server_port}/files/{file_id}"


def _format_admin_contact_line(username: str | None) -> str:
    if username:
        return f'💬 <a href="https://t.me/{username}">Написать в ЛС</a>'
    return "💬 username не указан"


@router.message(F.text == "/start")
async def cmd_start(message: Message, state: FSMContext):
    await state.clear()
    await message.answer(
        "Привет! 🌸\n\n"
        "Я помощник админа канала <b>«Дети и Желания»</b> (@fkandu).\n\n"
        "Здесь я делюсь с мамами находками — от милых платьев до гипоаллергенных "
        "паст и классных мест для прогулок. Реклама у нас только искренняя: "
        "я рекомендую то, что действительно нравится мне и моим детям. 💛\n\n"
        "Чтобы я поняла, подходит ли ваш продукт нашему каналу, ответьте на "
        "несколько вопросов:\n\n"
        "<b>1. К какой рубрике относится ваш продукт?</b>",
        reply_markup=CATEGORY_KB,
        parse_mode="HTML",
    )
    await state.set_state(LeadForm.category)


@router.callback_query(F.data.startswith("cat_"), LeadForm.category)
async def process_category(callback: CallbackQuery, state: FSMContext):
    cat_name = CATEGORIES.get(callback.data, callback.data)
    await state.update_data(category=cat_name)
    await callback.message.edit_text(
        f"Принято: <b>{cat_name}</b> ✅\n\n"
        "<b>2. Расскажите коротко о товаре:</b>\n"
        "(Текстом — что за продукт, для кого, чем интересен)",
        reply_markup=BACK_ONLY_KB,
        parse_mode="HTML",
    )
    await state.set_state(LeadForm.product_description)
    await callback.answer()


@router.message(LeadForm.product_description)
async def process_product_description(message: Message, state: FSMContext):
    text = message.text or ""
    if not text:
        await message.answer("Отправьте текстовое описание товара")
        return
    safe_text = escape(text)
    await state.update_data(product_description=safe_text)
    await message.answer(
        f"✅ Описание принято:\n\n<i>{safe_text}</i>\n\n"
        "Также можно прикрепить файлы или перейти дальше:",
        reply_markup=AFTER_DESC_KB,
        parse_mode="HTML",
    )


@router.callback_query(F.data == "attach_files", LeadForm.product_description)
async def attach_files(callback: CallbackQuery, state: FSMContext):
    await callback.message.edit_text(
        "📎 Отправьте документ или фото.\n"
        "Можно отправить несколько файлов, затем нажмите «✅ Далее»:",
        reply_markup=ADD_MORE_KB,
    )
    await state.set_state(LeadForm.product_files)
    await callback.answer()


@router.callback_query(F.data == "skip_files", LeadForm.product_description)
async def skip_files(callback: CallbackQuery, state: FSMContext):
    await callback.message.edit_text(
        "Отлично, спасибо! 💛\n\n"
        "<b>3. Какой бюджет на размещение?</b>",
        reply_markup=BUDGET_KB,
        parse_mode="HTML",
    )
    await state.set_state(LeadForm.budget)
    await callback.answer()


@router.callback_query(F.data == "back", LeadForm.product_description)
async def back_from_description(callback: CallbackQuery, state: FSMContext):
    await callback.message.edit_text(
        "Чтобы я поняла, подходит ли ваш продукт нашему каналу, ответьте на "
        "несколько вопросов:\n\n"
        "<b>1. К какой рубрике относится ваш продукт?</b>",
        reply_markup=CATEGORY_KB,
        parse_mode="HTML",
    )
    await state.set_state(LeadForm.category)
    await callback.answer()


@router.message(LeadForm.product_files)
async def process_product_files(message: Message, state: FSMContext, config: Config, db: Database, bot):
    data = await state.get_data()
    existing = data.get("product_files", "")

    if message.document:
        doc_name = message.document.file_name
        caption = message.caption or ""
        mime = message.document.mime_type or "application/octet-stream"

        file_info = await bot.get_file(message.document.file_id)
        file_bytes = await bot.download_file(file_info.file_path)
        file_content = file_bytes.read()

        file_id = db.save_file(file_content, doc_name, mime)
        file_url = get_file_url(config, file_id)
        part = f'<a href="{file_url}">📎 {escape(doc_name)}</a>'
        if caption:
            part += f"\n{escape(caption)}"
    elif message.photo:
        photo = message.photo[-1]
        file_info = await bot.get_file(photo.file_id)
        file_bytes = await bot.download_file(file_info.file_path)
        file_content = file_bytes.read()

        filename = f"photo_{photo.file_id[:8]}.jpg"
        file_id = db.save_file(file_content, filename, "image/jpeg")
        file_url = get_file_url(config, file_id)
        caption = message.caption or ""
        part = f'<a href="{file_url}">🖼 Фото</a>'
        if caption:
            part += f"\n{escape(caption)}"
    else:
        await message.answer("Отправьте документ или фото")
        return

    if existing:
        new_text = f"{existing}\n{part}"
    else:
        new_text = part

    await state.update_data(product_files=new_text)
    await message.answer(
        f"✅ Файл сохранён.\n\n"
        "Можно отправить ещё или нажать «Далее»:",
        reply_markup=ADD_MORE_KB,
        parse_mode="HTML",
    )


@router.callback_query(F.data == "add_more_file", LeadForm.product_files)
async def add_more_file(callback: CallbackQuery, state: FSMContext):
    await callback.message.edit_text(
        "Отправьте ещё один документ или нажмите «✅ Далее»",
        reply_markup=ADD_MORE_KB,
    )
    await callback.answer()


@router.callback_query(F.data == "finish_files", LeadForm.product_files)
async def finish_files(callback: CallbackQuery, state: FSMContext):
    await callback.message.edit_text(
        "Отлично, спасибо! 💛\n\n"
        "<b>3. Какой бюджет на размещение?</b>",
        reply_markup=BUDGET_KB,
        parse_mode="HTML",
    )
    await state.set_state(LeadForm.budget)
    await callback.answer()


@router.callback_query(F.data == "back", LeadForm.product_files)
async def back_from_files(callback: CallbackQuery, state: FSMContext):
    await callback.message.edit_text(
        "<b>2. Расскажите коротко о товаре:</b>\n"
        "(Текстом — что за продукт, для кого, чем интересен)",
        reply_markup=BACK_ONLY_KB,
        parse_mode="HTML",
    )
    await state.set_state(LeadForm.product_description)
    await callback.answer()


@router.callback_query(F.data.startswith("bud_"), LeadForm.budget)
async def process_budget(callback: CallbackQuery, state: FSMContext):
    bud_name = BUDGETS.get(callback.data, callback.data)
    await state.update_data(budget=bud_name)
    await callback.message.edit_text(
        f"Бюджет: <b>{bud_name}</b> ✅\n\n"
        "<b>4. Когда планируете запуск?</b>",
        reply_markup=TIMELINE_KB,
        parse_mode="HTML",
    )
    await state.set_state(LeadForm.timeline)
    await callback.answer()


@router.callback_query(F.data == "back", LeadForm.budget)
async def back_from_budget(callback: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    if data.get("product_files"):
        await state.set_state(LeadForm.product_files)
        await callback.message.edit_text(
            "📎 Отправьте документ или фото.\n"
            "Можно отправить несколько файлов, затем нажмите «✅ Далее»:",
            reply_markup=ADD_MORE_KB,
        )
    else:
        await state.set_state(LeadForm.product_description)
        await callback.message.edit_text(
            "<b>2. Расскажите коротко о товаре:</b>\n"
            "(Текстом — что за продукт, для кого, чем интересен)",
            reply_markup=BACK_ONLY_KB,
            parse_mode="HTML",
        )
    await callback.answer()


@router.callback_query(F.data.startswith("time_"), LeadForm.timeline)
async def process_timeline(
    callback: CallbackQuery,
    state: FSMContext,
    config: Config,
    db: Database,
    bot,
):
    timeline_text = TIMELINES.get(callback.data, callback.data)
    await state.update_data(timeline=timeline_text)

    data = await state.get_data()
    user = callback.from_user
    score = calculate_lead_score(data["budget"], timeline_text)

    desc = data.get("product_description", "")
    files = data.get("product_files", "")
    product_info = desc
    if files:
        product_info = f"{desc}\n\n📎 Прикрепленные файлы:\n{files}" if desc else files

    db.save_lead({
        "user_id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "category": data["category"],
        "product_info": product_info,
        "budget": data["budget"],
        "timeline": timeline_text,
        "lead_score": score,
    })
    logger.info(f"Лид {user.id} сохранен в SQLite")

    await callback.message.edit_text(
        "Спасибо за заявку! 🌸\n\n"
        "Я передала информацию админу канала «Дети и Желания». "
        "Она изучит ваш продукт и напишет вам в течение дня. 🤗",
        reply_markup=NEW_REQUEST_KB,
        parse_mode="HTML",
    )
    await callback.answer()
    await state.clear()

    admin_product = product_info
    safe_full_name = escape(user.full_name)
    safe_category = escape(data["category"])
    safe_budget = escape(data["budget"])
    safe_timeline = escape(timeline_text)
    admin_msg = (
        f"<b>НОВАЯ ЗАЯВКА НА РЕКЛАМУ</b>\n\n"
        f"👤 <b>От:</b> {safe_full_name} ({f'@{user.username}' if user.username else 'нет username'})\n"
        f"📦 <b>Категория:</b> {safe_category}\n\n"
        f"📝 <b>О товаре:</b>\n{admin_product}\n\n"
        f"💰 <b>Бюджет:</b> {safe_budget}\n"
        f"📅 <b>Сроки:</b> {safe_timeline}\n\n"
        f"📊 <b>Оценка:</b> {score}\n\n"
        f"{_format_admin_contact_line(user.username)}\n"
        f'📊 <a href="http://{config.hostname}">Открыть дашборд</a>'
    )
    try:
        await bot.send_message(config.admin_id, admin_msg, parse_mode="HTML", disable_web_page_preview=True)
    except Exception as e:
        logger.error(f"Ошибка отправки админу: {e}")


@router.callback_query(F.data == "back", LeadForm.timeline)
async def back_from_timeline(callback: CallbackQuery, state: FSMContext):
    await callback.message.edit_text(
        "<b>3. Какой бюджет на размещение?</b>",
        reply_markup=BUDGET_KB,
        parse_mode="HTML",
    )
    await state.set_state(LeadForm.budget)
    await callback.answer()


@router.callback_query(F.data == "new_request")
async def new_request(callback: CallbackQuery, state: FSMContext):
    await state.clear()
    await callback.message.edit_text(
        "Привет! 🌸\n\n"
        "Чтобы я поняла, подходит ли ваш продукт нашему каналу, ответьте на "
        "несколько вопросов:\n\n"
        "<b>1. К какой рубрике относится ваш продукт?</b>",
        reply_markup=CATEGORY_KB,
        parse_mode="HTML",
    )
    await state.set_state(LeadForm.category)
    await callback.answer()
