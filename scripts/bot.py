import os
import sqlite3
import logging
import asyncio
from aiohttp import web

from aiogram import Bot, Dispatcher, Router, F
from aiogram.types import (
    Message, InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery,
)
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage

from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))
BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_ID = int(os.getenv("ADMIN_ID"))
HOSTNAME = os.getenv("HOSTNAME", "localhost")
FILE_SERVER_PORT = 8088

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher(storage=MemoryStorage())
router = Router()
dp.include_router(router)

DB_PATH = os.path.join(BASE_DIR, "db", "leads.db")
db = sqlite3.connect(DB_PATH, check_same_thread=False)
db.execute("""
    CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        data BLOB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
""")
db.execute("""
    CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        username TEXT,
        full_name TEXT,
        category TEXT,
        product_info TEXT,
        budget TEXT,
        timeline TEXT,
        lead_score TEXT,
        status TEXT DEFAULT '🆕 Новая',
        admin_comment TEXT DEFAULT '',
        next_contact TEXT,
        deal_amount INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
""")
db.commit()


def db_save_file(file_bytes: bytes, filename: str, mime_type: str) -> int:
    cur = db.execute(
        "INSERT INTO files (filename, mime_type, data) VALUES (?, ?, ?)",
        (filename, mime_type, file_bytes),
    )
    db.commit()
    return cur.lastrowid


def db_get_file(file_id: int):
    return db.execute(
        "SELECT filename, mime_type, data FROM files WHERE id = ?", (file_id,)
    ).fetchone()


async def handle_file(request: web.Request) -> web.Response:
    file_id = int(request.match_info['file_id'])
    row = db_get_file(file_id)
    if not row:
        return web.Response(status=404, text="Not found")
    filename, mime_type, data = row
    return web.Response(
        body=data,
        content_type=mime_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


def get_file_url(file_id: int) -> str:
    return f"http://{HOSTNAME}:{FILE_SERVER_PORT}/files/{file_id}"


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


def make_keyboard(items: list[tuple[str, str]]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=text, callback_data=data)]
        for text, data in items
    ])


BACK_BTN = InlineKeyboardButton(text="🔙 Назад", callback_data="back")


def make_keyboard_with_back(items: list[tuple[str, str]]) -> InlineKeyboardMarkup:
    kb = make_keyboard(items)
    kb.inline_keyboard.append([BACK_BTN])
    return kb


CATEGORIES = {
    "cat_clothes": "👗 Детская одежда и обувь",
    "cat_accessories": "🎒 Аксессуары (сумки, рюкзаки)",
    "cat_care": "🧴 Уход и гигиена",
    "cat_leisure": "🌊 Отдых и активности",
    "cat_edu": "🎨 Развитие и творчество",
    "cat_food": "🍼 Питание",
    "cat_events": "🎉 Досуг и мероприятия",
    "cat_app": "📱 Сервисы/приложения для мам",
    "cat_other": "📋 Другое",
}

BUDGETS = {
    "bud_10": "До 10 000 ₽",
    "bud_30": "10 000 - 30 000 ₽",
    "bud_50": "30 000 - 50 000 ₽",
    "bud_50plus": "50 000 ₽ и выше",
}

TIMELINES = {
    "time_week": "⚡ На этой неделе",
    "time_2weeks": "📅 В ближайшие 2 недели",
    "time_month": "🗓 В следующем месяце",
    "time_just_looking": "👀 Просто изучаю варианты",
}

CATEGORY_KB = make_keyboard([
    (text, data) for data, text in CATEGORIES.items()
])

BUDGET_KB = make_keyboard_with_back([
    (text, data) for data, text in BUDGETS.items()
])

TIMELINE_KB = make_keyboard_with_back([
    (text, data) for data, text in TIMELINES.items()
])

BACK_ONLY_KB = make_keyboard([("🔙 Назад", "back")])

ADD_MORE_KB = InlineKeyboardMarkup(inline_keyboard=[
    [InlineKeyboardButton(text="📎 Ещё файл", callback_data="add_more_file")],
    [InlineKeyboardButton(text="✅ Далее", callback_data="finish_files")],
])

AFTER_DESC_KB = InlineKeyboardMarkup(inline_keyboard=[
    [InlineKeyboardButton(text="📎 Прикрепить файлы", callback_data="attach_files")],
    [InlineKeyboardButton(text="✅ Далее", callback_data="skip_files")],
])

NEW_REQUEST_KB = make_keyboard([("📝 Новая заявка", "new_request")])


@router.message(CommandStart())
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
    await state.update_data(product_description=text)
    await message.answer(
        f"✅ Описание принято:\n\n<i>{text}</i>\n\n"
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
async def process_product_files(message: Message, state: FSMContext):
    data = await state.get_data()
    existing = data.get("product_files", "")

    if message.document:
        doc_name = message.document.file_name
        caption = message.caption or ""
        mime = message.document.mime_type or "application/octet-stream"

        file_info = await bot.get_file(message.document.file_id)
        file_bytes = await bot.download_file(file_info.file_path)
        file_content = file_bytes.read()

        file_id = db_save_file(file_content, doc_name, mime)
        file_url = get_file_url(file_id)
        part = f'<a href="{file_url}">📎 {doc_name}</a>'
        if caption:
            part += f"\n{caption}"
    elif message.photo:
        photo = message.photo[-1]
        file_info = await bot.get_file(photo.file_id)
        file_bytes = await bot.download_file(file_info.file_path)
        file_content = file_bytes.read()

        filename = f"photo_{photo.file_id[:8]}.jpg"
        file_id = db_save_file(file_content, filename, "image/jpeg")
        file_url = get_file_url(file_id)
        caption = message.caption or ""
        part = f'<a href="{file_url}">🖼 Фото</a>'
        if caption:
            part += f"\n{caption}"
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
async def process_timeline(callback: CallbackQuery, state: FSMContext):
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

    db.execute(
        """INSERT INTO leads (user_id, username, full_name, category, product_info, budget, timeline, lead_score, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, '🆕 Новая')""",
        (user.id, user.username, user.full_name, data["category"],
         product_info, data["budget"], timeline_text, score),
    )
    db.commit()
    logging.info(f"Лид {user.id} сохранен в SQLite")

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
    admin_msg = (
        f"<b>НОВАЯ ЗАЯВКА НА РЕКЛАМУ</b>\n\n"
        f"👤 <b>От:</b> {user.full_name} ({f'@{user.username}' if user.username else 'нет username'})\n"
        f"📦 <b>Категория:</b> {data['category']}\n"
        f"📝 <b>О товаре:</b>\n{admin_product}\n\n"
        f"💰 <b>Бюджет:</b> {data['budget']}\n"
        f"📅 <b>Сроки:</b> {timeline_text}\n\n"
        f"📊 <b>Оценка:</b> {score}\n\n"
        f'💬 <a href="https://t.me/{user.username}">Написать в ЛС</a>\n'
        f'📊 <a href="http://{HOSTNAME}:8000">Открыть дашборд</a>'
    )
    try:
        await bot.send_message(ADMIN_ID, admin_msg, parse_mode="HTML", disable_web_page_preview=True)
    except Exception as e:
        logging.error(f"Ошибка отправки админу: {e}")


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


async def main():
    app = web.Application()
    app.router.add_get('/files/{file_id}', handle_file)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", FILE_SERVER_PORT)
    await site.start()
    logging.info(f"✅ Файловый сервер запущен на порту {FILE_SERVER_PORT}")

    logging.info("Запуск бота...")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
