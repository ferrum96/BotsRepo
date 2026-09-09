# AstroStone — MVP + архитектура оценки

Демо симулирует бизнес-поток ТЗ. Вкладки **Архитектура / План / Риски** — декомпозиция для оценки и постановки задач (NestJS + PostgreSQL + BullMQ + amoCRM).

## Запуск

```bash
cd fl_5521193
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 5521
```

Открыть: http://127.0.0.1:5521

## Деплой на VPS

Через общий `deploy/deploy.sh` (unit `astrostone-mvp`):

```bash
# на сервере, из /root/BotsRepo
DEPLOY_ALL=1 ./deploy/deploy.sh
```

Вручную:

```bash
cd /root/BotsRepo/fl_5521193
python3.12 -m venv .venv   # или python3
.venv/bin/pip install -r requirements.txt
cp /root/BotsRepo/deploy/systemd/astrostone-mvp.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now astrostone-mvp
```

| URL | |
|-----|--|
| http://IP:449 | публичный (nginx → :5521) |
| http://127.0.0.1:5521/health | health |
| HTTPS | опционально `SERVICE_DOMAIN_ASTROSTONE` + `CADDY_SETUP=1 ./deploy/deploy.sh` |

Логи: `journalctl -u astrostone-mvp -f`

## Вкладки дашборда

| Вкладка | Содержание |
|---|---|
| Демо | Импорт Excel, изначальные 100 CRM, дедуп, сделки, касания, KPI |
| Архитектура | Поток, компоненты, стек, демо vs прод |
| План | Фазы 1–4, этапы 0–18, эпики трекера, scoring |
| Риски | Telegram, дубли, idempotency, CRM≠продажи, антиспам |

## Старт продакшена (не с рассылки)

1. Модель данных  
2. Импорт  
3. Дедуп  
4. Проверка допустимого канала первого контакта  

Потом: касания, scoring, партнёрская аналитика.

## API

- `GET /api/overview` · `/api/architecture`
- `GET /api/contacts?scope=initial|new|all`
- `GET /api/import/template.xlsx` · `POST /api/import/excel`
- `GET /api/leads` · `/api/deals` · `/api/dedup`
- `GET /api/messages` · `/api/replies` · `/api/tasks` · `/api/logs`
- `POST /api/reset-demo`
