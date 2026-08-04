#!/bin/bash
set -e

export PATH="/root/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "${DEPLOY_DIR}/.." && pwd)"
BB_CLAN_DIR="${REPO_DIR}/bb_clan_moderator_bot"
PORTS_FILE="${DEPLOY_DIR}/ports.env"
DOMAINS_ENV_FILE="${DEPLOY_DIR}/domains.env"
CADDY_SETUP_SCRIPT="${DEPLOY_DIR}/duckdns-caddy-setup.sh"
CADDY_ROUTE_SCRIPT="${DEPLOY_DIR}/caddy-route.sh"
SYSTEMD_SRC="${DEPLOY_DIR}/systemd"
NGINX_CONF="${DEPLOY_DIR}/nginx/nginx-systemd.conf"
SYSTEMD_DST="/etc/systemd/system"
CADDYFILE_PATH="/etc/caddy/Caddyfile"
CADDY_ROUTES_DIR="/etc/caddy/routes"
CADDY_ROUTE_HELPER="/usr/local/bin/caddy-route"

# Active production services. FKandu units live in systemd/disabled/ (not installed).
SERVICES=(
  kanban
  bb-clan-api
  bb-clan-bot
  deploy-webhook
)

DISABLED_SERVICES=(
  fkandu-dashboard
  fkandu-api
  fkandu-bot
)

NEEDS_KANBAN=false
NEEDS_BB_CLAN_API=false
NEEDS_BB_CLAN_BOT=false
NEEDS_BB_CLAN_FRONTEND_BUILD=false
NEEDS_BB_CLAN_PIP=false
NEEDS_BB_CLAN_MIGRATE=false
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
  NEEDS_BB_CLAN_API=true
  NEEDS_BB_CLAN_BOT=true
  NEEDS_BB_CLAN_FRONTEND_BUILD=true
  NEEDS_BB_CLAN_PIP=true
  NEEDS_BB_CLAN_MIGRATE=true
}

# Read KEY=value from .env without bash `source` (safe for | @ spaces).
env_get() {
  local file="$1" key="$2" line val
  [ -f "$file" ] || return 0
  line="$(grep -E "^${key}=" "$file" | tail -1)" || true
  [ -n "$line" ] || return 0
  val="${line#*=}"
  val="${val#\"}"
  val="${val%\"}"
  val="${val#\'}"
  val="${val%\'}"
  printf '%s' "$val"
}

is_managed_service() {
  local service="$1" existing
  for existing in "${SERVICES[@]}"; do
    if [ "$existing" = "$service" ]; then
      return 0
    fi
  done
  return 1
}

mark_service_for_restart() {
  local service="$1"
  local already=false
  local existing

  if ! is_managed_service "$service"; then
    return
  fi

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
    fkandu_manager_bot/*|deploy/systemd/disabled/*)
      :
      ;;
    bb_clan_moderator_bot/dashboard/frontend/*)
      NEEDS_BB_CLAN_API=true
      NEEDS_BB_CLAN_FRONTEND_BUILD=true
      mark_service_for_restart bb-clan-api
      ;;
    bb_clan_moderator_bot/dashboard/backend/*)
      NEEDS_BB_CLAN_API=true
      NEEDS_BB_CLAN_PIP=true
      mark_service_for_restart bb-clan-api
      ;;
    bb_clan_moderator_bot/bot/*)
      NEEDS_BB_CLAN_API=true
      NEEDS_BB_CLAN_BOT=true
      NEEDS_BB_CLAN_PIP=true
      mark_service_for_restart bb-clan-api
      mark_service_for_restart bb-clan-bot
      ;;
    bb_clan_moderator_bot/requirements.txt)
      NEEDS_BB_CLAN_API=true
      NEEDS_BB_CLAN_BOT=true
      NEEDS_BB_CLAN_PIP=true
      mark_service_for_restart bb-clan-api
      mark_service_for_restart bb-clan-bot
      ;;
    bb_clan_moderator_bot/alembic/*|bb_clan_moderator_bot/alembic.ini)
      NEEDS_BB_CLAN_API=true
      NEEDS_BB_CLAN_BOT=true
      NEEDS_BB_CLAN_PIP=true
      NEEDS_BB_CLAN_MIGRATE=true
      mark_service_for_restart bb-clan-api
      mark_service_for_restart bb-clan-bot
      ;;
    deploy/systemd/kanban.service)
      NEEDS_KANBAN=true
      mark_service_for_restart kanban
      ;;
    deploy/systemd/bb-clan-api.service)
      NEEDS_BB_CLAN_API=true
      mark_service_for_restart bb-clan-api
      ;;
    deploy/systemd/bb-clan-bot.service)
      NEEDS_BB_CLAN_BOT=true
      mark_service_for_restart bb-clan-bot
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

ensure_python_pip() {
  if python3 -m pip --version >/dev/null 2>&1; then
    return 0
  fi
  echo "Python: pip не найден — устанавливаю..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-pip python3-venv
  else
    echo "Python: apt-get нет — установи python3-pip вручную"
    return 1
  fi
}

ensure_nodejs() {
  local major=""
  local node_bin=""

  if command -v node >/dev/null 2>&1; then
    major="$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
    if [ -n "$major" ] && [ "$major" -ge 18 ] 2>/dev/null; then
      node_bin="$(command -v node)"
      if [ ! -x /usr/bin/node ] && [ -n "$node_bin" ]; then
        ln -sf "$node_bin" /usr/bin/node
        echo "Node: symlink ${node_bin} → /usr/bin/node"
      fi
      return 0
    fi
    echo "Node: версия $(node -v) слишком старая — ставлю Node 20"
  else
    echo "Node: не найден — ставлю Node 20"
  fi

  if ! command -v apt-get >/dev/null 2>&1; then
    echo "Node: apt-get нет — установи Node.js 20+ вручную"
    return 1
  fi

  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates curl gnupg
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs

  if [ ! -x /usr/bin/node ]; then
    node_bin="$(command -v node || true)"
    if [ -n "$node_bin" ]; then
      ln -sf "$node_bin" /usr/bin/node
    fi
  fi
  echo "Node: $(node -v) / npm $(npm -v)"
}

# First boot / empty host: selective git-diff skips builds — force missing deps/artifacts.
bootstrap_missing_artifacts() {
  echo "Bootstrap: проверка runtime и артефактов..."

  ensure_python_pip || true
  ensure_nodejs || true

  if [ ! -f "${REPO_DIR}/kanban_board/dist/server/index.js" ]; then
    echo "Bootstrap: kanban dist отсутствует — сборка"
    NEEDS_KANBAN=true
    mark_service_for_restart kanban
  fi

  if ! python3 -c "import uvicorn, telegram, fastapi, alembic" >/dev/null 2>&1; then
    echo "Bootstrap: python deps bb-clan отсутствуют — pip install"
    NEEDS_BB_CLAN_API=true
    NEEDS_BB_CLAN_BOT=true
    NEEDS_BB_CLAN_PIP=true
    NEEDS_BB_CLAN_MIGRATE=true
    mark_service_for_restart bb-clan-api
    mark_service_for_restart bb-clan-bot
  fi

  if [ ! -f "${BB_CLAN_DIR}/dashboard/frontend/dist/index.html" ]; then
    echo "Bootstrap: bb-clan frontend dist отсутствует — сборка SPA"
    NEEDS_BB_CLAN_API=true
    NEEDS_BB_CLAN_FRONTEND_BUILD=true
    mark_service_for_restart bb-clan-api
  fi

  # Crash-loop / first boot left services down even when artifacts already exist.
  local service
  for service in "${SERVICES[@]}"; do
    if [ -f "${SYSTEMD_DST}/${service}.service" ] \
      && ! systemctl is-active --quiet "$service" 2>/dev/null; then
      echo "Bootstrap: ${service} не активен — рестарт"
      mark_service_for_restart "$service"
    fi
  done
}

disable_unused_services() {
  local service
  echo "Systemd: отключение неиспользуемых сервисов..."
  for service in "${DISABLED_SERVICES[@]}"; do
    if systemctl cat "${service}.service" >/dev/null 2>&1; then
      if systemctl is-active --quiet "$service" 2>/dev/null || systemctl is-enabled --quiet "$service" 2>/dev/null; then
        systemctl disable --now "$service" 2>/dev/null || systemctl stop "$service" 2>/dev/null || true
        echo "  disable --now ${service}"
      else
        echo "  ${service}: уже остановлен"
      fi
    fi
  done
}

install_systemd_units() {
  if [ ! -d "$SYSTEMD_SRC" ]; then
    echo "Каталог deploy/systemd/ не найден — пропуск установки unit-файлов"
    return
  fi

  local units_changed=false
  local unit_path unit_name service_name dest

  echo "Systemd: установка unit-файлов..."
  for unit_path in "${SYSTEMD_SRC}"/*.service; do
    [ -f "$unit_path" ] || continue
    unit_name=$(basename "$unit_path")
    service_name="${unit_name%.service}"
    dest="${SYSTEMD_DST}/${unit_name}"

    if ! is_managed_service "$service_name"; then
      echo "  пропуск ${unit_name}: не в SERVICES"
      continue
    fi

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

ensure_nginx() {
  local src="${NGINX_CONF}"
  local dest="/etc/nginx/nginx.conf"
  local config_changed=false

  if [ ! -f "$src" ]; then
    echo "Nginx: ${src} не найден — пропуск"
    return 1
  fi

  if ! command -v nginx >/dev/null 2>&1; then
    echo "Nginx: пакет не найден — устанавливаю..."
    if command -v apt-get >/dev/null 2>&1; then
      apt-get update -qq
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx
    else
      echo "Nginx: apt-get нет — установи nginx вручную и перезапусти deploy"
      return 1
    fi
  fi

  if [ ! -f "$dest" ] || ! cmp -s "$src" "$dest"; then
    echo "Nginx: установка конфига → ${dest}"
    cp "$src" "$dest"
    config_changed=true
  else
    echo "Nginx: конфиг актуален"
  fi

  nginx -t

  if ! systemctl is-enabled --quiet nginx 2>/dev/null; then
    systemctl enable nginx
    echo "Nginx: enable"
  fi

  if systemctl is-active --quiet nginx 2>/dev/null; then
    if [ "$config_changed" = true ]; then
      systemctl reload nginx
      echo "Nginx: reload"
    fi
  else
    systemctl start nginx
    echo "Nginx: start (первый запуск / был остановлен)"
  fi
}

ufw_allow_tcp() {
  local port="$1"
  local note="${2:-}"

  if ! command -v ufw >/dev/null 2>&1; then
    echo "UFW: не найден — пропуск allow ${port}/tcp"
    return
  fi
  if ! ufw status 2>/dev/null | grep -qi "Status: active"; then
    echo "UFW: не активен — пропуск allow ${port}/tcp${note:+ ($note)}"
    return
  fi
  if ufw status | grep -E "^${port}(/tcp)?[[:space:]]+ALLOW" >/dev/null 2>&1; then
    echo "UFW: ${port}/tcp уже открыт${note:+ ($note)}"
    return
  fi

  echo "UFW: открываю ${port}/tcp${note:+ ($note)}"
  ufw allow "${port}/tcp"
}

ensure_ufw_ports() {
  ufw_allow_tcp "${PORT_DEPLOY_WEBHOOK_PUBLIC:-450}" "deploy webhook"
  ufw_allow_tcp 80 "http / ACME"
  ufw_allow_tcp 443 "https"
}

install_caddy_package() {
  if command -v caddy >/dev/null 2>&1; then
    return 0
  fi

  echo "Caddy: пакет не найден — устанавливаю..."
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "Caddy: apt-get нет — установи caddy вручную"
    return 1
  fi

  apt-get update -qq
  if DEBIAN_FRONTEND=noninteractive apt-get install -y -qq caddy; then
    return 0
  fi

  echo "Caddy: нет в apt — добавляю официальный репозиторий..."
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https
  mkdir -p /usr/share/keyrings /etc/apt/sources.list.d
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq caddy
}

install_caddy_route_helper() {
  if [ ! -f "$CADDY_ROUTE_SCRIPT" ]; then
    echo "Caddy: ${CADDY_ROUTE_SCRIPT} не найден — пропуск caddy-route"
    return
  fi
  if [ ! -f "$CADDY_ROUTE_HELPER" ] || ! cmp -s "$CADDY_ROUTE_SCRIPT" "$CADDY_ROUTE_HELPER"; then
    cp "$CADDY_ROUTE_SCRIPT" "$CADDY_ROUTE_HELPER"
    chmod +x "$CADDY_ROUTE_HELPER"
    echo "Caddy: установлен ${CADDY_ROUTE_HELPER}"
  fi
}

# Returns 0 if file was written/changed.
write_caddy_handle_path_route() {
  local name="$1"
  local path_prefix="$2"
  local upstream="$3"
  local route_file="${CADDY_ROUTES_DIR}/${name}.caddy"
  local expected="reverse_proxy ${upstream}"

  mkdir -p "$CADDY_ROUTES_DIR"
  if [ -f "$route_file" ] \
    && grep -Fq "$expected" "$route_file" \
    && grep -Fq "handle_path ${path_prefix}" "$route_file"; then
    return 1
  fi

  cat > "$route_file" <<EOF
# ${name}
handle_path ${path_prefix}* {
    reverse_proxy ${upstream}
}
EOF
  echo "Caddy: route ${name} (${path_prefix}* → ${upstream})"
  return 0
}

should_add_caddy_gateway_path() {
  local service_domain="$1"
  local gateway_domain="$2"
  if [ -z "$service_domain" ] || [ "$service_domain" = "$gateway_domain" ]; then
    return 0
  fi
  return 1
}

run_caddy_full_setup() {
  local domains_env="$1"
  local email
  local -a args

  if [ ! -f "$CADDY_SETUP_SCRIPT" ]; then
    echo "Caddy: ${CADDY_SETUP_SCRIPT} не найден"
    return 1
  fi

  email="$(env_get "$domains_env" ACME_EMAIL)"
  args=(--domains-env "$domains_env" --no-firewall)
  if [ -n "$email" ]; then
    args+=(--email "$email")
  fi

  echo "Caddy: полный setup через duckdns-caddy-setup.sh..."
  (
    cd "$REPO_DIR"
    bash "$CADDY_SETUP_SCRIPT" "${args[@]}"
  )
  warn_caddy_dns_mismatch "$(env_get "$domains_env" GATEWAY_DOMAIN)"
}

ensure_caddy_running() {
  if ! systemctl is-enabled --quiet caddy 2>/dev/null; then
    systemctl enable caddy
    echo "Caddy: enable"
  fi
  if systemctl is-active --quiet caddy 2>/dev/null; then
    return 0
  fi
  systemctl start caddy
  echo "Caddy: start"
  sleep 1
  if ! systemctl is-active --quiet caddy 2>/dev/null; then
    echo "Caddy: ОШИБКА — не запустился"
    journalctl -u caddy -n 30 --no-pager || true
    return 1
  fi
}

warn_caddy_dns_mismatch() {
  local gateway_domain="$1"
  local server_ip gateway_ip

  [ -n "$gateway_domain" ] || return 0

  server_ip="$(curl -4 -fsS --max-time 5 ifconfig.me 2>/dev/null \
    || curl -4 -fsS --max-time 5 icanhazip.com 2>/dev/null \
    || true)"
  server_ip="$(echo "$server_ip" | tr -d '[:space:]')"
  gateway_ip="$(dig +short "$gateway_domain" A 2>/dev/null | tail -n1 || true)"

  echo "Caddy: server IP=${server_ip:-?}  ${gateway_domain}=${gateway_ip:-?}"
  if [ -n "$server_ip" ] && [ -n "$gateway_ip" ] && [ "$server_ip" != "$gateway_ip" ]; then
    echo "Caddy: WARNING — DuckDNS указывает на ${gateway_ip}, а этот VPS ${server_ip}"
    echo "Caddy: обнови A-запись ${gateway_domain} → ${server_ip}"
  fi

  if ss -tlnp 2>/dev/null | grep -qE ':443 '; then
    echo "Caddy: слушает :443 локально"
  else
    echo "Caddy: WARNING — :443 не слушается (systemctl status caddy / journalctl -u caddy)"
  fi
}

ensure_caddy() {
  local routes_changed=false
  local gateway_domain=""
  local service_domain_kanban=""
  local service_domain_bb_clan=""
  local webhook_path="${DEPLOY_WEBHOOK_PATH:-/hooks/deploy}"
  local webhook_upstream="127.0.0.1:${PORT_DEPLOY_WEBHOOK:-9000}"
  local kanban_upstream="127.0.0.1:${PORT_KANBAN:-3002}"
  local bb_clan_upstream="127.0.0.1:$(bb_clan_api_port)"

  if [ "${SKIP_CADDY:-0}" = "1" ]; then
    echo "Caddy: SKIP_CADDY=1 — пропуск"
    return 0
  fi

  if ! install_caddy_package; then
    return 1
  fi
  install_caddy_route_helper

  if [ -f "$DOMAINS_ENV_FILE" ]; then
    # shellcheck disable=SC1090
    set -a
    # shellcheck disable=SC1090
    source "$DOMAINS_ENV_FILE"
    set +a
    gateway_domain="${GATEWAY_DOMAIN:-}"
    service_domain_kanban="${SERVICE_DOMAIN_KANBAN:-}"
    service_domain_bb_clan="${SERVICE_DOMAIN_BB_CLAN:-${SERVICE_DOMAIN_PUBG:-}}"
  fi

  if [ ! -f "$CADDYFILE_PATH" ]; then
    if [ ! -f "$DOMAINS_ENV_FILE" ] || [ -z "$gateway_domain" ]; then
      echo "Caddy: нет ${CADDYFILE_PATH} и нет GATEWAY_DOMAIN в deploy/domains.env — пропуск HTTPS"
      echo "Caddy: создай deploy/domains.env (из domains.env.example) и перезапусти deploy"
      return 0
    fi
    run_caddy_full_setup "$DOMAINS_ENV_FILE"
    return 0
  fi

  if [ "${CADDY_SETUP:-0}" = "1" ]; then
    if [ ! -f "$DOMAINS_ENV_FILE" ] || [ -z "$gateway_domain" ]; then
      echo "Caddy: CADDY_SETUP=1, но deploy/domains.env / GATEWAY_DOMAIN пусты"
      return 1
    fi
    run_caddy_full_setup "$DOMAINS_ENV_FILE"
    return 0
  fi

  # Incremental: keep Caddyfile, sync managed path-routes.
  if write_caddy_handle_path_route "deploy-webhook" "$webhook_path" "$webhook_upstream"; then
    routes_changed=true
  else
    echo "Caddy: deploy-webhook route актуален (${webhook_path} → ${webhook_upstream})"
  fi

  if [ -n "$gateway_domain" ]; then
    # Kanban on gateway is Caddyfile default fallback (/), not /kanban route.
    # Drop stale path route from older deploys.
    if should_add_caddy_gateway_path "$service_domain_kanban" "$gateway_domain"; then
      if [ -f "${CADDY_ROUTES_DIR}/kanban.caddy" ]; then
        rm -f "${CADDY_ROUTES_DIR}/kanban.caddy"
        routes_changed=true
        echo "Caddy: удалён устаревший route /kanban (kanban = корень gateway)"
      fi
    fi
    if should_add_caddy_gateway_path "$service_domain_bb_clan" "$gateway_domain"; then
      if write_caddy_handle_path_route "bb-clan" "/bb-clan" "$bb_clan_upstream"; then
        routes_changed=true
      fi
    fi
  fi

  caddy validate --config "$CADDYFILE_PATH"
  ensure_caddy_running || return 1

  if [ "$routes_changed" = true ]; then
    systemctl reload caddy
    echo "Caddy: reload"
  else
    echo "Caddy: routes актуальны"
  fi

  warn_caddy_dns_mismatch "$gateway_domain"
}

bb_clan_api_port() {
  echo "${PORT_BB_CLAN_API:-${PORT_PUBG_API:-8080}}"
}

verify_bb_clan_api() {
  local port
  port="$(bb_clan_api_port)"
  echo "Проверка bb-clan-api на :${port}..."

  if ! systemctl is-active --quiet bb-clan-api 2>/dev/null; then
    echo "ОШИБКА: bb-clan-api не запущен"
    journalctl -u bb-clan-api -n 30 --no-pager || true
    return 1
  fi

  if curl -sf "http://127.0.0.1:${port}/health" >/dev/null; then
    echo "  bb-clan-api OK (http://127.0.0.1:${port}/health)"
    return 0
  fi

  echo "ОШИБКА: bb-clan-api не отвечает на :${port}"
  journalctl -u bb-clan-api -n 30 --no-pager || true
  ss -tlnp | grep ":${port}" || echo "  порт ${port} не слушается"
  return 1
}

should_restart_bb_clan_api() {
  local service
  for service in "${RESTART_SERVICES[@]}"; do
    if [ "$service" = "bb-clan-api" ]; then
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
disable_unused_services
install_systemd_units
bootstrap_missing_artifacts

if [ "$NEEDS_KANBAN" = true ]; then
  echo "Kanban Board: npm ci + build..."
  cd kanban_board
  npm ci --silent
  npm run build
  cd "$REPO_DIR"
else
  echo "Kanban Board: без изменений — пропуск сборки"
fi

if [ "$NEEDS_BB_CLAN_API" = true ] || [ "$NEEDS_BB_CLAN_BOT" = true ]; then
  echo "BB Clan: обновление..."
  cd "$BB_CLAN_DIR"

  export VITE_DASHBOARD_API_KEY="$(env_get .env DASHBOARD_API_KEY)"

  # SQLite needs parent dir; keep path in sync with systemd unit.
  mkdir -p "${BB_CLAN_DIR}/data" "${REPO_DIR}/kanban_board/data"
  export DATABASE_PATH="${BB_CLAN_DIR}/data/bot.db"

  if [ "$NEEDS_BB_CLAN_PIP" = true ] || [ "$NEEDS_BB_CLAN_API" = true ] || [ "$NEEDS_BB_CLAN_BOT" = true ]; then
    # Ubuntu 22.04+/PEP 668: allow system-wide install for systemd services.
    python3 -m pip install -q -r requirements.txt --break-system-packages 2>/dev/null \
      || python3 -m pip install -q -r requirements.txt
  fi

  if [ "$NEEDS_BB_CLAN_MIGRATE" = true ]; then
    echo "BB Clan: alembic upgrade head (DATABASE_PATH=${DATABASE_PATH})"
    alembic upgrade head
  fi

  if [ "$NEEDS_BB_CLAN_FRONTEND_BUILD" = true ]; then
    cd dashboard/frontend
    npm ci --silent
    npm run build
    cd "$BB_CLAN_DIR"
  fi

  cd "$REPO_DIR"
else
  echo "BB Clan: без изменений — пропуск сборки"
fi

echo ""
restart_services

ensure_nginx
ensure_ufw_ports
ensure_caddy

if should_restart_bb_clan_api; then
  verify_bb_clan_api || true
else
  echo "bb-clan-api не перезапускался — пропуск health-check"
fi

echo ""
echo "=== Деплой завершен ==="
echo "Порты: bb-clan :447 (→:$(bb_clan_api_port)) | kanban :448 (→:${PORT_KANBAN:-3002}) | webhook :${PORT_DEPLOY_WEBHOOK_PUBLIC:-450} (→:${PORT_DEPLOY_WEBHOOK:-9000})"
echo "GitHub webhook (HTTP): http://IP:${PORT_DEPLOY_WEBHOOK_PUBLIC:-450}/  | HTTPS: https://GATEWAY${DEPLOY_WEBHOOK_PATH:-/hooks/deploy}"
echo "FKandu: отключён (unit-файлы в deploy/systemd/disabled/)"
if [ ${#RESTART_SERVICES[@]} -gt 0 ]; then
  systemctl status "${RESTART_SERVICES[@]}" --no-pager
else
  echo "Сервисы не перезапускались"
fi
