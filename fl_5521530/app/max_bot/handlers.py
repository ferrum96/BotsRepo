from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from zoneinfo import ZoneInfo

from app.application.access_service import AccessService, ShopConfigService
from app.application.catalog_service import CatalogService
from app.application.content_generation_service import ContentGenerationService
from app.application.product_selection_service import PAGE_SIZE, ProductSelectionService
from app.application.publication_service import PublicationService
from app.application.scheduling_service import SchedulingService
from app.domain.entities import GeneratedContent, Product, Publication, User
from app.domain.enums import DialogState
from app.domain.exceptions import (
    AccessDeniedError,
    DomainError,
)
from app.max_bot.dto import BotResponse
from app.max_bot import keyboards as kb
from app.max_bot.message_renderer import render_max_post, render_product_card
from app.max_bot.update_mapper import IncomingEvent
from app.repositories.session_repository import SessionRepository

HELP_TEXT = (
    "MAX-бот магазина: импорт CSV, выбор товара, AI-описание, публикация в канал.\n"
    "Команды: /start /catalog /random /publish /schedule /history /settings"
)


class FileFetcher(Protocol):
    async def fetch(self, url: str, *, max_bytes: int) -> bytes: ...


@dataclass
class BotServices:
    access: AccessService
    shop: ShopConfigService
    catalog: CatalogService
    selection: ProductSelectionService
    content: ContentGenerationService
    publication: PublicationService
    scheduling: SchedulingService
    sessions: SessionRepository
    files: FileFetcher
    timezone: str
    shop_name: str
    max_csv_size_bytes: int


async def dispatch(event: IncomingEvent, services: BotServices) -> BotResponse:
    if event.update_type in {"message_edited", "message_removed"}:
        return BotResponse(silent=True)
    if event.update_type == "bot_added":
        return await _on_bot_added(event, services)
    try:
        if event.max_user_id is None:
            return BotResponse(silent=True)
        user = await services.access.require_user(event.max_user_id, event.username)
        if event.update_type in {"bot_started", "message_created"}:
            return await _on_message(event, user, services)
        if event.update_type == "message_callback":
            return await _on_callback(event, user, services)
        return BotResponse(silent=True)
    except AccessDeniedError:
        return BotResponse(text="Нет доступа. Пользователь не в whitelist.")
    except DomainError as exc:
        return BotResponse.text_with_keyboard(exc.message, kb.back_to_menu_keyboard())


async def _on_bot_added(event: IncomingEvent, services: BotServices) -> BotResponse:
    if event.is_channel and event.chat_id is not None:
        await services.shop.bind_channel(event.chat_id)
    return BotResponse(silent=True)


async def _on_message(event: IncomingEvent, user: User, services: BotServices) -> BotResponse:
    session = await services.sessions.get(user.id) if user.id is not None else None
    state = DialogState(session.state) if session else DialogState.IDLE
    text = (event.text or "").strip()

    if text.startswith("/start"):
        if user.id is not None:
            await services.sessions.set_state(user.id, DialogState.IDLE)
        return _main_menu(services.shop_name)

    if state == DialogState.WAITING_CSV:
        return await _handle_csv(event, user, services)
    if state == DialogState.WAITING_SEARCH and text and not text.startswith("/"):
        return await _handle_search(text, user, services)
    if state == DialogState.WAITING_SCHEDULE_AT and text and not text.startswith("/"):
        return await _handle_schedule_time(text, user, session.payload if session else {}, services)
    if state.value.startswith("waiting_edit_") and text and not text.startswith("/"):
        return await _handle_edit_text(text, user, session.payload if session else {}, state, services)

    command = text.split()[0].lower() if text.startswith("/") else ""
    if command in {"/catalog"}:
        return BotResponse.text_with_keyboard("Каталог", kb.catalog_keyboard())
    if command in {"/random"}:
        return await _random_product(services)
    if command in {"/publish"}:
        return await _create_flow(services)
    if command in {"/schedule"}:
        return await _schedule_list(services)
    if command in {"/history"}:
        return await _history(services)
    if command in {"/settings"}:
        return await _settings(services)
    if command in {"/help"}:
        return BotResponse.text_with_keyboard(HELP_TEXT, kb.back_to_menu_keyboard())
    return _main_menu(services.shop_name)


async def _on_callback(event: IncomingEvent, user: User, services: BotServices) -> BotResponse:
    payload = event.callback_payload or ""
    parts = payload.split(":")
    head = parts[0] if parts else ""
    action = parts[1] if len(parts) > 1 else ""

    if payload == kb.MENU_MAIN:
        if user.id is not None:
            await services.sessions.set_state(user.id, DialogState.IDLE)
        return _main_menu(services.shop_name, replace=True)
    if payload == kb.MENU_CATALOG:
        return BotResponse.text_with_keyboard("Каталог", kb.catalog_keyboard(), replace=True)
    if payload == kb.MENU_RANDOM:
        return await _random_product(services, replace=True)
    if payload == kb.MENU_CREATE:
        return await _create_flow(services, replace=True)
    if payload == kb.MENU_SCHEDULE:
        return await _schedule_list(services, replace=True)
    if payload == kb.MENU_HISTORY:
        return await _history(services, replace=True)
    if payload == kb.MENU_SETTINGS:
        return await _settings(services, replace=True)
    if payload == kb.MENU_IMPORT:
        if user.id is not None:
            await services.sessions.set_state(user.id, DialogState.WAITING_CSV)
        return BotResponse.text_with_keyboard(
            "Пришлите CSV-файл каталога.", kb.back_to_menu_keyboard(), replace=True
        )
    if payload == kb.PRODUCT_SEARCH:
        if user.id is not None:
            await services.sessions.set_state(user.id, DialogState.WAITING_SEARCH)
        return BotResponse.text_with_keyboard(
            "Введите название или SKU.", kb.back_to_menu_keyboard(), replace=True
        )
    if payload == kb.PRODUCT_STALE:
        product = await services.selection.stale()
        return await _product_card(product, services, replace=True)
    if payload == kb.CAT_LIST:
        categories = await services.selection.categories()
        if not categories:
            return BotResponse.text_with_keyboard("Категорий нет.", kb.catalog_keyboard(), replace=True)
        if user.id is not None:
            await services.sessions.set_state(
                user.id, DialogState.IDLE, {"categories": categories}
            )
        return BotResponse.text_with_keyboard(
            "Категории", kb.category_keyboard(categories), replace=True
        )
    if payload == kb.SETTINGS_TOGGLE_STOCK:
        value = await services.shop.toggle_show_stock()
        return BotResponse.text_with_keyboard(
            f"SHOW_STOCK = {value}", kb.settings_keyboard(), replace=True
        )
    if head == "product" and action == "page":
        page = int(parts[2]) if len(parts) > 2 else 0
        items, total = await services.selection.list_page(page)
        if not items:
            return BotResponse.text_with_keyboard(
                "Нет активных товаров с остатком.", kb.catalog_keyboard(), replace=True
            )
        return BotResponse.text_with_keyboard(
            f"Товары, стр. {page + 1}",
            kb.product_list_keyboard(items, page=page, total=total, page_size=PAGE_SIZE),
            replace=True,
        )
    if head == "product" and action == "select":
        product = await services.selection.get(int(parts[2]))
        return await _product_card(product, services, replace=True)
    if head == "cat" and action == "pick":
        session = await services.sessions.get(user.id) if user.id is not None else None
        categories = (session.payload.get("categories") if session else None) or []
        index = int(parts[2])
        if index < 0 or index >= len(categories):
            return BotResponse.text_with_keyboard("Категория не найдена.", kb.catalog_keyboard(), replace=True)
        items = await services.selection.by_category(categories[index])
        return BotResponse.text_with_keyboard(
            f"Категория: {categories[index]}",
            kb.product_list_keyboard(items, page=0, total=len(items), page_size=PAGE_SIZE),
            replace=True,
        )
    if head == "content" and action == "generate":
        show_stock = await services.shop.show_stock()
        product, content, publication = await services.content.generate(
            int(parts[2]), show_stock=show_stock
        )
        return _preview(product, content, publication, show_stock, replace=True)
    if head == "content" and action == "regen":
        show_stock = await services.shop.show_stock()
        product, content, publication = await services.content.regenerate(
            int(parts[2]), show_stock=show_stock
        )
        return _preview(product, content, publication, show_stock, replace=True)
    if head == "content" and action == "edit":
        publication = await services.publication.get(int(parts[2]))
        return BotResponse.text_with_keyboard(
            "Что изменить?",
            kb.edit_fields_keyboard(publication.content_id, publication.id or 0),
            replace=True,
        )
    if head == "content" and action == "edit_field" and user.id is not None:
        publication = await services.publication.get(int(parts[2]))
        field = parts[3]
        state = {
            "title": DialogState.WAITING_EDIT_TITLE,
            "description": DialogState.WAITING_EDIT_DESCRIPTION,
            "call_to_action": DialogState.WAITING_EDIT_CTA,
        }[field]
        await services.sessions.set_state(
            user.id,
            state,
            {"content_id": publication.content_id, "publication_id": publication.id},
        )
        return BotResponse.text_with_keyboard(
            "Пришлите новый текст одним сообщением.",
            kb.back_to_menu_keyboard(),
            replace=True,
        )
    if head == "publication" and action == "preview":
        return await _preview_by_publication(int(parts[2]), services, replace=True)
    if head == "publication" and action == "confirm":
        show_stock = await services.shop.show_stock()
        channel_id = await services.shop.channel_id()
        publication = await services.publication.confirm_and_publish(
            int(parts[2]), channel_id=channel_id, show_stock=show_stock
        )
        return BotResponse.text_with_keyboard(
            f"Опубликовано. message_id={publication.max_message_id}",
            kb.back_to_menu_keyboard(),
            replace=True,
        )
    if head == "publication" and action == "cancel":
        await services.publication.cancel(int(parts[2]))
        return BotResponse.text_with_keyboard("Отменено.", kb.back_to_menu_keyboard(), replace=True)
    if head == "publication" and action == "schedule" and user.id is not None:
        await services.sessions.set_state(
            user.id,
            DialogState.WAITING_SCHEDULE_AT,
            {"publication_id": int(parts[2])},
        )
        return BotResponse.text_with_keyboard(
            f"Введите дату и время ({services.timezone}), формат YYYY-MM-DD HH:MM",
            kb.back_to_menu_keyboard(),
            replace=True,
        )
    return BotResponse.text_with_keyboard("Неизвестное действие.", kb.main_menu_keyboard(), replace=True)


async def _handle_csv(event: IncomingEvent, user: User, services: BotServices) -> BotResponse:
    if event.file is None:
        return BotResponse.text_with_keyboard(
            "Нужен файл .csv, не текст.", kb.catalog_keyboard()
        )
    services.catalog.validate_file(
        filename=event.file.filename,
        size=event.file.size or 1,
        mime_type=event.file.mime_type,
    )
    content = await services.files.fetch(
        event.file.url, max_bytes=services.max_csv_size_bytes
    )
    job = await services.catalog.import_csv(filename=event.file.filename, content=content)
    if user.id is not None:
        await services.sessions.set_state(user.id, DialogState.IDLE)
    errors = "\n".join(
        f"строка {item['row']}: {item['error']}" for item in job.error_report[:10]
    )
    extra = f"\nОшибки:\n{errors}" if errors else ""
    return BotResponse.text_with_keyboard(
        (
            f"Импорт {job.filename}: всего {job.total_rows}, "
            f"создано {job.created_rows}, обновлено {job.updated_rows}, "
            f"ошибок {job.failed_rows}.{extra}"
        ),
        kb.catalog_keyboard(),
    )


async def _handle_search(query: str, user: User, services: BotServices) -> BotResponse:
    items = await services.selection.search(query)
    if user.id is not None:
        await services.sessions.set_state(user.id, DialogState.IDLE)
    return BotResponse.text_with_keyboard(
        "Найдено:",
        kb.product_list_keyboard(items, page=0, total=len(items), page_size=PAGE_SIZE),
    )


async def _handle_schedule_time(
    text: str, user: User, payload: dict, services: BotServices
) -> BotResponse:
    publication_id = int(payload["publication_id"])
    when = _parse_local_datetime(text, services.timezone)
    publication = await services.publication.schedule(publication_id, when)
    if user.id is not None:
        await services.sessions.set_state(user.id, DialogState.IDLE)
    return BotResponse.text_with_keyboard(
        f"Запланировано на {publication.scheduled_at}",
        kb.back_to_menu_keyboard(),
    )


async def _handle_edit_text(
    text: str,
    user: User,
    payload: dict,
    state: DialogState,
    services: BotServices,
) -> BotResponse:
    field = {
        DialogState.WAITING_EDIT_TITLE: "title",
        DialogState.WAITING_EDIT_DESCRIPTION: "description",
        DialogState.WAITING_EDIT_CTA: "call_to_action",
    }[state]
    content_id = int(payload["content_id"])
    content = await services.content.update_field(content_id, field, text)
    product = await services.selection.get(content.product_id)
    show_stock = await services.shop.show_stock()
    if user.id is not None:
        await services.sessions.set_state(user.id, DialogState.IDLE)
    preview = render_max_post(content, product, show_stock=show_stock)
    pub_id = int(payload.get("publication_id") or 0)
    keyboard = kb.publication_keyboard(pub_id, content.id or 0) if pub_id else kb.back_to_menu_keyboard()
    return BotResponse.text_with_keyboard(f"Превью:\n\n{preview.text}", keyboard)


def _main_menu(shop_name: str, *, replace: bool = False) -> BotResponse:
    return BotResponse.text_with_keyboard(
        f"{shop_name}\nВыберите действие.", kb.main_menu_keyboard(), replace=replace
    )


async def _random_product(services: BotServices, *, replace: bool = False) -> BotResponse:
    product = await services.selection.random_in_stock()
    return await _product_card(product, services, replace=replace)


async def _create_flow(services: BotServices, *, replace: bool = False) -> BotResponse:
    items, total = await services.selection.list_page(0)
    if not items:
        return BotResponse.text_with_keyboard(
            "Нет товаров для публикации.", kb.catalog_keyboard(), replace=replace
        )
    return BotResponse.text_with_keyboard(
        "Выберите товар для публикации.",
        kb.product_list_keyboard(items, page=0, total=total, page_size=PAGE_SIZE),
        replace=replace,
    )


async def _product_card(
    product: Product, services: BotServices, *, replace: bool = False
) -> BotResponse:
    show_stock = await services.shop.show_stock()
    text = render_product_card(product, show_stock=show_stock)
    return BotResponse.text_with_keyboard(
        text, kb.product_actions_keyboard(product.id or 0), replace=replace
    )


def _preview(
    product: Product,
    content: GeneratedContent,
    publication: Publication,
    show_stock: bool,
    *,
    replace: bool,
) -> BotResponse:
    payload = render_max_post(content, product, show_stock=show_stock)
    return BotResponse.text_with_keyboard(
        f"Превью:\n\n{payload.text}",
        kb.publication_keyboard(publication.id or 0, content.id or 0),
        replace=replace,
    )


async def _preview_by_publication(
    publication_id: int, services: BotServices, *, replace: bool
) -> BotResponse:
    publication = await services.publication.get(publication_id)
    content = await services.content.get_content(publication.content_id)
    product = await services.selection.get(publication.product_id)
    show_stock = await services.shop.show_stock()
    return _preview(product, content, publication, show_stock, replace=replace)


async def _schedule_list(services: BotServices, *, replace: bool = False) -> BotResponse:
    items = await services.scheduling.list_scheduled()
    if not items:
        return BotResponse.text_with_keyboard(
            "Нет запланированных публикаций.", kb.back_to_menu_keyboard(), replace=replace
        )
    lines = [
        f"#{item.id} product={item.product_id} at {item.scheduled_at} [{item.status}]"
        for item in items
    ]
    return BotResponse.text_with_keyboard("\n".join(lines), kb.back_to_menu_keyboard(), replace=replace)


async def _history(services: BotServices, *, replace: bool = False) -> BotResponse:
    items = await services.scheduling.list_history()
    if not items:
        return BotResponse.text_with_keyboard(
            "История пуста.", kb.back_to_menu_keyboard(), replace=replace
        )
    lines = [
        f"#{item.id} {item.status} msg={item.max_message_id or '-'} product={item.product_id}"
        for item in items
    ]
    return BotResponse.text_with_keyboard("\n".join(lines), kb.back_to_menu_keyboard(), replace=replace)


async def _settings(services: BotServices, *, replace: bool = False) -> BotResponse:
    channel_id = await services.shop.channel_id()
    show_stock = await services.shop.show_stock()
    channel = str(channel_id) if channel_id is not None else "не задан"
    text = (
        f"Магазин: {services.shop_name}\n"
        f"Канал chat_id: {channel}\n"
        f"SHOW_STOCK: {show_stock}\n"
        f"Часовой пояс: {services.timezone}"
    )
    return BotResponse.text_with_keyboard(text, kb.settings_keyboard(), replace=replace)


def _parse_local_datetime(value: str, timezone: str) -> datetime:
    tz = ZoneInfo(timezone)
    try:
        naive = datetime.strptime(value.strip(), "%Y-%m-%d %H:%M")
    except ValueError as exc:
        raise DomainError("Некорректная дата. Формат: YYYY-MM-DD HH:MM") from exc
    return naive.replace(tzinfo=tz)
