# fkandu_manager_bot

Telegram-бот и CRM-дашборд для канала **«Дети и Желания»** ([@fkandu](https://t.me/fkandu)).

## Структура

```
fkandu_manager_bot/
├── bot/                   # Telegram-бот (aiogram)
│   ├── main.py            # Точка входа + файловый сервер
│   ├── config.py          # Конфигурация из .env
│   ├── database.py        # SQLite
│   ├── keyboards.py       # Кнопки
│   └── handlers/
│       └── lead_form.py   # Обработка заявок
├── dashboard/
│   ├── backend/           # FastAPI (API для дашборда)
│   │   ├── api.py
│   │   └── Dockerfile
│   └── frontend/          # Next.js (дашборд)
│       ├── src/
│       │   ├── components/
│       │   └── app/
│       └── Dockerfile
├── data/                  # SQLite база (leads.db)
├── .env                   # Переменные окружения
├── requirements.txt       # Python зависимости
└── Dockerfile
```

## Возможности

- **Бот** — принимает заявки через Telegram (категория → товар → бюджет → сроки), оценивает лид, сохраняет в SQLite, уведомляет админа
- **Файловый сервер** — отдаёт файлы из БД по URL (`/files/{file_id}`)
- **Дашборд** — 5 страниц: метрики, канбан с drag-and-drop, список заявок с фильтрами, горячие лиды, аналитика

## Запуск (разработка)

```bash
# 1. Установить зависимости
pip install -r requirements.txt

# 2. Настроить .env
cp .env.example .env
# Заполните BOT_TOKEN, ADMIN_ID, HOSTNAME

# 3. Запустить бота (включает файловый сервер на порту 8088)
python -m bot.main

# 4. Запустить API дашборда (отдельный терминал)
cd dashboard/backend
pip install -r requirements.txt
uvicorn api:app --host 0.0.0.0 --port 8000

# 5. Запустить фронтенд дашборда (отдельный терминал)
cd dashboard/frontend
npm install
npm run dev
```

## Docker

```bash
# Из корня BotsRepo/
docker-compose up -d --build
```

Сервисы:
- `fkandu-bot` — бот + файловый сервер → порт 3001 (внешний) / 8088 (контейнер)
- `fkandu-api` — FastAPI → порт 3002 / 8000
- `fkandu-dashboard` — Next.js → порт 3003 / 3000

## Переменные окружения

| Переменная | Описание |
|------------|----------|
| `BOT_TOKEN` | Токен бота от @BotFather |
| `ADMIN_ID` | Telegram ID администратора |
| `HOSTNAME` | IP-адрес сервера (для файлового сервера) |
