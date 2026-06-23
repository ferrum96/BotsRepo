# fkandu_manager_bot

Telegram-бот и CRM-дашборд для канала **«Дети и Желания»** ([@fkandu](https://t.me/fkandu)).

## Структура

```
├── .env                # Переменные окружения
├── requirements.txt    # Зависимости
├── db/
│   └── leads.db        # SQLite база
├── scripts/
│   ├── bot.py          # Telegram-бот
│   └── api.py          # API-сервер
└── dashboard/
    └── static/
        └── index.html  # React-дашборд
```

## Запуск

```bash
pip install -r requirements.txt

# Терминал 1 — бот
python3 scripts/bot.py

# Терминал 2 — дашборд
python3 scripts/api.py
# → http://localhost:8000
```

## Что делает

- **Бот** — принимает заявки через Telegram (категория → товар → бюджет → сроки), оценивает лид, сохраняет в SQLite, уведомляет админа
- **Дашборд** — 5 страниц: метрики, канбан с drag-and-drop, список заявок с фильтрами, горячие лиды, аналитика
- **Роутинг** — URL-хеши (#kanban, #leads, #hot, #analytics, #dashboard)

## Деплой на сервер

```bash
# 1. Загрузить проект на сервер
scp -r . root@ваш-ip:/root/fkandu_manager_bot

# 2. Настроить .env
ssh root@ваш-ip
cd /root/fkandu_manager_bot
nano .env  # BOT_TOKEN=... ADMIN_ID=...

# 3. На DNS A-запись: crm.fkandu.ru → IP сервера

# 4. Запустить
bash deploy/install.sh
```

Доступ: **https://crm.fkandu.ru**
