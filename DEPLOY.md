# Деплой на VPS (systemd)

> **Локальная разработка** — Docker: см. [DEV.md](./DEV.md)  
> **Production на сервере** — systemd + nginx на хосте.

## Схема

```
                    ┌─────────────────────────────────────┐
  http://IP:444–448 │  nginx (systemd, nginx-systemd.conf) │
                    └──────────────┬──────────────────────┘
                                   │ 127.0.0.1
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
   fkandu :3000              pubg-api :8080            kanban :3002
   fkandu-api :8000          pubg-bot                 (+ bots)
   fkandu-bot :8088
```

**Не запускайте на сервере:**
- `docker-compose.dev.yml` — только для локалки
- `pubg_moderator_bot/docker-compose.yml` — альтернативный Docker-prod, конфликтует с systemd
- второй nginx (`nginx/nginx.conf` в Docker) — порты 444–448 уже заняты host-nginx

## Карта портов

Публичные порты nginx **не меняются** — см. `deploy/ports.env`.

| Публичный | Сервис | Внутренний (localhost) |
|-----------|--------|------------------------|
| **444** | fkandu-dashboard | **3000** |
| **445** | fkandu-api | **8000** |
| **446** | fkandu-bot (файлы) | **8088** |
| **447** | PUBG dashboard | **8080** |
| **448** | kanban | **3002** *(3000 занят fkandu)* |

## Первичная настройка сервера

```bash
git clone git@github.com:ferrum96/BotsRepo.git
cd BotsRepo

cp fkandu_manager_bot/.env.example fkandu_manager_bot/.env
cp pubg_moderator_bot/.env.example pubg_moderator_bot/.env
mkdir -p pubg_moderator_bot/data

# nginx на хосте (единственный reverse proxy)
cp nginx/nginx-systemd.conf /etc/nginx/nginx.conf
nginx -t && systemctl enable nginx && systemctl start nginx

# первый деплой (unit-файлы копируются и включаются автоматически)
./deploy.sh
```

Unit-файлы из `systemd/` **`deploy.sh` копирует в `/etc/systemd/system/`**, делает `daemon-reload`, `enable` и `start` при первом запуске.

## Деплой обновлений

```bash
./deploy.sh
```

Скрипт: `git pull` → установка/обновление systemd units → сборка → `alembic` → restart/start сервисов → `nginx reload`.

## Управление

```bash
systemctl status kanban fkandu-dashboard fkandu-api fkandu-bot pubg-api pubg-bot
journalctl -u pubg-api -f
systemctl restart pubg-api
```

## URL

| URL | Описание |
|-----|----------|
| http://IP:444 | FKandu dashboard |
| http://IP:445 | FKandu API |
| http://IP:446 | FKandu файлы |
| http://IP:447 | PUBG clan dashboard |
| http://IP:448 | Kanban |

## Данные

| Сервис | SQLite |
|--------|--------|
| kanban | `kanban_board/data/kanban.db` |
| fkandu | `fkandu_manager_bot/data/leads.db` |
| pubg | `pubg_moderator_bot/data/bot.db` |

## Устранение 502 на :447

502 = nginx работает, но **backend не отвечает** на `127.0.0.1:8080`.

```bash
# 1. Статус pubg-api
systemctl status pubg-api
journalctl -u pubg-api -n 50 --no-pager

# 2. Отвечает ли API напрямую
curl -v http://127.0.0.1:8080/health

# 3. Nginx проксирует на localhost (не host.docker.internal)
grep pubg_dashboard /etc/nginx/nginx.conf
# должно быть: server 127.0.0.1:8080;

# 4. Обновить конфиг и перезапустить
cp nginx/nginx-systemd.conf /etc/nginx/nginx.conf
nginx -t && systemctl reload nginx
systemctl restart pubg-api
```

Частые причины:
- нет или пустой `pubg_moderator_bot/.env` (нужны `BOT_TOKEN`, `GROUP_ID`)
- не собран фронт (`dashboard/frontend/dist` — делает `deploy.sh`)
- старый nginx-конфиг с `host.docker.internal` вместо `127.0.0.1`

## PUBG — переменные окружения

| Переменная | Значение |
|------------|----------|
| `DASHBOARD_PORT` | `8080` |
| `DASHBOARD_API_KEY` | Ключ для POST из дашборда |
