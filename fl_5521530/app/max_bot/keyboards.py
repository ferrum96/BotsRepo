from __future__ import annotations

from app.max_bot.commands import MAX_CALLBACK_PAYLOAD_MAX_BYTES

MENU_CATALOG = "menu:catalog"
MENU_RANDOM = "menu:random"
MENU_CREATE = "menu:create"
MENU_SCHEDULE = "menu:schedule"
MENU_HISTORY = "menu:history"
MENU_SETTINGS = "menu:settings"
MENU_IMPORT = "menu:import"
MENU_MAIN = "menu:main"

PRODUCT_SELECT = "product:select:{id}"
PRODUCT_PAGE = "product:page:{page}"
PRODUCT_STALE = "product:stale"
PRODUCT_SEARCH = "product:search"
CAT_LIST = "cat:list"
CAT_PICK = "cat:pick:{index}"
CONTENT_GENERATE = "content:generate:{id}"
CONTENT_REGEN = "content:regen:{id}"
CONTENT_EDIT = "content:edit:{id}"
CONTENT_EDIT_FIELD = "content:edit_field:{id}:{field}"
PUBLICATION_CONFIRM = "publication:confirm:{id}"
PUBLICATION_CANCEL = "publication:cancel:{id}"
PUBLICATION_SCHEDULE = "publication:schedule:{id}"
PUBLICATION_PREVIEW = "publication:preview:{id}"
SETTINGS_TOGGLE_STOCK = "settings:toggle_stock"


def callback_button(text: str, payload: str) -> dict:
    encoded = payload.encode("utf-8")
    if len(encoded) > MAX_CALLBACK_PAYLOAD_MAX_BYTES:
        raise ValueError(
            f"callback payload exceeds MAX limit ({MAX_CALLBACK_PAYLOAD_MAX_BYTES} bytes)"
        )
    return {"type": "callback", "text": text[:256], "payload": payload}


def inline_keyboard(rows: list[list[dict]]) -> dict:
    return {"type": "inline_keyboard", "payload": {"buttons": rows}}


def main_menu_keyboard() -> dict:
    return inline_keyboard(
        [
            [callback_button("Каталог", MENU_CATALOG)],
            [callback_button("Случайный товар", MENU_RANDOM)],
            [callback_button("Создать публикацию", MENU_CREATE)],
            [callback_button("Расписание", MENU_SCHEDULE)],
            [callback_button("История", MENU_HISTORY)],
            [callback_button("Настройки", MENU_SETTINGS)],
        ]
    )


def catalog_keyboard() -> dict:
    return inline_keyboard(
        [
            [callback_button("Импорт CSV", MENU_IMPORT)],
            [callback_button("Список товаров", PRODUCT_PAGE.format(page=0))],
            [callback_button("По категории", CAT_LIST)],
            [callback_button("Поиск", PRODUCT_SEARCH)],
            [callback_button("Давно не публиковался", PRODUCT_STALE)],
            [callback_button("Назад", MENU_MAIN)],
        ]
    )


def product_list_keyboard(products: list, *, page: int, total: int, page_size: int) -> dict:
    rows = [
        [callback_button(f"{item.sku} {item.name}"[:40], PRODUCT_SELECT.format(id=item.id))]
        for item in products
        if item.id is not None
    ]
    nav: list[dict] = []
    if page > 0:
        nav.append(callback_button("←", PRODUCT_PAGE.format(page=page - 1)))
    if (page + 1) * page_size < total:
        nav.append(callback_button("→", PRODUCT_PAGE.format(page=page + 1)))
    if nav:
        rows.append(nav)
    rows.append([callback_button("Назад", MENU_CATALOG)])
    return inline_keyboard(rows)


def category_keyboard(categories: list[str]) -> dict:
    rows = [
        [callback_button(name[:40], CAT_PICK.format(index=index))]
        for index, name in enumerate(categories)
    ]
    rows.append([callback_button("Назад", MENU_CATALOG)])
    return inline_keyboard(rows)


def product_actions_keyboard(product_id: int) -> dict:
    return inline_keyboard(
        [
            [callback_button("Создать описание", CONTENT_GENERATE.format(id=product_id))],
            [callback_button("Назад", MENU_CATALOG)],
        ]
    )


def publication_keyboard(publication_id: int, content_id: int) -> dict:
    return inline_keyboard(
        [
            [callback_button("Опубликовать", PUBLICATION_CONFIRM.format(id=publication_id))],
            [callback_button("Запланировать", PUBLICATION_SCHEDULE.format(id=publication_id))],
            [callback_button("Перегенерировать", CONTENT_REGEN.format(id=publication_id))],
            [callback_button("Редактировать", CONTENT_EDIT.format(id=publication_id))],
            [callback_button("Отменить", PUBLICATION_CANCEL.format(id=publication_id))],
            [callback_button("Главное меню", MENU_MAIN)],
        ]
    )


def edit_fields_keyboard(content_id: int, publication_id: int) -> dict:
    return inline_keyboard(
        [
            [callback_button("Заголовок", CONTENT_EDIT_FIELD.format(id=publication_id, field="title"))],
            [
                callback_button(
                    "Описание",
                    CONTENT_EDIT_FIELD.format(id=publication_id, field="description"),
                )
            ],
            [
                callback_button(
                    "Призыв",
                    CONTENT_EDIT_FIELD.format(id=publication_id, field="call_to_action"),
                )
            ],
            [callback_button("Назад", PUBLICATION_PREVIEW.format(id=publication_id))],
        ]
    )


def settings_keyboard() -> dict:
    return inline_keyboard(
        [
            [callback_button("Переключить SHOW_STOCK", SETTINGS_TOGGLE_STOCK)],
            [callback_button("Главное меню", MENU_MAIN)],
        ]
    )


def back_to_menu_keyboard() -> dict:
    return inline_keyboard([[callback_button("Главное меню", MENU_MAIN)]])
