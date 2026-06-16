import os
import logging
import asyncio
from datetime import datetime
from aiogram import Bot, Dispatcher, Router, F
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage

import gspread
from google.oauth2.service_account import Credentials
from dotenv import load_dotenv

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_ID = int(os.getenv("ADMIN_ID"))
SPREADSHEET_ID = os.getenv("SPREADSHEET_ID")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

bot = Bot(token=BOT_TOKEN, session=AiohttpSession(proxy="http://127.0.0.1:12334"))
storage = MemoryStorage()
dp = Dispatcher(storage=storage)
router = Router()
dp.include_router(router)

# ================= GOOGLE SHEETS =================
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file'
]

def get_google_sheet():
    try:
        creds = Credentials.from_service_account_file('credentials.json', scopes=SCOPES)
        client = gspread.authorize(creds)
        sheet = client.open_by_key(SPREADSHEET_ID).sheet1
        if sheet.get_all_values() == []:
            headers = ["Дата", "Chat ID", "Username", "Имя", "Категория", "О товаре", "Бюджет", "Сроки", "Оценка лида"]
            sheet.append_row(headers)
        return sheet
    except Exception as e:
        logging.error(f"Ошибка подключения к Google Sheets: {e}")
        return None

gsheet = None

# ================= FSM =================
class LeadForm(StatesGroup):
    category = State()
    product_info = State()  # Новый шаг: рассказ о товаре
    budget = State()
    timeline = State()

# ================= ОЦЕНКА ЛИДА =================
def calculate_lead_score(category: str, budget: str, timeline: str) -> str:
    score = "Холодный 🧊"
    budget_val = 0
    if "50" in budget: budget_val = 50000
    elif "30" in budget: budget_val = 30000
    elif "10" in budget: budget_val = 10000
    
    if budget_val >= 50000:
        score = "ГОРЯЧИЙ 🔥"
    elif budget_val >= 30000 and "этой неделе" in timeline:
        score = "ГОРЯЧИЙ 🔥"
    elif budget_val >= 10000 and ("2 недели" in timeline or "месяце" in timeline):
        score = "Теплый 💛"
    return score

# ================= КЛАВИАТУРЫ =================
def get_category_kb():
    """Категории, которые реально есть в канале @fkandu"""
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="👗 Детская одежда и обувь", callback_data="cat_clothes")],
        [InlineKeyboardButton(text="🎒 Аксессуары (сумки, рюкзаки)", callback_data="cat_accessories")],
        [InlineKeyboardButton(text="🧴 Уход и гигиена", callback_data="cat_care")],
        [InlineKeyboardButton(text="🌊 Отдых и активности", callback_data="cat_leisure")],
        [InlineKeyboardButton(text="🎨 Развитие и творчество", callback_data="cat_edu")],
        [InlineKeyboardButton(text="🍼 Питание", callback_data="cat_food")],
        [InlineKeyboardButton(text="🎉 Досуг и мероприятия", callback_data="cat_events")],
        [InlineKeyboardButton(text="📱 Сервисы/приложения для мам", callback_data="cat_app")]
    ])

def get_budget_kb():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="До 10 000 ₽", callback_data="bud_10")],
        [InlineKeyboardButton(text="10 000 - 30 000 ₽", callback_data="bud_30")],
        [InlineKeyboardButton(text="30 000 - 50 000 ₽", callback_data="bud_50")],
        [InlineKeyboardButton(text="50 000 ₽ и выше", callback_data="bud_50plus")]
    ])

def get_timeline_kb():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="⚡ На этой неделе", callback_data="time_week")],
        [InlineKeyboardButton(text="📅 В ближайшие 2 недели", callback_data="time_2weeks")],
        [InlineKeyboardButton(text="🗓 В следующем месяце", callback_data="time_month")],
        [InlineKeyboardButton(text="👀 Просто изучаю варианты", callback_data="time_just_looking")]
    ])

# ================= ОБРАБОТЧИКИ =================

@router.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext):
    await state.clear()
    await message.answer(
        "Привет! 🌸\n\n"
        "Я помощник админа канала <b>«Дети и Желания»</b> (@fkandu).\n\n"
        "Здесь я делюсь с мамами находками — от милых платьев до гипоаллергенных паст и классных мест для прогулок. "
        "Реклама у нас только искренняя: я рекомендую то, что действительно нравится мне и моим детям. 💛\n\n"
        "Чтобы я поняла, подходит ли ваш продукт нашему каналу, ответьте на несколько вопросов:\n\n"
        "<b>1. К какой рубрике относится ваш продукт?</b>",
        reply_markup=get_category_kb(),
        parse_mode="HTML"
    )
    await state.set_state(LeadForm.category)

@router.callback_query(F.data.startswith("cat_"), LeadForm.category)
async def process_category(callback: CallbackQuery, state: FSMContext):
    category_map = {
        "cat_clothes": "👗 Одежда и обувь",
        "cat_accessories": "🎒 Аксессуары",
        "cat_care": "🧴 Уход и гигиена",
        "cat_leisure": "🌊 Отдых и активности",
        "cat_edu": "🎨 Развитие и творчество",
        "cat_food": "🍼 Питание",
        "cat_events": "🎉 Досуг и мероприятия",
        "cat_app": "📱 Сервисы/приложения для мам"
    }
    cat_name = category_map.get(callback.data, callback.data)
    await state.update_data(category=cat_name)
    
    await callback.message.edit_text(
        f"Принято: <b>{cat_name}</b> ✅\n\n"
        "<b>2. Расскажите коротко о товаре:</b>\n"
        "Что это, для какого возраста, чем выделяется? "
        "(Можно ссылку на сайт или карточку товара)",
        parse_mode="HTML"
    )
    await state.set_state(LeadForm.product_info)
    await callback.answer()

@router.message(LeadForm.product_info)
async def process_product_info(message: Message, state: FSMContext):
    await state.update_data(product_info=message.text)
    await message.answer(
        "Отлично, спасибо! 💛\n\n"
        "<b>3. Какой бюджет на размещение?</b>",
        reply_markup=get_budget_kb(),
        parse_mode="HTML"
    )
    await state.set_state(LeadForm.budget)

@router.callback_query(F.data.startswith("bud_"), LeadForm.budget)
async def process_budget(callback: CallbackQuery, state: FSMContext):
    budget_map = {
        "bud_10": "До 10 000 ₽", "bud_30": "10 000 - 30 000 ₽",
        "bud_50": "30 000 - 50 000 ₽", "bud_50plus": "50 000 ₽ и выше"
    }
    bud_name = budget_map.get(callback.data, callback.data)
    await state.update_data(budget=bud_name)
    await callback.message.edit_text(
        f"Бюджет: <b>{bud_name}</b> ✅\n\n"
        "<b>4. Когда планируете запуск?</b>",
        reply_markup=get_timeline_kb(),
        parse_mode="HTML"
    )
    await state.set_state(LeadForm.timeline)
    await callback.answer()

@router.callback_query(F.data.startswith("time_"), LeadForm.timeline)
async def process_timeline(callback: CallbackQuery, state: FSMContext):
    timeline_map = {
        "time_week": "На этой неделе", "time_2weeks": "В ближайшие 2 недели",
        "time_month": "В следующем месяце", "time_just_looking": "Просто изучаю варианты"
    }
    timeline_text = timeline_map.get(callback.data, callback.data)
    await state.update_data(timeline=timeline_text)
    
    data = await state.get_data()
    user = callback.from_user
    score = calculate_lead_score(data["category"], data["budget"], timeline_text)
    
    # === ЗАПИСЬ В GOOGLE SHEETS ===
    if gsheet:
        try:
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            username = f"@{user.username}" if user.username else "Нет username"
            row_data = [
                now_str,
                str(user.id),
                username,
                user.full_name,
                data["category"],
                data.get("product_info", "—"),
                data["budget"],
                timeline_text,
                score
            ]
            await asyncio.to_thread(gsheet.append_row, row_data)
            logging.info(f"Лид {user.id} сохранен в Google Sheets")
        except Exception as e:
            logging.error(f"Ошибка записи в Google Sheets: {e}")

    # === ОТВЕТ КЛИЕНТУ ===
    await callback.message.edit_text(
        "Спасибо за заявку! 🌸\n\n"
        "Я передала информацию админу канала «Дети и Желания». "
        "Она изучит ваш продукт и напишет вам в течение дня, если он подойдёт нашей аудитории. 💛\n\n"
        "Если продукт не совсем в нашей тематике — не расстраивайтесь, мы обязательно ответим и подскажем. 🤗",
        parse_mode="HTML"
    )
    await callback.answer()
    await state.clear()
    
    # === УВЕДОМЛЕНИЕ АДМИНУ ===
    admin_msg = (
        f"{score} <b>НОВАЯ ЗАЯВКА НА РЕКЛАМУ</b>\n\n"
        f"👤 <b>От:</b> {user.full_name} ({f'@{user.username}' if user.username else 'нет username'})\n"
        f"🆔 <code>{user.id}</code>\n\n"
        f"📦 <b>Категория:</b> {data['category']}\n"
        f"📝 <b>О товаре:</b>\n<i>{data.get('product_info', '—')}</i>\n\n"
        f"💰 <b>Бюджет:</b> {data['budget']}\n"
        f"📅 <b>Сроки:</b> {timeline_text}\n\n"
        f"📊 <b>Оценка:</b> {score}\n\n"
        f"💬 <a href='https://t.me/{user.username}'>Написать в ЛС</a>"
    )
    if not user.username:
        admin_msg += "\n⚠️ <i>У пользователя скрыт username.</i>"

    try:
        await bot.send_message(ADMIN_ID, admin_msg, parse_mode="HTML", disable_web_page_preview=True)
    except Exception as e:
        logging.error(f"Ошибка отправки админу: {e}")

# ================= ЗАПУСК =================
async def main():
    global gsheet
    logging.info("Инициализация Google Sheets...")
    gsheet = get_google_sheet()
    if gsheet:
        logging.info("✅ Google Sheets подключены!")
    logging.info("Запуск бота канала «Дети и Желания»...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())