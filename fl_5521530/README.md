# MAX Shop Bot

Модульный монолит: FastAPI + PostgreSQL + один MAX-бот. Веб-панели и Telegram нет.

Пользователь из whitelist загружает CSV, выбирает товар, получает AI-описание, подтверждает публикацию в MAX-канал.

Архитектура: [docs/01-architecture.md](docs/01-architecture.md).

## Требования

- Python 3.12+
- Docker Compose (для PostgreSQL и деплоя)
- HTTPS endpoint на порту 443 для production webhook
- Бот уже добавлен в канал с правом публикации

## Быстрый старт

```bash
cp .env.example .env
# заполните MAX_BOT_TOKEN, MAX_WEBHOOK_SECRET, AI_API_KEY, ALLOWED_MAX_USER_IDS, MAX_CHANNEL_ID
docker compose up --build
```

Приложение: `http://localhost:8000/health`  
Webhook: `POST /api/max/webhook` (секрет в заголовке `X-Max-Bot-Api-Secret`)

Миграции выполняются при старте контейнера `app`.

Локально без Docker:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
export DATABASE_URL=postgresql+asyncpg://maxbot:maxbot@127.0.0.1:5432/maxbot
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

## Переменные окружения

См. `.env.example`. Обязательные секреты:

- `MAX_BOT_TOKEN`
- `MAX_WEBHOOK_SECRET` (5–256 символов `A-Za-z0-9_-`)
- `DATABASE_URL`
- `AI_API_KEY`

`MAX_WEBHOOK_URL` обязателен, если `MAX_USE_LONG_POLLING=false`. Только HTTPS.

`ALLOWED_MAX_USER_IDS` — fail closed: пустой список, никто не проходит.

`MAX_CHANNEL_ID` — chat_id канала. Альтернатива: событие `bot_added` с `is_channel=true`. Метод `GET /chats` не используется.

## Команды бота

`/start` `/catalog` `/random` `/publish` `/schedule` `/history` `/settings` `/help`

CSV колонки: `sku,name,category,description,price,currency,stock,image_url`. Неизвестные колонки пишутся в `source_data`. Повторный импорт обновляет по `sku`, товары не удаляет.

Пример файла: `samples/catalog.csv`.

## Тесты

```bash
pip install -e ".[dev]"
pytest
```

## Резервное копирование

```bash
docker compose --profile backup run --rm backup
```

Дамп: `backups/maxbot-*.sql.gz`. PostgreSQL в Compose слушает только `127.0.0.1:5432`.

## Production

- Webhook только HTTPS, порт 443, сертификат доверенного CA (в т.ч. Минцифры)
- Long polling не использовать (`MAX_USE_LONG_POLLING=false`)
- Не публиковать PostgreSQL в интернет
- Токен только в env, не в логах
- Least privilege: отдельная роль БД без SUPERUSER после миграций

## Ограничения MAX, которые влияют на работу

- Webhook должен ответить 200 за 30 секунд
- Не более 2 сообщений в секунду в один чат
- 30 rps на platform-api2.max.ru
- Callback payload до 4096 байт (мы храним только `entity:action:id`)
- Картинки: тип `image`, не `photo`. Внешний URL поддерживается; иначе `POST /uploads?type=image`
- После загрузки файла MAX может ответить `attachment.not.ready` — нужна пауза/повтор
- Токен не передаётся query-параметром
