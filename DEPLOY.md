# Деплой всех сервисов на VPS

## Структура проекта

```
BotsRepo/
├── kanban_board/              # Kanban доска (Next.js + Prisma)
│   ├── frontend/
│   ├── backend/
│   └── data/
├── fkandu_manager_bot/        # Telegram бот + дашборд
│   ├── bot/
│   ├── dashboard/
│   │   ├── backend/           # FastAPI
│   │   └── frontend/          # Next.js
│   └── data/
├── pubg_moderator_bot/        # Telegram бот PUBG
│   ├── bot/
│   └── data/
├── docker-compose.yml         # Основной файл деплоя
├── deploy.sh                  # Скрипт деплоя
└── DEPLOY.md                  # Эта документация
```

## Быстрый старт

1. **Клонируйте репозиторий на сервер:**
```bash
git clone <your-repo-url>
cd BotsRepo
```

2. **Создайте .env файлы:**
```bash
cp fkandu_manager_bot/.env.example fkandu_manager_bot/.env
cp pubg_moderator_bot/.env.example pubg_moderator_bot/.env
# Заполните переменные окружения
```

3. **Запустите деплой:**
```bash
./deploy.sh
```

## Сервисы

| Сервис | Описание | Порт (внешний) |
|--------|----------|----------------|
| kanban-board | Kanban доска (Next.js + Prisma) | 3000 |
| fkandu-bot | Telegram бот + файловый сервер | 3001 |
| fkandu-api | API дашборда (FastAPI) | 3002 |
| fkandu-dashboard | Дашборд (Next.js) | 3003 |
| pubg-bot | Telegram бот PUBG | — |

## Доступ

```
http://your-server-ip:3000  # Kanban Board
http://your-server-ip:3001  # FKandu Files (файловый сервер бота)
http://your-server-ip:3002  # FKandu API
http://your-server-ip:3003  # FKandu Dashboard
```

## Команды

```bash
# Запуск всех сервисов
docker-compose up -d

# Остановка всех сервисов
docker-compose down

# Просмотр логов
docker-compose logs -f

# Перезапуск конкретного сервиса
docker-compose restart kanban-board

# Сборка без кеша
docker-compose build --no-cache
```

## Хранение данных

| Сервис | Данные | Путь на хосте |
|--------|--------|---------------|
| kanban-board | SQLite БД | kanban_board/data/prod.db |
| fkandu | SQLite БД | fkandu_manager_bot/data/leads.db |
| pubg-bot | SQLite БД | pubg_moderator_bot/data/bot.db |

## Устранение проблем

### Контейнер не запускается

1. Проверьте логи: `docker-compose logs <service>`
2. Убедитесь, что порты не заняты: `lsof -i :<port>`
3. Проверьте .env файлы

### Порты уже заняты

Измените порт в `docker-compose.yml`:
```yaml
ports:
  - "3001:3000"  # Измените внешний порт
```
