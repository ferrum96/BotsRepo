# Деплой всех сервисов на VPS

## Структура проекта

```
BotsRepo/
├── kanban_board/              # Kanban доска (Node.js)
├── fkandu_manager_bot/        # Telegram бот + дашборд
│   ├── bot/
│   └── dashboard/
│       ├── backend/           # FastAPI
│       └── frontend/          # Next.js
├── pubg_moderator_bot/        # Telegram бот PUBG
├── nginx/                     # Nginx конфиг
│   └── nginx.conf
├── nginx-local.conf           # Nginx для systemd режима
├── deploy.sh                  # Скрипт деплоя
└── DEPLOY.md                  # Эта документация
```

## Быстрый старт

1. **Клонируйте репозиторий на сервер:**
```bash
git clone git@github.com:ferrum96/BotsRepo.git
cd BotsRepo
```

2. **Создайте .env файлы:**
```bash
cp fkandu_manager_bot/.env.example fkandu_manager_bot/.env
cp pubg_moderator_bot/.env.example pubg_moderator_bot/.env
# Заполните переменные окружения
```

3. **Установите зависимости и соберите:**
```bash
./deploy.sh
```

## Сервисы

| Сервис | Описание | Порт | URL |
|--------|----------|------|-----|
| kanban-board | Kanban доска | :448 | http://IP:448 |
| fkandu-dashboard | Дашборд (Next.js) | :444 | http://IP:444 |
| fkandu-api | API дашборда (FastAPI) | :445 | http://IP:445 |
| fkandu-bot | Telegram бот + файловый сервер | :446 | http://IP:446 |
| pubg-bot | Telegram бот PUBG | :447 | http://IP:447 |

Все сервисы проксируются через **Nginx**.

## Управление сервисами (systemd)

```bash
# Статус всех сервисов
systemctl status kanban fkandu-dashboard fkandu-api fkandu-bot pubg-bot

# Перезапуск конкретного сервиса
systemctl restart kanban

# Логи в реальном времени
journalctl -u kanban -f
journalctl -u fkandu-bot -f

# Деплой изменений
./deploy.sh
```

## Хранение данных

| Сервис | Данные | Путь |
|--------|--------|------|
| kanban-board | SQLite БД | kanban_board/data/kanban.db |
| fkandu | SQLite БД | fkandu_manager_bot/data/leads.db |
| pubg-bot | SQLite БД | pubg_moderator_bot/data/bot.db |
