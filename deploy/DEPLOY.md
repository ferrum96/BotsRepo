# Деплой на VPS (systemd)

> **Локальная разработка** — Docker: см. [DEV.md](../DEV.md)  
> **Production на сервере** — systemd (сервисы) + nginx (legacy порты) + caddy (HTTPS).

## Содержимое `deploy/`

```
deploy/
├── deploy.sh              # основной скрипт деплоя
├── webhook.py             # GitHub webhook → автодеплой
├── ports.env              # карта портов production/dev
├── domains.env.example    # переменные доменов для Caddy
├── webhook.env.example    # шаблон secret для webhook
├── nginx/
│   └── nginx-systemd.conf # nginx для VPS (порты 444–449)
├── systemd/               # unit-файлы → /etc/systemd/system/
└── DEPLOY.md              # эта документация
```

## Схема

```
                         ┌──────────────────────────────────────────┐
  http://IP:444–449      │  nginx (deploy/nginx/nginx-systemd.conf) │
                         └────────────────────┬─────────────────────┘
                                              │ 127.0.0.1
         ┌────────────────────────────────────┼────────────────────────────┐
         ▼                                    ▼                            ▼
   fkandu :3000                       pubg-api :8080                 kanban :3002
   fkandu-api :8000                   pubg-bot                       deploy-webhook :9000
   fkandu-bot :8088                   (GitHub → :449 → webhook)
```

**Не запускайте на сервере:**
- `docker-compose.dev.yml` — только для локалки
- `nginx/nginx.conf` (Docker) — порты 444–449 уже заняты host-nginx

## Карта портов

Публичные порты nginx **не меняются** — см. `deploy/ports.env`.

| Публичный | Сервис | Внутренний (localhost) |
|-----------|--------|------------------------|
| **444** | fkandu-dashboard | **3000** |
| **445** | fkandu-api | **8000** |
| **446** | fkandu-bot (файлы) | **8088** |
| **447** | PUBG dashboard + API | **8080** |
| **448** | kanban | **3002** *(3000 занят fkandu)* |
| **449** | GitHub deploy webhook | **9000** |

## Первичная настройка сервера

```bash
git clone git@github.com:ferrum96/BotsRepo.git
cd BotsRepo

cp fkandu_manager_bot/.env.example fkandu_manager_bot/.env
cp pubg_moderator_bot/.env.example pubg_moderator_bot/.env
cp deploy/webhook.env.example deploy/webhook.env
mkdir -p pubg_moderator_bot/data

# nginx на хосте (единственный reverse proxy)
cp deploy/nginx/nginx-systemd.conf /etc/nginx/nginx.conf
nginx -t && systemctl enable nginx && systemctl start nginx

# первый деплой (unit-файлы копируются и включаются автоматически)
./deploy/deploy.sh
```

Unit-файлы из `deploy/systemd/` **`deploy/deploy.sh` копирует в `/etc/systemd/system/`**, делает `daemon-reload`, `enable` и `start` при первом запуске.

### Webhook для автодеплоя

1. Заполните `deploy/webhook.env` — `WEBHOOK_SECRET` должен совпадать с secret в GitHub.
2. Убедитесь, что сервис запущен: `systemctl status deploy-webhook`.
3. В GitHub → Settings → Webhooks создайте webhook:
   - **Payload URL:** `http://ВАШ_IP:449/`
   - **Content type:** `application/json`
   - **Secret:** тот же, что в `deploy/webhook.env`
   - **Events:** `Push` и `Pull requests`

Деплой запускается при:
- merge pull request в default branch (`main`);
- прямом push в `main`.

Логи webhook: `journalctl -u deploy-webhook -f`  
Логи деплоя: `/var/log/deploy.log`

Проверка ping:

```bash
curl -i -X POST http://127.0.0.1:449/ \
  -H "X-GitHub-Event: ping" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Деплой обновлений

```bash
./deploy/deploy.sh
```

Скрипт выполняет:
1. `git pull origin main`
2. определяет изменённые файлы и **пересобирает / перезапускает только затронутые сервисы**
3. обновляет systemd unit-файлы при необходимости
4. применяет `alembic` для PUBG (если менялись миграции)
5. обновляет nginx-конфиг и делает reload

Полный деплой всех сервисов вручную:

```bash
DEPLOY_ALL=1 ./deploy/deploy.sh
```

### Какие изменения затрагивают какие сервисы

| Путь в репозитории | Сервис |
|--------------------|--------|
| `kanban_board/` | `kanban` |
| `fkandu_manager_bot/dashboard/frontend/` | `fkandu-dashboard` |
| `fkandu_manager_bot/dashboard/backend/` | `fkandu-api` |
| `fkandu_manager_bot/bot/`, `requirements.txt` | `fkandu-bot` |
| `pubg_moderator_bot/dashboard/frontend/` | `pubg-api` (+ сборка SPA) |
| `pubg_moderator_bot/dashboard/backend/`, `bot/` | `pubg-api`, `pubg-bot` |
| `pubg_moderator_bot/alembic/` | `pubg-api`, `pubg-bot` (+ миграции) |
| `deploy/webhook.py`, `deploy/systemd/deploy-webhook.service` | `deploy-webhook` |
| `deploy/nginx/nginx-systemd.conf` | nginx reload |

## Управление

```bash
systemctl status kanban fkandu-dashboard fkandu-api fkandu-bot pubg-api pubg-bot deploy-webhook
journalctl -u pubg-api -f
journalctl -u deploy-webhook -f
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
| http://IP:449/ | GitHub deploy webhook (POST) |

## HTTPS через DuckDNS + Caddy

Скрипт настраивает общий HTTPS gateway для текущих сервисов и удобное добавление будущих.
Режим рассчитан на **статический IP** (без duckdns updater-сервисов).

Текущие целевые URL:
- `https://fkandu.duckdns.org/dashboard`
- `https://fkandu.duckdns.org/api`
- `https://fkandu.duckdns.org/files`
- `https://kanban-board.duckdns.org/`
- `https://bb-clan.duckdns.org/`

1. Убедитесь, что DNS уже указывает на ваш VPS (статический IP).
2. (Опционально) задайте отдельные домены сервисов:

```bash
cp deploy/domains.env.example deploy/domains.env
nano deploy/domains.env
```

3. На сервере из корня репозитория запустите:

```bash
./deploy/duckdns-caddy-setup.sh \
  --gateway-domain YOUR_GATEWAY_DOMAIN \
  --email you@example.com
```

Что делает скрипт:
- настраивает `Caddy` как HTTPS gateway с path-based роутингом;
- читает `deploy/domains.env` (если есть) и создает host-based домены сервисов;
- создает базовые маршруты для текущих сервисов:
  - `/kanban` -> `127.0.0.1:3002`
  - `/dashboard` -> `127.0.0.1:3000`
  - `/api` -> `127.0.0.1:8000`
  - `/files` -> `127.0.0.1:8088`
  - `/pubg` -> `127.0.0.1:8080`
- открывает `80/443` в `ufw` (если не указан `--no-firewall`).

Переменные доменов в `deploy/domains.env`:

```bash
GATEWAY_DOMAIN="fkandu.duckdns.org"
SERVICE_DOMAIN_FKANDU="fkandu.duckdns.org"
SERVICE_DOMAIN_KANBAN="kanban-board.duckdns.org"
SERVICE_DOMAIN_FKANDU_API=""
SERVICE_DOMAIN_FKANDU_FILES=""
SERVICE_DOMAIN_BB_CLAN="bb-clan.duckdns.org"
```

Проверка:

```bash
systemctl status caddy --no-pager
curl -I https://YOUR_GATEWAY_DOMAIN
```

### Добавление будущих сервисов

После установки доступна команда `caddy-route`:

```bash
caddy-route add --name analytics --path /analytics --upstream 127.0.0.1:9100
caddy-route list
```

Автовариант из `systemd` unit (порт определяется автоматически):

```bash
caddy-route add-from-unit --unit kanban --name kanban --path /kanban
caddy-route add-from-unit --unit pubg-api --name pubg --path /pubg
```

Массовый импорт маршрутов из unit-файлов:

```bash
# Предпросмотр без изменений
caddy-route sync --from /etc/systemd/system --prefix /svc --dry-run

# Применить только для сервисов ботов/дашбордов
caddy-route sync --from /etc/systemd/system --prefix /svc --include 'kanban|fkandu|pubg'
```

Удаление маршрута:

```bash
caddy-route remove --name analytics
```

## Данные

| Сервис | SQLite |
|--------|--------|
| kanban | `kanban_board/data/` |
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
cp deploy/nginx/nginx-systemd.conf /etc/nginx/nginx.conf
nginx -t && systemctl reload nginx
systemctl restart pubg-api
```

Частые причины:
- нет или пустой `pubg_moderator_bot/.env` (нужны `BOT_TOKEN`, `GROUP_ID`)
- не собран фронт (`dashboard/frontend/dist` — делает `deploy/deploy.sh`)
- старый nginx-конфиг с `host.docker.internal` вместо `127.0.0.1`

## PUBG — переменные окружения

| Переменная | Значение |
|------------|----------|
| `DASHBOARD_PORT` | `8080` |
| `DASHBOARD_API_KEY` | Ключ для POST из дашборда |
| `GROUP_SYNC_INTERVAL_MINUTES` | Интервал синхронизации состава группы (по умолчанию 10) |
