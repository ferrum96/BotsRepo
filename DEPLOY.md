# Деплой всех сервисов на VPS

## Структура проекта

```
BotsRepo/
├── kanban_board/          # Next.js kanban доска (порт 3000)
├── fkandu_manager_bot/    # Python бот + дашборд (порты 8088, 8000)
├── pubg_moderator_bot/    # Python бот
├── nginx/                 # Конфигурация nginx
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

4. **Настройте DNS:**
   - kanban.yourdomain.com → your-server-ip
   - dashboard.yourdomain.com → your-server-ip
   - files.yourdomain.com → your-server-ip

## Сервисы

| Сервис | Описание | Порт |
|--------|----------|------|
| nginx | Reverse proxy | 80, 443 |
| kanban-board | Kanban доска (Next.js) | 3000 |
| fkandu-bot | Telegram бот FKandu | 8088 |
| fkandu-dashboard | Дашборд FKandu (FastAPI) | 8000 |
| pubg-bot | Telegram бот PUBG | - |

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

## SSL сертификаты

Для HTTPS создайте сертификаты:

```bash
# Self-signed (для тестов)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout nginx/certs/privkey.pem \
    -out nginx/certs/fullchain.pem

# Или используйте Let's Encrypt
```

## Хранение данных

| Сервис | Данные | Путь в контейнере |
|--------|--------|-------------------|
| kanban-board | SQLite БД | /app/data/prod.db |
| fkandu | SQLite БД | /app/db/leads.db |
| pubg-bot | Данные | /app/data/ |
