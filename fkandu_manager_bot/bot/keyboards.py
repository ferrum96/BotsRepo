"""Keyboard layouts for the bot."""

from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton


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


def make_keyboard(items: list[tuple[str, str]]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=text, callback_data=data)]
            for text, data in items
        ]
    )


BACK_BTN = InlineKeyboardButton(text="🔙 Назад", callback_data="back")


def make_keyboard_with_back(items: list[tuple[str, str]]) -> InlineKeyboardMarkup:
    kb = make_keyboard(items)
    kb.inline_keyboard.append([BACK_BTN])
    return kb


CATEGORY_KB = make_keyboard([(text, data) for data, text in CATEGORIES.items()])

BUDGET_KB = make_keyboard_with_back([(text, data) for data, text in BUDGETS.items()])

TIMELINE_KB = make_keyboard_with_back([(text, data) for data, text in TIMELINES.items()])

BACK_ONLY_KB = make_keyboard([("🔙 Назад", "back")])

ADD_MORE_KB = InlineKeyboardMarkup(
    inline_keyboard=[
        [InlineKeyboardButton(text="📎 Ещё файл", callback_data="add_more_file")],
        [InlineKeyboardButton(text="✅ Далее", callback_data="finish_files")],
    ]
)

AFTER_DESC_KB = InlineKeyboardMarkup(
    inline_keyboard=[
        [InlineKeyboardButton(text="📎 Прикрепить файлы", callback_data="attach_files")],
        [InlineKeyboardButton(text="✅ Далее", callback_data="skip_files")],
    ]
)

NEW_REQUEST_KB = make_keyboard([("📝 Новая заявка", "new_request")])
