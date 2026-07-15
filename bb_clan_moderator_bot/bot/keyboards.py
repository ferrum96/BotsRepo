"""Inline and reply keyboards."""

from typing import Optional

from telegram import InlineKeyboardButton, InlineKeyboardMarkup

from bot.config import Config


def age_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton("< 21", callback_data="age:under"),
                InlineKeyboardButton("21+", callback_data="age:ok"),
            ]
        ]
    )


def level_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton("< 100", callback_data="level:under"),
                InlineKeyboardButton("100+", callback_data="level:ok"),
            ]
        ]
    )


def activity_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton(
                    "Реже раза в неделю", callback_data="activity:low"
                ),
            ],
            [
                InlineKeyboardButton(
                    "Минимум раз в неделю", callback_data="activity:ok"
                ),
            ],
        ]
    )


def perspective_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("FPP", callback_data="perspective:fpp")],
            [InlineKeyboardButton("TPP", callback_data="perspective:tpp")],
            [
                InlineKeyboardButton(
                    "Mixed mode", callback_data="perspective:mixed"
                )
            ],
        ]
    )


def text_step_back_keyboard(back_callback_data: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [[InlineKeyboardButton("⬅️ Назад", callback_data=back_callback_data)]]
    )


def admin_contact_buttons(config: Config) -> list[InlineKeyboardButton]:
    contacts = config.admin_contacts
    alone = len(contacts) == 1
    return [
        InlineKeyboardButton(contact.button_text(alone=alone), url=contact.url)
        for contact in contacts
    ]


def admin_contact_keyboard(config: Config) -> Optional[InlineKeyboardMarkup]:
    buttons = admin_contact_buttons(config)
    if not buttons:
        return None
    return InlineKeyboardMarkup([[button] for button in buttons])


def join_clan_keyboard(config: Config) -> InlineKeyboardMarkup:
    buttons: list[list[InlineKeyboardButton]] = []
    if config.telegram_group_link:
        buttons.append(
            [
                InlineKeyboardButton(
                    "👥 Telegram-группа", url=config.telegram_group_link
                )
            ]
        )
    if config.discord_link:
        buttons.append(
            [InlineKeyboardButton("💬 Discord", url=config.discord_link)]
        )
    if not buttons:
        buttons.append(
            [
                InlineKeyboardButton(
                    "Вступить в группу клана",
                    callback_data="join:info",
                )
            ]
        )
    return InlineKeyboardMarkup(buttons)
