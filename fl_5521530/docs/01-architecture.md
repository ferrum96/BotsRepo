# Архитектура MAX Shop Bot

Модульный монолит: один FastAPI-процесс, одна PostgreSQL, один MAX-бот.

```
                    MAX
                     |
                     v
             HTTPS Webhook
                     |
                     v
              FastAPI application
                     |
       +-------------+-------------+
       v             v             v
   MAX Bot       Catalog        AI Service
   Adapter       Service        Service
       |             |             |
       +-------------+-------------+
                     v
                PostgreSQL
                     |
                     v
             Publication Service
                     |
                     v
                 MAX Channel
```

## Слои

| Слой | Ответственность | Не делает |
| --- | --- | --- |
| `api/` | HTTP: health, webhook, проверка секрета | бизнес-сценарии |
| `max_bot/` | маппинг Update, клавиатуры, рендер, тонкие handlers | SQL, HTTP к MAX/AI |
| `application/` | сценарии: импорт, выбор, генерация, публикация, расписание | формат MAX Update |
| `domain/` | сущности, enum, ошибки | I/O |
| `infrastructure/` | MAX HTTP, AI HTTP, ORM, scheduler | бизнес-правила |
| `repositories/` | CRUD | MAX/AI вызовы |

Handlers принимают уже смаппленный `IncomingEvent`, вызывают application service, возвращают `BotResponse`. Отправку делает API-слой через `MaxApiClient`.

## Решения

1. **Один процесс.** HTTP + APScheduler + опциональный long poll. Kubernetes и отдельные воркеры не нужны для MVP.
2. **Webhook — основной канал.** `POST /api/max/webhook`. Long polling только при `MAX_USE_LONG_POLLING=true` и без регистрации webhook.
3. **chat_id канала.** `MAX_CHANNEL_ID` в env. Событие `bot_added` с `is_channel=true` сохраняет id в `shop_settings`. GET /chats не используется.
4. **Whitelist.** `ALLOWED_MAX_USER_IDS` — fail closed: пустой список = никто не проходит.
5. **Callback payload.** Формат `entity:action:id`, длина << 4096 байт (лимит MAX). Бизнес-данные в БД, не в кнопке.
6. **Идемпотентность публикации.** Partial unique index: один активный черновик/слот на `content_id`. Статус `publishing` ставится до вызова MAX.
7. **Картинки.** Сначала `attachments.payload.url`, если MAX принимает внешний URL. Иначе скачивание с лимитом размера и MIME, затем `POST /uploads?type=image`. Тип `photo` не используется. Бинарники в PostgreSQL не кладём.
8. **AI.** Интерфейс `AIProvider`. OpenAI Responses API — адаптер. JSON валидируется Pydantic (`extra=forbid`). Цена, остаток, SKU в пост добавляет backend.
9. **Markdown.** MAX поддерживает `format=markdown`. Текст модели экранируется перед вставкой.
10. **Сессии диалога.** Таблица `user_sessions` — только для шагов «жди CSV / поиск / дату / правку». Это не отдельная фича, без неё сценарии ТЗ не собираются.
11. **Тесты.** Каталог `tests/` в корне проекта (pytest convention). Структура `app/tests/` сознательно не используется.

## Потоки

### Импорт

Пользователь из whitelist шлёт CSV → проверка размера/MIME/расширения → `ImportJob` → upsert по `sku` → отчёт. Строки с ошибками не останавливают импорт. Товары не удаляются.

### Публикация

Выбор товара → AI JSON → `GeneratedContent` + `Publication(draft)` → превью → confirm/schedule/regen/edit/cancel.

Confirm: `draft|scheduled` → `publishing` (commit) → upload/send → `published` + `max_message_id`. Цена и stock читаются из БД в момент отправки.

### Расписание

APScheduler раз в минуту выбирает `scheduled_at <= now()` и публикует тем же сценарием.

## События MAX

Обрабатываются: `message_created`, `message_callback`, `bot_started`, `bot_added` (фиксация канала).

Зарезервированы no-op: `message_edited`, `message_removed`.
