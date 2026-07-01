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
mkdir -p fkandu_manager_bot/data
mkdir -p pubg_moderator_bot/data
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

# Получение IP сервера
SERVER_IP=$(hostname -I | awk '{print $1}')

echo "=== Деплой завершен ==="
echo ""
echo "Доступные сервисы:"
echo "  - Kanban Board:      http://${SERVER_IP}:3000"
echo "  - FKandu Bot Files:  http://${SERVER_IP}:3001"
echo "  - FKandu API:        http://${SERVER_IP}:3002"
echo "  - FKandu Dashboard:  http://${SERVER_IP}:3003"
echo ""
echo "Для просмотра логов: docker-compose logs -f"
echo "Для остановки: docker-compose down"
