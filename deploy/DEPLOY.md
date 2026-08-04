# Деплой на VPS (systemd)

> **Локальная разработка** — Docker: см. [DEV.md](../DEV.md)  
> **Production на сервере** — systemd (сервисы) + nginx (legacy порты) + caddy (HTTPS).

**Активные сервисы:** `kanban`, `bb-clan-api`, `bb-clan-bot`, `deploy-webhook`.  
**FKandu отключён** — unit-файлы в `deploy/systemd/disabled/` (деплой не ставит и останавливает, если ещё крутятся).

## Содержимое `deploy/`

```
deploy/
├── deploy.sh                   # основной скрипт деплоя (пути от расположения скрипта)
├── webhook.py                  # GitHub webhook → автодеплой
├── ports.env                   # карта портов production/dev
├── domains.env.example         # переменные доменов для Caddy
├── webhook.env.example         # шаблон secret для webhook
├── caddy-route.sh              # helper маршрутов Caddy (ставится как caddy-route)
├── duckdns-caddy-setup.sh      # HTTPS gateway (HTTP-01)
├── duckdns-dns01-caddy-setup.sh# HTTPS gateway (DNS-01 fallback)
├── nginx/
│   └── nginx-systemd.conf      # nginx для VPS (порты 447, 448, 450)
├── systemd/                    # активные unit-файлы → /etc/systemd/system/
│   ├── kanban.service
│   ├── bb-clan-api.service
│   ├── bb-clan-bot.service
│   ├── deploy-webhook.service
│   └── disabled/               # fkandu-* (не устанавливаются)
└── DEPLOY.md                   # эта документация
```

## Схема

```
                         ┌──────────────────────────────────────────┐
  http://IP:447,448,450  │  nginx (deploy/nginx/nginx-systemd.conf) │
                         └────────────────────┬─────────────────────┘
                                              │ 127.0.0.1
         ┌────────────────────────────────────┼────────────────────────────┐
         ▼                                    ▼                            ▼
   bb-clan-api :8080                    kanban :3002              deploy-webhook :9000
   bb-clan-bot                          (GitHub → :450 → webhook)
                                          (опционально: Caddy /hooks/deploy)
```

**Не запускайте на сервере:**
- `docker-compose.dev.yml` — только для локалки
- `nginx/nginx.conf` (Docker) — порты уже заняты host-nginx
- unit'ы из `deploy/systemd/disabled/` — пока FKandu выключен

## Пути на сервере

`deploy.sh` сам вычисляет корень репо от своего расположения (`REPO_DIR`).

**systemd unit-файлы** зашивают абсолютный путь `/root/BotsRepo/...`
(`WorkingDirectory`, `EnvironmentFile`, `DATABASE_PATH`, `ExecStart`).

Клонируйте репозиторий именно туда:

```bash
cd /root
git clone git@github.com:ferrum96/BotsRepo.git
```

Если репо лежит в другом каталоге — правьте пути во всех `deploy/systemd/*.service` до первого деплоя.

## Карта портов

Публичные порты nginx **не меняются** без синхронного обновления firewall — см. `deploy/ports.env`.

| Публичный | Сервис | Внутренний (localhost) |
|-----------|--------|------------------------|
| **447** | BB Clan dashboard + API | **8080** |
| **448** | kanban | **3002** |
| **450** | GitHub webhook (nginx HTTP) | **9000** |
| **443** `/hooks/deploy` | GitHub webhook (Caddy HTTPS, опционально) | **9000** |

Legacy-алиасы `PORT_PUBG_*` (= `PORT_BB_CLAN_*`) оставлены для совместимости.  
Порты FKandu 444–446 в nginx больше не слушаются.

## Первичная настройка сервера

```bash
cd /root
git clone git@github.com:ferrum96/BotsRepo.git
cd BotsRepo

cp bb_clan_moderator_bot/.env.example bb_clan_moderator_bot/.env
cp deploy/webhook.env.example deploy/webhook.env
# data/ создаёт deploy.sh сам; можно заранее:
# mkdir -p bb_clan_moderator_bot/data kanban_board/data

nano bb_clan_moderator_bot/.env
# BOT_TOKEN, ADMIN_IDS, GROUP_ID, DASHBOARD_API_KEY,
# DASHBOARD_EVENTS_URL=http://127.0.0.1:8080
nano deploy/webhook.env   # WEBHOOK_SECRET

# HTTPS (опционально, до первого деплоя):
# cp deploy/domains.env.example deploy/domains.env && nano deploy/domains.env

# первый деплой: unit-файлы, nginx, caddy, сервисы
./deploy/deploy.sh
```

`deploy.sh` сам:
- ставит пакет `nginx` (если нет) и копирует `deploy/nginx/nginx-systemd.conf` → `/etc/nginx/nginx.conf`;
- ставит пакет `caddy` (+ официальный repo при необходимости), helper `caddy-route`;
- если есть `deploy/domains.env` с `GATEWAY_DOMAIN` и ещё нет `/etc/caddy/Caddyfile` — гоняет `duckdns-caddy-setup.sh` (полный HTTPS setup);
- если Caddy уже настроен — синхронизирует path-routes (`/hooks/deploy`, `/kanban`, `/bb-clan`) и делает enable/start/reload;
- открывает ufw `:450`, `:80`, `:443` (если ufw активен);
- копирует unit-файлы из `deploy/systemd/*.service` (не `disabled/`);
- делает `disable --now` для `fkandu-dashboard|api|bot`, если они ещё активны.

Перед первым деплоем с HTTPS:
```bash
cp deploy/domains.env.example deploy/domains.env
nano deploy/domains.env   # GATEWAY_DOMAIN, опционально ACME_EMAIL
```

Принудительно пересобрать Caddy (wipe routes + rewrite Caddyfile):
```bash
CADDY_SETUP=1 ./deploy/deploy.sh
```

Отключить Caddy в деплое: `SKIP_CADDY=1 ./deploy/deploy.sh`.

### Смена IP сервера

В unit/nginx/caddy публичный IP **не** зашит. Обновить:

1. **DuckDNS** — A-запись на новый IP.
2. **GitHub webhook** — если URL был `http://СТАРЫЙ_IP:450/`, сменить на новый (HTTPS через gateway трогать не надо).

`bb_clan_moderator_bot/.env` публичный IP не использует (`DASHBOARD_EVENTS_URL` — localhost).

### Webhook для автодеплоя

1. Заполните `deploy/webhook.env` — `WEBHOOK_SECRET` должен совпадать с secret в GitHub.
2. Убедитесь, что сервис запущен: `systemctl status deploy-webhook`.
3. В GitHub → Settings → Webhooks:
   - **Payload URL:** `http://ВАШ_IP:450/`
   - **Content type:** `application/json`
   - **Secret:** тот же, что в `deploy/webhook.env`
   - **Events:** `Push` и `Pull requests`

`deploy.sh` открывает `:450` в ufw (если ufw активен) и ставит nginx-listen. Вручную:

```bash
ufw allow 450/tcp
ufw reload
systemctl reload nginx
```

Опционально HTTPS через Caddy: `https://ВАШ_GATEWAY_DOMAIN/hooks/deploy`

Деплой запускается при:
- merge pull request в default branch (`main`);
- прямом push в `main`.

Логи webhook: `journalctl -u deploy-webhook -f`  
Логи деплоя: `/var/log/deploy.log`

Проверка ping:

```bash
curl -i -X POST http://127.0.0.1:450/ \
  -H "X-GitHub-Event: ping" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Снаружи:

```bash
curl -i -X POST http://ВАШ_IP:450/ \
  -H "X-GitHub-Event: ping" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Если `WEBHOOK_SECRET` не `changeme`, без подписи ответ будет `403 Invalid signature` — это нормально (порт живой).

## Деплой обновлений

```bash
./deploy/deploy.sh
```

Скрипт выполняет:
1. `git pull origin main`
2. определяет изменённые файлы и **пересобирает / перезапускает только затронутые сервисы**
3. отключает FKandu unit'ы, если ещё активны
4. обновляет systemd unit-файлы активных сервисов
5. применяет `alembic upgrade head` для BB Clan (если менялись миграции)
6. ставит/обновляет nginx и caddy (пакет + конфиг + enable/start/reload), открывает ufw `:450/:80/:443`
7. health-check `bb-clan-api` после его рестарта

Полный деплой всех активных сервисов:

```bash
DEPLOY_ALL=1 ./deploy/deploy.sh
```

### Какие изменения затрагивают какие сервисы

| Путь в репозитории | Сервис |
|--------------------|--------|
| `kanban_board/` | `kanban` |
| `bb_clan_moderator_bot/dashboard/frontend/` | `bb-clan-api` (+ сборка SPA) |
| `bb_clan_moderator_bot/dashboard/backend/`, `bot/` | `bb-clan-api`, `bb-clan-bot` |
| `bb_clan_moderator_bot/alembic/` | `bb-clan-api`, `bb-clan-bot` (+ миграции) |
| `fkandu_manager_bot/*` | игнор (сервис отключён) |
| `deploy/webhook.py`, `deploy/systemd/deploy-webhook.service` | `deploy-webhook` |
| `deploy/ports.env` | рестарт всех активных сервисов |
| `deploy/nginx/nginx-systemd.conf` | nginx reload |

## Управление

```bash
systemctl status kanban bb-clan-api bb-clan-bot deploy-webhook
journalctl -u bb-clan-api -f
journalctl -u deploy-webhook -f
systemctl restart bb-clan-api
```

## URL

| URL | Описание |
|-----|----------|
| http://IP:447 | BB Clan dashboard (legacy nginx) |
| http://IP:448 | Kanban (legacy nginx) |
| http://IP:450/ | GitHub deploy webhook (HTTP, нужен `ufw allow 450`) |
| https://GATEWAY/hooks/deploy | GitHub deploy webhook (HTTPS, опционально) |
| https://bb-clan.duckdns.org/ | BB Clan (Caddy, если настроен) |
| https://kanban-board.duckdns.org/ | Kanban (Caddy, если настроен) |

## HTTPS через DuckDNS + Caddy

Обычно достаточно `deploy/domains.env` + `./deploy/deploy.sh` — Caddy ставится и настраивается автоматически.

Режим рассчитан на **статический IP** (без duckdns updater): DNS A-запись должна уже указывать на VPS.

Текущие целевые URL:
- `https://kanban-board.duckdns.org/` (kanban — default на корне gateway)
- `https://kanban-board.duckdns.org/hooks/deploy` (GitHub webhook)
- `https://bb-clan.duckdns.org/` (или path `/bb-clan` на gateway)
- `https://fkandu.duckdns.org/` (домен в `domains.env`; Caddy-routes только при `ENABLE_FKANDU=1`)

```bash
cp deploy/domains.env.example deploy/domains.env
nano deploy/domains.env
# GATEWAY_DOMAIN=...
# ACME_EMAIL=you@example.com   # опционально
./deploy/deploy.sh
```

Принудительный полный setup (перезапись Caddyfile + routes):

```bash
CADDY_SETUP=1 ./deploy/deploy.sh
# или вручную:
./deploy/duckdns-caddy-setup.sh --email you@example.com
```

Что делает полный setup:
- настраивает `Caddy` как HTTPS gateway;
- читает `deploy/domains.env`;
- создаёт маршруты `/hooks/deploy`, `/kanban`, `/bb-clan` (+ host-блоки для отдельных доменов);
- **не** создаёт маршруты FKandu, пока `ENABLE_FKANDU=0`;
- ставит helper `caddy-route`.

Пример `deploy/domains.env`:

```bash
GATEWAY_DOMAIN="kanban-board.duckdns.org"
SERVICE_DOMAIN_KANBAN=""
SERVICE_DOMAIN_BB_CLAN="bb-clan.duckdns.org"
SERVICE_DOMAIN_FKANDU="fkandu.duckdns.org"
ACME_EMAIL="you@example.com"
```

Проверка:

```bash
systemctl status caddy --no-pager
curl -I https://YOUR_GATEWAY_DOMAIN
curl -I https://bb-clan.duckdns.org/
```

Старые route-файлы `/pubg` / fkandu: `CADDY_SETUP=1 ./deploy/deploy.sh` или удалить `/etc/caddy/routes/pubg.caddy` и `fkandu-*.caddy`, затем `systemctl reload caddy`.

### Если HTTP-01 challenge не проходит (fallback DNS-01)

```bash
./deploy/duckdns-dns01-caddy-setup.sh \
  --email you@example.com \
  --duckdns-token YOUR_DUCKDNS_TOKEN
```

### Добавление будущих сервисов

```bash
caddy-route add --name analytics --path /analytics --upstream 127.0.0.1:9100
caddy-route list
caddy-route add-from-unit --unit kanban --name kanban --path /kanban
caddy-route add-from-unit --unit bb-clan-api --name bb-clan --path /bb-clan
caddy-route sync --from /etc/systemd/system --prefix /svc --include 'kanban|bb-clan' --dry-run
caddy-route remove --name analytics
```

## Данные

| Сервис | SQLite |
|--------|--------|
| kanban | `kanban_board/data/` |
| bb-clan | `bb_clan_moderator_bot/data/bot.db` |

## Устранение 502 на :447

502 = nginx работает, но **backend не отвечает** на `127.0.0.1:8080`.

```bash
systemctl status bb-clan-api
journalctl -u bb-clan-api -n 50 --no-pager
curl -v http://127.0.0.1:8080/health
grep bb_clan_dashboard /etc/nginx/nginx.conf
# должно быть: server 127.0.0.1:8080;

cp deploy/nginx/nginx-systemd.conf /etc/nginx/nginx.conf
nginx -t && systemctl reload nginx
systemctl restart bb-clan-api
```

Частые причины:
- нет или пустой `bb_clan_moderator_bot/.env` (нужны `BOT_TOKEN`, `GROUP_ID`, `ADMIN_IDS`)
- не собран фронт (`dashboard/frontend/dist` — делает `deploy/deploy.sh`)
- старый nginx с `pubg_dashboard` / `host.docker.internal` — заменить конфигом из репо
- unit ещё ссылается на `pubg-api` — заменить на `bb-clan-api` и `daemon-reload`

## BB Clan — переменные окружения (production)

| Переменная | Значение |
|------------|----------|
| `DASHBOARD_PORT` | `8080` |
| `DASHBOARD_API_KEY` | Ключ для POST; при деплое уходит во фронт как `VITE_DASHBOARD_API_KEY` |
| `DASHBOARD_EVENTS_URL` | `http://127.0.0.1:8080` на VPS (в `.env.example` указан dev-порт `8081`) |
| `GROUP_SYNC_INTERVAL_MINUTES` | Интервал сверки состава группы (по умолчанию 10) |
| `DATABASE_PATH` | Unit: `/root/BotsRepo/bb_clan_moderator_bot/data/bot.db` |

Полный список — в [bb_clan_moderator_bot/README.md](../bb_clan_moderator_bot/README.md).

## Вернуть FKandu

См. [deploy/systemd/disabled/README.md](systemd/disabled/README.md). Кратко: перенести unit'ы, добавить в `SERVICES` + сборку в `deploy.sh`, вернуть nginx 444–446, при Caddy — `ENABLE_FKANDU=1`.
