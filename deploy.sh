#!/bin/bash

echo "=== Деплой всех сервисов ==="
echo ""

# Проверка наличия .env файлов
echo "Проверка .env файлов..."
for dir in fkandu_manager_bot pubg_moderator_bot; do
    if [ ! -f "$dir/.env" ]; then
        echo "❌ Отсутствует $dir/.env"
        echo "   Скопируйте $dir/.env.example в $dir/.env и заполните"
        exit 1
    fi
done
echo "✅ Все .env файлы найдены"
echo ""

# Создание директорий для данных
echo "Создание директорий для данных..."
mkdir -p kanban_board/data
mkdir -p fkandu_manager_bot/db
mkdir -p pubg_moderator_bot/data
mkdir -p nginx/certs
echo "✅ Директории созданы"
echo ""

# Сборка и запуск
echo "Сборка и запуск контейнеров..."
docker-compose up -d --build
echo ""

# Проверка статуса
echo "Проверка статуса контейнеров..."
docker-compose ps
echo ""

echo "=== Деплой завершен ==="
echo ""
echo "Доступные сервисы:"
echo "  - Kanban Board:    http://localhost (или http://kanban.yourdomain.com)"
echo "  - FKandu Dashboard: http://dashboard.yourdomain.com:8000"
echo "  - FKandu Files:     http://files.yourdomain.com:8088"
echo ""
echo "Для просмотра логов: docker-compose logs -f"
echo "Для остановки: docker-compose down"
