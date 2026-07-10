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
│   │   └── Dockerfile.dev
│   └── frontend/          # Next.js (дашборд)
│       ├── src/
│       └── Dockerfile.dev
├── data/                  # SQLite база (leads.db)
├── docker-compose.dev.yml # Локальная разработка
├── .env.example
└── requirements.txt
```

## Возможности

- **Бот** — принимает заявки через Telegram (категория → товар → бюджет → сроки), оценивает лид, сохраняет в SQLite, уведомляет админа
- **Файловый сервер** — отдаёт файлы из БД по URL (`/files/{file_id}`)
- **Дашборд** — метрики, канбан с drag-and-drop, список заявок с фильтрами, горячие лиды, аналитика

## Запуск (разработка)

### Docker (рекомендуется)

```bash
cd fkandu_manager_bot
cp .env.example .env
docker compose -f docker-compose.dev.yml up --build
```

| Сервис | URL |
|--------|-----|
| Dashboard | http://localhost:3010 |
| API | http://localhost:8010 |

См. [DEV.md](../DEV.md).

### Без Docker

```bash
pip install -r requirements.txt
cp .env.example .env

# Бот + файловый сервер
python -m bot.main

# API (отдельный терминал)
cd dashboard/backend
pip install -r requirements.txt
uvicorn api:app --host 0.0.0.0 --port 8000

# Frontend (отдельный терминал)
cd dashboard/frontend
npm install
npm run dev
```

## Production (VPS)

На сервере используется **systemd**, не Docker:

| URL | Сервис |
|-----|--------|
| http://IP:444 | fkandu-dashboard |
| http://IP:445 | fkandu-api |
| http://IP:446 | fkandu-bot (файлы) |

См. [deploy/DEPLOY.md](../deploy/DEPLOY.md).

## Переменные окружения

| Переменная | Описание |
|------------|----------|
| `BOT_TOKEN` | Токен бота от @BotFather |
| `ADMIN_ID` | Telegram ID администратора |
| `HOSTNAME` | IP-адрес сервера (для файлового сервера) |
