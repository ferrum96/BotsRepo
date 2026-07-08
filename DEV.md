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
| Kanban (UI) | http://localhost:5173 |
| Kanban (API) | http://localhost:3001 |
| PUBG dashboard (Vite) | http://localhost:5174 |
| PUBG API | http://localhost:8081 |

## PUBG — типичный workflow

```bash
cd pubg_moderator_bot
docker compose -f docker-compose.dev.yml up --build
```

- **pubg-dashboard** — hot reload фронта
- **pubg-api** — FastAPI с `--reload`
- **pubg-bot** — бот в `network_mode: host`

Остановка: `docker compose -f docker-compose.dev.yml down`

## Что не использовать локально

| Файл | Назначение |
|------|------------|
| `docker-compose.yml` (без `.dev`) | Production-like Docker, не для dev |
| `nginx/nginx.conf` | VPS reverse proxy 444–448, на локалке не нужен |
| `deploy.sh` | Только для сервера (systemd) |

## Порты

Полная карта: `deploy/ports.env`.
