# Деплой всех сервисов на VPS

## Структура проекта

```
BotsRepo/
├── kanban_board/          # Next.js kanban доска (порт 3000)
├── fkandu_manager_bot/    # Python бот + дашборд (порты 8088, 8000)
├── pubg_moderator_bot/    # Python бот
├── docker-compose.yml     # Основной файл деплоя
├── deploy.sh             # Скрипт деплоя
└── .dockerignore         # Игнорируемые файлы
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

| Сервис | Описание | Порт |
|--------|----------|------|
| kanban-board | Kanban доска (Next.js) | 3000 |
| fkandu-bot | Telegram бот FKandu | 8088 |
| fkandu-dashboard | Дашборд FKandu (FastAPI) | 8000 |
| pubg-bot | Telegram бот PUBG | - |

## Доступ

После деплоя сервисы доступны по адресам:
```
http://your-server-ip:3000  # Kanban Board
http://your-server-ip:8000  # FKandu Dashboard
http://your-server-ip:8088  # FKandu Files
```

## Команды

```bash
# Запуск всех сервисов
docker-compose up -d

# Остановка всех сервисов
docker-compose down

# Просмотра логов
docker-compose logs -f

# Перезапуск конкретного сервиса
docker-compose restart kanban

# Сборка без кеша
docker-compose build --no-cache
```

## Хранение данных

| Сервис | Данные | Путь в контейнере |
|--------|--------|-------------------|
| kanban-board | SQLite БД | /app/data/prod.db |
| fkandu | SQLite БД | /app/db/leads.db |
| pubg-bot | Данные | /app/data/ |

## Устранение проблем

### Контейнер не запускается

1. Проверьте логи: `docker-compose logs <service>`
2. Убедитесь, что порты не заняты: `lsof -i :<port>`
3. Проверьте .env файлы

### Порты уже заняты

Если порт уже используется другим сервисом, измените его в `docker-compose.yml`:
```yaml
ports:
  - "3001:3000"  # Измените 3000 на 3001
```
