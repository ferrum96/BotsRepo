#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  ./deploy/duckdns-dns01-caddy-setup.sh [options]

Required:
  --email EMAIL              ACME account email
  --duckdns-token TOKEN      DuckDNS API token (or env DuckDNS_Token)

Options:
  --domains-env FILE         Domains env file (default: deploy/domains.env)
  --skip-default-routes      Do not create default gateway path routes
  --single-upstream PORT     Single-app mode: proxy / to localhost:PORT
  --no-firewall              Skip ufw configuration
  --force-renew              Force renew certificates
  --help                     Show this help

Example:
  ./deploy/duckdns-dns01-caddy-setup.sh \
    --email ferrumsk96@gmail.com \
    --duckdns-token "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
USAGE
}

EMAIL=""
DUCKDNS_TOKEN="${DuckDNS_Token:-}"
DOMAINS_ENV_FILE="deploy/domains.env"
REPO_PORTS_FILE="deploy/ports.env"
SKIP_DEFAULT_ROUTES="0"
SINGLE_UPSTREAM=""
SKIP_FIREWALL="0"
FORCE_RENEW="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --email)
      EMAIL="${2:-}"
      shift 2
      ;;
    --duckdns-token)
      DUCKDNS_TOKEN="${2:-}"
      shift 2
      ;;
    --domains-env)
      DOMAINS_ENV_FILE="${2:-}"
      shift 2
      ;;
    --skip-default-routes)
      SKIP_DEFAULT_ROUTES="1"
      shift
      ;;
    --single-upstream)
      SINGLE_UPSTREAM="${2:-}"
      shift 2
      ;;
    --no-firewall)
      SKIP_FIREWALL="1"
      shift
      ;;
    --force-renew)
      FORCE_RENEW="1"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${EMAIL}" ]]; then
  echo "Error: --email is required" >&2
  exit 1
fi

if [[ -z "${DUCKDNS_TOKEN}" ]]; then
  echo "Error: --duckdns-token is required (or export DuckDNS_Token)" >&2
  exit 1
fi

if [[ -n "${SINGLE_UPSTREAM}" ]] && ! [[ "${SINGLE_UPSTREAM}" =~ ^[0-9]+$ ]]; then
  echo "Error: --single-upstream must be numeric" >&2
  exit 1
fi

run() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

sanitize_domain() {
  echo "$1" | tr '.-' '__'
}

add_unique_domain() {
  local candidate="$1"
  [[ -n "${candidate}" ]] || return 0
  local existing
  for existing in "${ALL_DOMAINS[@]:-}"; do
    if [[ "${existing}" == "${candidate}" ]]; then
      return 0
    fi
  done
  ALL_DOMAINS+=("${candidate}")
}

should_add_gateway_path() {
  local service_domain="$1"
  if [[ -z "${service_domain}" ]]; then
    return 0
  fi
  if [[ "${service_domain}" == "${GATEWAY_DOMAIN}" ]]; then
    return 0
  fi
  return 1
}

write_route() {
  # Strips path prefix before proxy (app expects routes at /).
  local name="$1"
  local path_prefix="$2"
  local upstream="$3"
  run tee "${ROUTES_DIR}/${name}.caddy" >/dev/null <<EOF
# ${name}
handle_path ${path_prefix}* {
    reverse_proxy ${upstream}
}
EOF
}

write_preserve_route() {
  # Keeps full path (app expects /api/..., /files/..., etc).
  local name="$1"
  local path_prefix="$2"
  local upstream="$3"
  run tee "${ROUTES_DIR}/${name}.caddy" >/dev/null <<EOF
# ${name}
handle ${path_prefix}* {
    reverse_proxy ${upstream}
}
EOF
}

write_next_dashboard_route() {
  # Next.js without basePath: HTML at /dashboard, assets at /_next/*.
  local name="$1"
  local path_prefix="$2"
  local upstream="$3"
  run tee "${ROUTES_DIR}/${name}.caddy" >/dev/null <<EOF
# ${name}
handle_path ${path_prefix}* {
    reverse_proxy ${upstream}
}
handle /_next* {
    reverse_proxy ${upstream}
}
handle /favicon.ico {
    reverse_proxy ${upstream}
}
EOF
}

append_domain_proxy_block() {
  local target_file="$1"
  local domain_name="$2"
  local upstream="$3"
  local cert_fullchain="$4"
  local cert_key="$5"
  if [[ -z "${domain_name}" || "${domain_name}" == "${GATEWAY_DOMAIN}" ]]; then
    return
  fi

  cat >> "${target_file}" <<EOF

${domain_name} {
    tls ${cert_fullchain} ${cert_key}
    encode gzip zstd

    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    reverse_proxy ${upstream}
}
EOF
}

# Default ports (fallbacks)
PORT_KANBAN=3002
PORT_FKANDU_DASHBOARD=3000
PORT_FKANDU_API=8000
PORT_FKANDU_BOT_FILES=8088
PORT_PUBG_API=8080
PORT_DEPLOY_WEBHOOK=9000
DEPLOY_WEBHOOK_PATH="/hooks/deploy"
PORT_DEPLOY_WEBHOOK_PUBLIC=450

# Optional domains from deploy/domains.env
GATEWAY_DOMAIN=""
SERVICE_DOMAIN_KANBAN=""
SERVICE_DOMAIN_FKANDU=""
SERVICE_DOMAIN_BB_CLAN=""
SERVICE_DOMAIN_FKANDU_DASHBOARD=""
SERVICE_DOMAIN_FKANDU_API=""
SERVICE_DOMAIN_FKANDU_FILES=""
SERVICE_DOMAIN_PUBG=""

if [[ -f "${REPO_PORTS_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${REPO_PORTS_FILE}"
fi

if [[ -f "${DOMAINS_ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${DOMAINS_ENV_FILE}"
fi

if [[ -z "${GATEWAY_DOMAIN}" ]]; then
  echo "Error: GATEWAY_DOMAIN is empty. Configure it in ${DOMAINS_ENV_FILE}" >&2
  exit 1
fi

EFFECTIVE_SERVICE_DOMAIN_FKANDU_DASHBOARD="${SERVICE_DOMAIN_FKANDU_DASHBOARD}"
if [[ -z "${EFFECTIVE_SERVICE_DOMAIN_FKANDU_DASHBOARD}" ]]; then
  EFFECTIVE_SERVICE_DOMAIN_FKANDU_DASHBOARD="${SERVICE_DOMAIN_FKANDU}"
fi

EFFECTIVE_SERVICE_DOMAIN_PUBG="${SERVICE_DOMAIN_PUBG}"
if [[ -z "${EFFECTIVE_SERVICE_DOMAIN_PUBG}" ]]; then
  EFFECTIVE_SERVICE_DOMAIN_PUBG="${SERVICE_DOMAIN_BB_CLAN}"
fi

ROUTES_DIR="/etc/caddy/routes"
CADDYFILE_PATH="/etc/caddy/Caddyfile"
ROUTE_HELPER_PATH="/usr/local/bin/caddy-route"
CERTS_BASE_DIR="/etc/caddy/certs"

echo "==> Installing packages"
run apt update
run apt install -y curl dnsutils ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https socat cron

install_caddy() {
  if run apt install -y caddy; then
    return 0
  fi
  run mkdir -p /usr/share/keyrings /etc/apt/sources.list.d
  run bash -c "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg"
  run bash -c "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list"
  run apt update
  run apt install -y caddy
}
install_caddy

if [[ "${SKIP_FIREWALL}" = "0" ]]; then
  run apt install -y ufw
fi

echo "==> Installing acme.sh"
if [[ ! -x "${HOME}/.acme.sh/acme.sh" ]]; then
  if ! curl -fsSL https://get.acme.sh | sh -s email="${EMAIL}"; then
    echo "==> acme.sh standard install failed, retrying with --force"
    curl -fsSL https://get.acme.sh | sh -s email="${EMAIL}" --force
  fi
fi
ACME_SH="${HOME}/.acme.sh/acme.sh"
if [[ ! -x "${ACME_SH}" ]]; then
  echo "Error: acme.sh not found at ${ACME_SH}" >&2
  exit 1
fi

export DuckDNS_Token="${DUCKDNS_TOKEN}"
ALL_DOMAINS=()
add_unique_domain "${GATEWAY_DOMAIN}"
add_unique_domain "${SERVICE_DOMAIN_KANBAN}"
add_unique_domain "${EFFECTIVE_SERVICE_DOMAIN_FKANDU_DASHBOARD}"
add_unique_domain "${SERVICE_DOMAIN_FKANDU_API}"
add_unique_domain "${SERVICE_DOMAIN_FKANDU_FILES}"
add_unique_domain "${EFFECTIVE_SERVICE_DOMAIN_PUBG}"

echo "==> Issuing certificates via DNS-01 (DuckDNS)"
for domain in "${ALL_DOMAINS[@]}"; do
  [[ -n "${domain}" ]] || continue
  issue_args=(--issue --dns dns_duckdns --server letsencrypt -d "${domain}")
  if [[ "${FORCE_RENEW}" = "1" ]]; then
    issue_args+=(--force)
  fi
  "${ACME_SH}" "${issue_args[@]}"
done

run mkdir -p "${CERTS_BASE_DIR}"
declare -A CERT_FULLCHAIN
declare -A CERT_KEY

cert_fullchain_for() {
  local domain="$1"
  if [[ -z "${domain}" ]]; then
    echo ""
    return 0
  fi
  echo "${CERT_FULLCHAIN[$domain]:-}"
}

cert_key_for() {
  local domain="$1"
  if [[ -z "${domain}" ]]; then
    echo ""
    return 0
  fi
  echo "${CERT_KEY[$domain]:-}"
}

echo "==> Installing cert files for Caddy"
for domain in "${ALL_DOMAINS[@]}"; do
  [[ -n "${domain}" ]] || continue
  dir_name="$(sanitize_domain "${domain}")"
  cert_dir="${CERTS_BASE_DIR}/${dir_name}"
  run mkdir -p "${cert_dir}"
  "${ACME_SH}" --install-cert -d "${domain}" \
    --key-file "${cert_dir}/key.pem" \
    --fullchain-file "${cert_dir}/fullchain.pem"
  CERT_FULLCHAIN["${domain}"]="${cert_dir}/fullchain.pem"
  CERT_KEY["${domain}"]="${cert_dir}/key.pem"
done

echo "==> Preparing Caddy routes"
run mkdir -p "${ROUTES_DIR}"
run rm -f "${ROUTES_DIR}"/*.caddy

if [[ -n "${SINGLE_UPSTREAM}" ]]; then
  write_route "root" "/" "127.0.0.1:${SINGLE_UPSTREAM}"
fi

# Always expose deploy webhook on HTTPS gateway (GitHub cannot use closed :449 after ufw).
write_route "deploy-webhook" "${DEPLOY_WEBHOOK_PATH}" "127.0.0.1:${PORT_DEPLOY_WEBHOOK}"

if [[ "${SKIP_DEFAULT_ROUTES}" = "0" ]]; then
  if should_add_gateway_path "${SERVICE_DOMAIN_KANBAN}"; then
    write_route "kanban" "/kanban" "127.0.0.1:${PORT_KANBAN}"
  fi
  if should_add_gateway_path "${EFFECTIVE_SERVICE_DOMAIN_FKANDU_DASHBOARD}"; then
    write_next_dashboard_route "fkandu-dashboard" "/dashboard" "127.0.0.1:${PORT_FKANDU_DASHBOARD}"
  fi
  if should_add_gateway_path "${SERVICE_DOMAIN_FKANDU_API}"; then
    write_preserve_route "fkandu-api" "/api" "127.0.0.1:${PORT_FKANDU_API}"
  fi
  if should_add_gateway_path "${SERVICE_DOMAIN_FKANDU_FILES}"; then
    write_preserve_route "fkandu-files" "/files" "127.0.0.1:${PORT_FKANDU_BOT_FILES}"
  fi
  if should_add_gateway_path "${EFFECTIVE_SERVICE_DOMAIN_PUBG}"; then
    write_route "pubg" "/pubg" "127.0.0.1:${PORT_PUBG_API}"
  fi
fi

UPSTREAM_KANBAN="127.0.0.1:${PORT_KANBAN}"
UPSTREAM_FKANDU_DASHBOARD="127.0.0.1:${PORT_FKANDU_DASHBOARD}"
UPSTREAM_FKANDU_API="127.0.0.1:${PORT_FKANDU_API}"
UPSTREAM_FKANDU_FILES="127.0.0.1:${PORT_FKANDU_BOT_FILES}"
UPSTREAM_PUBG="127.0.0.1:${PORT_PUBG_API}"

TMP_CADDYFILE="$(mktemp)"
cat > "${TMP_CADDYFILE}" <<EOF
${GATEWAY_DOMAIN} {
    tls ${CERT_FULLCHAIN[${GATEWAY_DOMAIN}]} ${CERT_KEY[${GATEWAY_DOMAIN}]}
    encode gzip zstd

    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    handle /healthz {
        respond "ok" 200
    }

    import ${ROUTES_DIR}/*.caddy

    handle {
        respond "Route is not configured. Use /<service> path." 404
    }
}
EOF

append_domain_proxy_block "${TMP_CADDYFILE}" "${SERVICE_DOMAIN_KANBAN}" "${UPSTREAM_KANBAN}" "$(cert_fullchain_for "${SERVICE_DOMAIN_KANBAN}")" "$(cert_key_for "${SERVICE_DOMAIN_KANBAN}")"
append_domain_proxy_block "${TMP_CADDYFILE}" "${EFFECTIVE_SERVICE_DOMAIN_FKANDU_DASHBOARD}" "${UPSTREAM_FKANDU_DASHBOARD}" "$(cert_fullchain_for "${EFFECTIVE_SERVICE_DOMAIN_FKANDU_DASHBOARD}")" "$(cert_key_for "${EFFECTIVE_SERVICE_DOMAIN_FKANDU_DASHBOARD}")"
append_domain_proxy_block "${TMP_CADDYFILE}" "${SERVICE_DOMAIN_FKANDU_API}" "${UPSTREAM_FKANDU_API}" "$(cert_fullchain_for "${SERVICE_DOMAIN_FKANDU_API}")" "$(cert_key_for "${SERVICE_DOMAIN_FKANDU_API}")"
append_domain_proxy_block "${TMP_CADDYFILE}" "${SERVICE_DOMAIN_FKANDU_FILES}" "${UPSTREAM_FKANDU_FILES}" "$(cert_fullchain_for "${SERVICE_DOMAIN_FKANDU_FILES}")" "$(cert_key_for "${SERVICE_DOMAIN_FKANDU_FILES}")"
append_domain_proxy_block "${TMP_CADDYFILE}" "${EFFECTIVE_SERVICE_DOMAIN_PUBG}" "${UPSTREAM_PUBG}" "$(cert_fullchain_for "${EFFECTIVE_SERVICE_DOMAIN_PUBG}")" "$(cert_key_for "${EFFECTIVE_SERVICE_DOMAIN_PUBG}")"

run cp "${TMP_CADDYFILE}" "${CADDYFILE_PATH}"
rm -f "${TMP_CADDYFILE}"

echo "==> Installing route helper"
run cp deploy/caddy-route.sh "${ROUTE_HELPER_PATH}"
run chmod +x "${ROUTE_HELPER_PATH}"

echo "==> Validating and restarting Caddy"
run caddy validate --config "${CADDYFILE_PATH}"
run systemctl enable --now caddy
run systemctl restart caddy

if [[ "${SKIP_FIREWALL}" = "0" ]]; then
  echo "==> Configuring UFW"
  run ufw allow OpenSSH
  run ufw allow 80/tcp
  run ufw allow 443/tcp
  # HTTP deploy webhook (nginx); without this GitHub gets "failed to connect"
  run ufw allow "${PORT_DEPLOY_WEBHOOK_PUBLIC:-450}/tcp"
  run ufw --force enable
fi

echo "==> Health checks"
echo "Gateway resolve:"
dig +short "${GATEWAY_DOMAIN}" || true
echo "HTTPS check:"
curl -I --max-time 20 "https://${GATEWAY_DOMAIN}" || true

echo
echo "Done."
echo "Gateway domain: https://${GATEWAY_DOMAIN}"
echo "GitHub deploy webhook URL: https://${GATEWAY_DOMAIN}${DEPLOY_WEBHOOK_PATH}"
if [[ -n "${SERVICE_DOMAIN_KANBAN}" ]]; then
  echo "Kanban domain: https://${SERVICE_DOMAIN_KANBAN}"
fi
if [[ -n "${EFFECTIVE_SERVICE_DOMAIN_FKANDU_DASHBOARD}" ]]; then
  echo "FKandu dashboard domain: https://${EFFECTIVE_SERVICE_DOMAIN_FKANDU_DASHBOARD}"
fi
if [[ -n "${SERVICE_DOMAIN_FKANDU_API}" ]]; then
  echo "FKandu API domain: https://${SERVICE_DOMAIN_FKANDU_API}"
fi
if [[ -n "${SERVICE_DOMAIN_FKANDU_FILES}" ]]; then
  echo "FKandu files domain: https://${SERVICE_DOMAIN_FKANDU_FILES}"
fi
if [[ -n "${EFFECTIVE_SERVICE_DOMAIN_PUBG}" ]]; then
  echo "PUBG domain: https://${EFFECTIVE_SERVICE_DOMAIN_PUBG}"
fi
