#!/bin/bash
set -e

echo "=== Установка fkandu_manager_bot ==="

# Nginx
echo "[1/3] Nginx..."
apt-get install -y nginx -qq
cp deploy/nginx.conf /etc/nginx/sites-available/fkandu
ln -sf /etc/nginx/sites-available/fkandu /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Сервисы
echo "[2/3] Сервисы..."
cp deploy/fkandu-bot.service /etc/systemd/system/
cp deploy/fkandu-dashboard.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable fkandu-bot fkandu-dashboard
systemctl start fkandu-bot fkandu-dashboard

echo "[3/3] SSL..."
apt-get install -y certbot python3-certbot-nginx -qq
certbot --nginx -d crm.fkandu.ru --non-interactive --agree-tos --email admin@fkandu.ru || echo "Настройте DNS A-записи и запустите: certbot --nginx -d crm.fkandu.ru"

echo ""
echo "=== Готово! ==="
echo "  https://crm.fkandu.ru"
echo "  journalctl -u fkandu-bot -f"
echo "  journalctl -u fkandu-dashboard -f"
