#!/bin/bash
set -e

export PATH="/root/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

echo "=== Деплой всех сервисов ==="
echo ""

# Переход в директорию проекта
cd /root/BotsRepo

# Pull последних изменений
echo "Pull изменений..."
git pull origin main
echo ""

# Установка зависимостей и сборка

## Kanban Board
echo "Kanban Board: npm ci + build..."
cd kanban_board
npm ci --silent
npm run build
cd ..

## Fkandu Dashboard
echo "Fkandu Dashboard: npm ci + build..."
cd fkandu_manager_bot/dashboard/frontend
npm ci --silent
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
cd ../../..

## Fkandu API
echo "Fkandu API: pip install..."
cd fkandu_manager_bot/dashboard/backend
pip3 install -q -r requirements.txt
cd ../../..

## Fkandu Bot
echo "Fkandu Bot: pip install..."
cd fkandu_manager_bot
pip3 install -q -r requirements.txt
cd ..

## PUBG Bot
echo "PUBG Bot: pip install..."
cd pubg_moderator_bot
pip3 install -q -r requirements.txt
cd ..

# Перезапуск сервисов
echo ""
echo "Перезапуск сервисов..."
systemctl restart kanban
systemctl restart fkandu-dashboard
systemctl restart fkandu-api
systemctl restart fkandu-bot
systemctl restart pubg-bot

echo ""
echo "=== Деплой завершен ==="
systemctl status kanban fkandu-dashboard fkandu-api fkandu-bot pubg-bot --no-pager
