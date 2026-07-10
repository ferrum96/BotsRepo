# Локальная разработка (Docker)

На **локальной машине** все сервисы поднимаются через **`docker-compose.dev.yml`** в каждом проекте.

На **сервере (VPS)** используется **systemd** — см. [DEPLOY.md](./DEPLOY.md).

## Быстрый старт

```bash
# 1. Env-файлы
cp fkandu_manager_bot/.env.example fkandu_manager_bot/.env
cp pubg_moderator_bot/.env.example pubg_moderator_bot/.env

# 2. Запуск нужных стеков
cd fkandu_manager_bot && docker compose -f docker-compose.dev.yml up --build -d
cd kanban_board && docker compose -f docker-compose.dev.yml up --build -d
cd pubg_moderator_bot && docker compose -f docker-compose.dev.yml up --build -d
```

Dev-порты **не конфликтуют** с production — см. `deploy/ports.env`.

## URL (localhost)

| Проект | URL |
|--------|-----|
| FKandu dashboard | http://localhost:3010 |
| FKandu API | http://localhost:8010 |
| Kanban (UI, Vite) | http://localhost:5173 |
| Kanban (API, Hono) | http://localhost:3001 |
| PUBG dashboard (Vite) | http://localhost:5174 |
| PUBG API | http://localhost:8081 |

## PUBG — типичный workflow

```bash
cd pubg_moderator_bot
docker compose -f docker-compose.dev.yml up --build
```

- **pubg-dashboard** — hot reload фронта (Vite)
- **pubg-api** — FastAPI с `--reload`, миграции Alembic при старте
- **pubg-bot** — бот в `network_mode: host` (нужен для Telegram polling и группы)

Остановка: `docker compose -f docker-compose.dev.yml down`

Пересборка только бота после изменений в Python:

```bash
docker compose -f docker-compose.dev.yml build --no-cache pubg-bot
docker compose -f docker-compose.dev.yml up -d pubg-bot
docker compose -f docker-compose.dev.yml logs -f pubg-bot
```

## FKandu — типичный workflow

```bash
cd fkandu_manager_bot
docker compose -f docker-compose.dev.yml up --build
```

- **fkandu-dashboard** — Next.js dev
- **fkandu-api** — FastAPI
- **fkandu-bot** — Telegram-бот + файловый сервер (`network_mode: host`)

## Kanban — типичный workflow

```bash
cd kanban_board
docker compose -f docker-compose.dev.yml up --build
```

- **kanban** — Hono API + Vite UI в одном dev-контейнере

## Что не использовать локально

| Файл | Назначение |
|------|------------|
| `nginx/nginx-systemd.conf` | Production reverse proxy (порты 444–449), на локалке не нужен |
| `deploy.sh` | Production-деплой через systemd |
| `webhook.py` | GitHub webhook для автодеплоя на VPS |

## Порты

Полная карта: `deploy/ports.env`.

Production webhook (только VPS): `http://IP:449/` → `127.0.0.1:9000`.
