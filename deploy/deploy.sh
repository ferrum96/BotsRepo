#!/bin/bash
set -e

export PATH="/root/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "${DEPLOY_DIR}/.." && pwd)"
PUBG_DIR="${REPO_DIR}/pubg_moderator_bot"
PORTS_FILE="${DEPLOY_DIR}/ports.env"
SYSTEMD_SRC="${DEPLOY_DIR}/systemd"
NGINX_CONF="${DEPLOY_DIR}/nginx/nginx-systemd.conf"
SYSTEMD_DST="/etc/systemd/system"

SERVICES=(
  kanban
  fkandu-dashboard
  fkandu-api
  fkandu-bot
  pubg-api
  pubg-bot
  deploy-webhook
)

NEEDS_KANBAN=false
NEEDS_FKANDU_DASHBOARD=false
NEEDS_FKANDU_API=false
NEEDS_FKANDU_BOT=false
NEEDS_PUBG_API=false
NEEDS_PUBG_BOT=false
NEEDS_PUBG_FRONTEND_BUILD=false
NEEDS_PUBG_PIP=false
NEEDS_PUBG_MIGRATE=false
RESTART_SERVICES=()
CHANGED_FILES=""

if [ -f "$PORTS_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$PORTS_FILE"
  set +a
fi

mark_all_services() {
  NEEDS_KANBAN=true
  NEEDS_FKANDU_DASHBOARD=true
  NEEDS_FKANDU_API=true
  NEEDS_FKANDU_BOT=true
  NEEDS_PUBG_API=true
  NEEDS_PUBG_BOT=true
  NEEDS_PUBG_FRONTEND_BUILD=true
  NEEDS_PUBG_PIP=true
  NEEDS_PUBG_MIGRATE=true
}

mark_service_for_restart() {
  local service="$1"
  local already=false
  for existing in "${RESTART_SERVICES[@]}"; do
    if [ "$existing" = "$service" ]; then
      already=true
      break
    fi
  done
  if [ "$already" = false ]; then
    RESTART_SERVICES+=("$service")
  fi
}

mark_services_from_file() {
  local file="$1"

  case "$file" in
    kanban_board/*)
      NEEDS_KANBAN=true
      mark_service_for_restart kanban
      ;;
    fkandu_manager_bot/dashboard/frontend/*)
      NEEDS_FKANDU_DASHBOARD=true
      mark_service_for_restart fkandu-dashboard
      ;;
    fkandu_manager_bot/dashboard/backend/*)
      NEEDS_FKANDU_API=true
      mark_service_for_restart fkandu-api
      ;;
    fkandu_manager_bot/bot/*)
      NEEDS_FKANDU_BOT=true
      mark_service_for_restart fkandu-bot
      ;;
    fkandu_manager_bot/requirements.txt)
      NEEDS_FKANDU_BOT=true
      mark_service_for_restart fkandu-bot
      ;;
    pubg_moderator_bot/dashboard/frontend/*)
      NEEDS_PUBG_API=true
      NEEDS_PUBG_FRONTEND_BUILD=true
      mark_service_for_restart pubg-api
      ;;
    pubg_moderator_bot/dashboard/backend/*)
      NEEDS_PUBG_API=true
      NEEDS_PUBG_PIP=true
      mark_service_for_restart pubg-api
      ;;
    pubg_moderator_bot/bot/*)
      NEEDS_PUBG_API=true
      NEEDS_PUBG_BOT=true
      NEEDS_PUBG_PIP=true
      mark_service_for_restart pubg-api
      mark_service_for_restart pubg-bot
      ;;
    pubg_moderator_bot/requirements.txt)
      NEEDS_PUBG_API=true
      NEEDS_PUBG_BOT=true
      NEEDS_PUBG_PIP=true
      mark_service_for_restart pubg-api
      mark_service_for_restart pubg-bot
      ;;
    pubg_moderator_bot/alembic/*|pubg_moderator_bot/alembic.ini)
      NEEDS_PUBG_API=true
      NEEDS_PUBG_BOT=true
      NEEDS_PUBG_PIP=true
      NEEDS_PUBG_MIGRATE=true
      mark_service_for_restart pubg-api
      mark_service_for_restart pubg-bot
      ;;
    deploy/systemd/kanban.service)
      NEEDS_KANBAN=true
      mark_service_for_restart kanban
      ;;
    deploy/systemd/fkandu-dashboard.service)
      NEEDS_FKANDU_DASHBOARD=true
      mark_service_for_restart fkandu-dashboard
      ;;
    deploy/systemd/fkandu-api.service)
      NEEDS_FKANDU_API=true
      mark_service_for_restart fkandu-api
      ;;
    deploy/systemd/fkandu-bot.service)
      NEEDS_FKANDU_BOT=true
      mark_service_for_restart fkandu-bot
      ;;
    deploy/systemd/pubg-api.service)
      NEEDS_PUBG_API=true
      mark_service_for_restart pubg-api
      ;;
    deploy/systemd/pubg-bot.service)
      NEEDS_PUBG_BOT=true
      mark_service_for_restart pubg-bot
      ;;
    deploy/systemd/deploy-webhook.service|deploy/webhook.py|deploy/deploy.sh|deploy/webhook.env|deploy/webhook.env.example)
      mark_service_for_restart deploy-webhook
      ;;
    deploy/nginx/*)
      :
      ;;
    deploy/ports.env)
      for service in "${SERVICES[@]}"; do
        mark_service_for_restart "$service"
      done
      ;;
  esac
}

detect_changed_services() {
  if [ "${DEPLOY_ALL:-0}" = "1" ]; then
    echo "DEPLOY_ALL=1 — полный деплой всех сервисов"
    mark_all_services
    for service in "${SERVICES[@]}"; do
      mark_service_for_restart "$service"
    done
    return
  fi

  if [ -z "$CHANGED_FILES" ]; then
    return
  fi

  while IFS= read -r file; do
    [ -n "$file" ] || continue
    mark_services_from_file "$file"
  done <<< "$CHANGED_FILES"
}

install_systemd_units() {
  if [ ! -d "$SYSTEMD_SRC" ]; then
    echo "Каталог deploy/systemd/ не найден — пропуск установки unit-файлов"
    return
  fi

  local units_changed=false

  echo "Systemd: установка unit-файлов..."
  for unit_path in "${SYSTEMD_SRC}"/*.service; do
    [ -f "$unit_path" ] || continue
    unit_name=$(basename "$unit_path")
    service_name="${unit_name%.service}"
    dest="${SYSTEMD_DST}/${unit_name}"

    if [ ! -f "$dest" ] || ! cmp -s "$unit_path" "$dest"; then
      cp "$unit_path" "$dest"
      echo "  → ${unit_name}"
      units_changed=true
      mark_service_for_restart "$service_name"
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
  if [ ${#RESTART_SERVICES[@]} -eq 0 ]; then
    echo "Перезапуск сервисов: не требуется (изменений в коде нет)"
    return
  fi

  echo "Перезапуск сервисов: ${RESTART_SERVICES[*]}"
  for service in "${RESTART_SERVICES[@]}"; do
    if [ ! -f "${SYSTEMD_DST}/${service}.service" ]; then
      echo "  пропуск ${service}: unit-файл не найден"
      continue
    fi
    if systemctl is-active --quiet "$service" 2>/dev/null; then
      systemctl restart "$service"
      echo "  restart ${service}"
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
  local src="${NGINX_CONF}"
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

ensure_ufw_deploy_webhook_port() {
  local port="${PORT_DEPLOY_WEBHOOK_PUBLIC:-450}"

  if ! command -v ufw >/dev/null 2>&1; then
    echo "UFW: не найден — пропуск allow ${port}/tcp"
    return
  fi
  if ! ufw status 2>/dev/null | grep -qi "Status: active"; then
    echo "UFW: не активен — пропуск allow ${port}/tcp"
    return
  fi
  if ufw status | grep -E "^${port}(/tcp)?[[:space:]]+ALLOW" >/dev/null 2>&1; then
    echo "UFW: ${port}/tcp уже открыт (deploy webhook)"
    return
  fi

  echo "UFW: открываю ${port}/tcp для deploy webhook"
  ufw allow "${port}/tcp"
}

ensure_caddy_deploy_webhook_route() {
  local routes_dir="/etc/caddy/routes"
  local caddyfile="/etc/caddy/Caddyfile"
  local route_file="${routes_dir}/deploy-webhook.caddy"
  local port="${PORT_DEPLOY_WEBHOOK:-9000}"
  local path="${DEPLOY_WEBHOOK_PATH:-/hooks/deploy}"
  local expected="reverse_proxy 127.0.0.1:${port}"

  if ! command -v caddy >/dev/null 2>&1; then
    echo "Caddy: не найден — пропуск deploy-webhook route"
    return
  fi
  if [ ! -f "${caddyfile}" ]; then
    echo "Caddy: ${caddyfile} нет — пропуск deploy-webhook route"
    return
  fi
  if ! systemctl is-active --quiet caddy 2>/dev/null; then
    echo "Caddy: не запущен — пропуск deploy-webhook route"
    return
  fi

  if [ -f "${route_file}" ] && grep -Fq "${expected}" "${route_file}"; then
    echo "Caddy: deploy-webhook route актуален (${path} → 127.0.0.1:${port})"
    return
  fi

  echo "Caddy: добавляю deploy-webhook route ${path} → 127.0.0.1:${port}"
  mkdir -p "${routes_dir}"
  cat > "${route_file}" <<EOF
# deploy-webhook
handle_path ${path}* {
    reverse_proxy 127.0.0.1:${port}
}
EOF
  caddy validate --config "${caddyfile}"
  systemctl reload caddy
  echo "Caddy: deploy-webhook route готов"
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

should_restart_pubg_api() {
  local service
  for service in "${RESTART_SERVICES[@]}"; do
    if [ "$service" = "pubg-api" ]; then
      return 0
    fi
  done
  return 1
}

echo "=== Деплой (selective) ==="
echo ""

cd "$REPO_DIR"

OLD_HEAD="$(git rev-parse HEAD)"
echo "Pull изменений..."
git pull origin main
NEW_HEAD="$(git rev-parse HEAD)"

if [ "$OLD_HEAD" != "$NEW_HEAD" ]; then
  CHANGED_FILES="$(git diff --name-only "$OLD_HEAD" "$NEW_HEAD")"
  echo "Изменено файлов: $(echo "$CHANGED_FILES" | sed '/^$/d' | wc -l | tr -d ' ')"
else
  echo "Новых коммитов нет"
fi
echo ""

detect_changed_services
install_systemd_units

if [ "$NEEDS_KANBAN" = true ]; then
  echo "Kanban Board: npm ci + build..."
  cd kanban_board
  npm ci --silent
  npm run build
  cd "$REPO_DIR"
else
  echo "Kanban Board: без изменений — пропуск сборки"
fi

if [ "$NEEDS_FKANDU_DASHBOARD" = true ]; then
  echo "Fkandu Dashboard: npm ci + build..."
  cd fkandu_manager_bot/dashboard/frontend
  npm ci --silent
  npm run build
  cp -r .next/static .next/standalone/.next/static
  cp -r public .next/standalone/public
  cd "$REPO_DIR"
else
  echo "Fkandu Dashboard: без изменений — пропуск сборки"
fi

if [ "$NEEDS_FKANDU_API" = true ]; then
  echo "Fkandu API: pip install..."
  cd fkandu_manager_bot/dashboard/backend
  pip3 install -q -r requirements.txt
  cd "$REPO_DIR"
else
  echo "Fkandu API: без изменений — пропуск pip install"
fi

if [ "$NEEDS_FKANDU_BOT" = true ]; then
  echo "Fkandu Bot: pip install..."
  cd fkandu_manager_bot
  pip3 install -q -r requirements.txt
  cd "$REPO_DIR"
else
  echo "Fkandu Bot: без изменений — пропуск pip install"
fi

if [ "$NEEDS_PUBG_API" = true ] || [ "$NEEDS_PUBG_BOT" = true ]; then
  echo "PUBG: обновление..."
  cd "$PUBG_DIR"

  if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
    export VITE_DASHBOARD_API_KEY="${DASHBOARD_API_KEY:-}"
  fi

  if [ "$NEEDS_PUBG_PIP" = true ] || [ "$NEEDS_PUBG_API" = true ] || [ "$NEEDS_PUBG_BOT" = true ]; then
    pip3 install -q -r requirements.txt
  fi

  if [ "$NEEDS_PUBG_MIGRATE" = true ]; then
    alembic upgrade head
  fi

  if [ "$NEEDS_PUBG_FRONTEND_BUILD" = true ]; then
    cd dashboard/frontend
    npm ci --silent
    npm run build
    cd "$PUBG_DIR"
  fi

  cd "$REPO_DIR"
else
  echo "PUBG: без изменений — пропуск сборки"
fi

echo ""
restart_services

install_nginx_config
reload_nginx
ensure_ufw_deploy_webhook_port
ensure_caddy_deploy_webhook_route

if should_restart_pubg_api; then
  verify_pubg_api || true
else
  echo "pubg-api не перезапускался — пропуск health-check"
fi

echo ""
echo "=== Деплой завершен ==="
echo "Порты: fkandu :444/:445/:446 | pubg :447 (→:${PORT_PUBG_API:-8080}) | kanban :448 (→:${PORT_KANBAN:-3002}) | webhook :${PORT_DEPLOY_WEBHOOK_PUBLIC:-450} (→:${PORT_DEPLOY_WEBHOOK:-9000})"
echo "GitHub webhook (HTTP): http://IP:${PORT_DEPLOY_WEBHOOK_PUBLIC:-450}/  | HTTPS: https://GATEWAY${DEPLOY_WEBHOOK_PATH:-/hooks/deploy}"
if [ ${#RESTART_SERVICES[@]} -gt 0 ]; then
  systemctl status "${RESTART_SERVICES[@]}" --no-pager
else
  echo "Сервисы не перезапускались"
fi
