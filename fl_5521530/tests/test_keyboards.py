from __future__ import annotations

from app.max_bot.commands import MAX_CALLBACK_PAYLOAD_MAX_BYTES
from app.max_bot.keyboards import (
    CONTENT_GENERATE,
    PUBLICATION_CANCEL,
    PUBLICATION_CONFIRM,
    callback_button,
    category_keyboard,
    main_menu_keyboard,
    publication_keyboard,
)


def test_main_menu_has_required_buttons():
    keyboard = main_menu_keyboard()
    labels = [btn["text"] for row in keyboard["payload"]["buttons"] for btn in row]
    for name in ("Каталог", "Случайный товар", "Создать публикацию", "Расписание", "История", "Настройки"):
        assert name in labels


def test_callback_payload_format_and_limit():
    button = callback_button("Выбрать", CONTENT_GENERATE.format(id=123))
    assert button["payload"] == "content:generate:123"
    assert button["type"] == "callback"
    assert len(button["payload"].encode()) < MAX_CALLBACK_PAYLOAD_MAX_BYTES


def test_publication_callbacks_use_ids_only():
    keyboard = publication_keyboard(456, 123)
    payloads = [btn["payload"] for row in keyboard["payload"]["buttons"] for btn in row]
    assert PUBLICATION_CONFIRM.format(id=456) in payloads
    assert PUBLICATION_CANCEL.format(id=456) in payloads
    assert all("EUR" not in item and "sku" not in item.lower() for item in payloads)


def test_category_payload_is_index_not_name():
    keyboard = category_keyboard(["Very Long Category Name That Should Not Be In Payload"])
    payload = keyboard["payload"]["buttons"][0][0]["payload"]
    assert payload == "cat:pick:0"
