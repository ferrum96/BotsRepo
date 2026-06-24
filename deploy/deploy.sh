#!/bin/bash
set -e

DOMAIN="crm.fkandu.ru"
PROJECT_DIR="/root/fkandu_manager_bot"

echo "=== Деплой fkandu_manager_bot ==="

# 1. Установка зависимостей
echo "[1/5] Зависимости..."
cd "$PROJECT_DIR"
pip3 install -r requirements.txt -q

# 2. Nginx
echo "[2/5] Nginx..."
apt-get install -y nginx -qq
cp deploy/nginx.conf /etc/nginx/sites-available/fkandu
ln -sf /etc/nginx/sites-available/fkandu /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# 3. SSL (Let's Encrypt)
echo "[3/5] SSL..."
apt-get install -y certbot python3-certbot-nginx -qq
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@fkandu.ru || true

# 4. Systemd сервисы
echo "[4/5] Сервисы..."
cp deploy/fkandu-bot.service /etc/systemd/system/
cp deploy/fkandu-dashboard.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable fkandu-bot fkandu-dashboard
systemctl restart fkandu-bot fkandu-dashboard

# 5. Проверка
echo "[5/5] Проверка..."
sleep 2
BOT_STATUS=$(systemctl is-active fkandu-bot)
API_STATUS=$(systemctl is-active fkandu-dashboard)

echo ""
echo "=== Готово! ==="
echo ""
echo "  Бот:        $BOT_STATUS"
echo "  Дашборд:    $API_STATUS"
echo "  URL:        https://$DOMAIN"
echo "  Логи бота:  journalctl -u fkandu-bot -f"
echo "  Логи API:   journalctl -u fkandu-dashboard -f"
