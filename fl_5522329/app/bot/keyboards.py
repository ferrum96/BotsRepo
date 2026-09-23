from __future__ import annotations

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo


def disclaimer_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Принять", callback_data="disclaimer:accept")]
        ]
    )


def main_menu(webapp_url: str) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = [
        [
            InlineKeyboardButton(text="Гороскоп", callback_data="menu:horoscope"),
            InlineKeyboardButton(text="Таро", callback_data="menu:tarot"),
        ],
        [InlineKeyboardButton(text="Данные рождения", callback_data="menu:profile")],
    ]
    if webapp_url.startswith("https://"):
        rows.append(
            [InlineKeyboardButton(text="Открыть Mini App", web_app=WebAppInfo(url=webapp_url))]
        )
    rows.append(
        [
            InlineKeyboardButton(text="Купить Pro", callback_data="buy_pro"),
            InlineKeyboardButton(text="Пригласить", callback_data="menu:invite"),
        ]
    )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def buy_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="Купить Pro — 299 ₽/мес", callback_data="buy_pro")]]
    )


def place_keyboard(labels: list[str]) -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(text=label[:60], callback_data=f"place:{index}")]
        for index, label in enumerate(labels)
    ]
    rows.append([InlineKeyboardButton(text="Другое место", callback_data="place:cancel")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def share_keyboard(url: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="Пригласить друга", url=url)]]
    )
