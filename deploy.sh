#!/bin/bash
set -e

export PATH="/root/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
PUBG_DIR="${REPO_DIR}/pubg_moderator_bot"
PORTS_FILE="${REPO_DIR}/deploy/ports.env"
SYSTEMD_SRC="${REPO_DIR}/systemd"
SYSTEMD_DST="/etc/systemd/system"

SERVICES=(
  kanban
  fkandu-dashboard
  fkandu-api
  fkandu-bot
  pubg-api
  pubg-bot
)

if [ -f "$PORTS_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$PORTS_FILE"
  set +a
fi

install_systemd_units() {
  if [ ! -d "$SYSTEMD_SRC" ]; then
    echo "Каталог systemd/ не найден — пропуск установки unit-файлов"
    return
  fi

  local units_changed=false

  echo "Systemd: установка unit-файлов..."
  for unit_path in "${SYSTEMD_SRC}"/*.service; do
    [ -f "$unit_path" ] || continue
    unit_name=$(basename "$unit_path")
    dest="${SYSTEMD_DST}/${unit_name}"

    if [ ! -f "$dest" ] || ! cmp -s "$unit_path" "$dest"; then
      cp "$unit_path" "$dest"
      echo "  → ${unit_name}"
      units_changed=true
    fi
  done

  if [ "$units_changed" = true ]; then
    systemctl daemon-reload
  else
    echo "  unit-файлы актуальны"
  fi

  for service in "${SERVICES[@]}"; do
    if [ ! -f "${SYSTEMD_DST}/${service}.service" ]; then
      echo "  пропуск ${service}: unit-файл не найден"
      continue
    fi
    if ! systemctl is-enabled --quiet "$service" 2>/dev/null; then
      systemctl enable "$service"
      echo "  enable ${service}"
    fi
  done
}

restart_services() {
  echo "Перезапуск сервисов..."
  for service in "${SERVICES[@]}"; do
    if [ ! -f "${SYSTEMD_DST}/${service}.service" ]; then
      continue
    fi
    if systemctl is-active --quiet "$service" 2>/dev/null; then
      systemctl restart "$service"
    else
      systemctl start "$service"
      echo "  start ${service} (первый запуск)"
    fi
  done
}

reload_nginx() {
  if systemctl is-active --quiet nginx 2>/dev/null; then
    echo "Nginx: проверка и reload..."
    nginx -t
    systemctl reload nginx
    return
  fi
  echo "Nginx (systemd) не запущен — пропуск reload"
}

install_nginx_config() {
  local src="${REPO_DIR}/nginx/nginx-systemd.conf"
  local dest="/etc/nginx/nginx.conf"

  if [ ! -f "$src" ]; then
    echo "Nginx: nginx-systemd.conf не найден — пропуск"
    return
  fi

  if [ ! -f "$dest" ] || ! cmp -s "$src" "$dest"; then
    echo "Nginx: обновление ${dest}..."
    cp "$src" "$dest"
    nginx -t
    if systemctl is-active --quiet nginx 2>/dev/null; then
      systemctl reload nginx
    else
      systemctl enable nginx
      systemctl start nginx
    fi
  else
    echo "Nginx: конфиг актуален"
  fi
}

verify_pubg_api() {
  local port="${PORT_PUBG_API:-8080}"
  echo "Проверка pubg-api на :${port}..."

  if ! systemctl is-active --quiet pubg-api 2>/dev/null; then
    echo "ОШИБКА: pubg-api не запущен"
    journalctl -u pubg-api -n 30 --no-pager || true
    return 1
  fi

  if curl -sf "http://127.0.0.1:${port}/health" >/dev/null; then
    echo "  pubg-api OK (http://127.0.0.1:${port}/health)"
    return 0
  fi

  echo "ОШИБКА: pubg-api не отвечает на :${port}"
  journalctl -u pubg-api -n 30 --no-pager || true
  ss -tlnp | grep ":${port}" || echo "  порт ${port} не слушается"
  return 1
}

echo "=== Деплой всех сервисов ==="
echo ""

cd "$REPO_DIR"

echo "Pull изменений..."
git pull origin main
echo ""

install_systemd_units

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

## PUBG Bot + Dashboard
echo "PUBG: pip install + frontend build + migrations..."
cd "$PUBG_DIR"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  export VITE_DASHBOARD_API_KEY="${DASHBOARD_API_KEY:-}"
fi

pip3 install -q -r requirements.txt
alembic upgrade head

cd dashboard/frontend
npm ci --silent
npm run build
cd "$REPO_DIR"

echo ""
restart_services

install_nginx_config
reload_nginx
verify_pubg_api || true

echo ""
echo "=== Деплой завершен ==="
echo "Порты: fkandu :444/:445/:446 | pubg :447 (→:${PORT_PUBG_API:-8080}) | kanban :448 (→:${PORT_KANBAN:-3002})"
systemctl status kanban fkandu-dashboard fkandu-api fkandu-bot pubg-api pubg-bot --no-pager
