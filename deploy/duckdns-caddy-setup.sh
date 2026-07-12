#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  ./deploy/duckdns-caddy-setup.sh [options]

Options:
  --gateway-domain DOMAIN   Main HTTPS domain (e.g. fkandu.duckdns.org)
  --subdomain NAME          Shorthand for NAME.duckdns.org
  --single-upstream PORT    Single-app mode: proxy / to localhost:PORT
                            (default: disabled; gateway mode is used)
  --skip-default-routes     Do not create current BotsRepo routes
  --domains-env FILE        Service domains env file (default: deploy/domains.env)
  --email EMAIL             ACME email for Caddy (optional)
  --no-firewall             Skip ufw configuration
  --help                    Show this help

Examples:
  ./deploy/duckdns-caddy-setup.sh --gateway-domain fkandu.duckdns.org --email admin@example.com
  ./deploy/duckdns-caddy-setup.sh --subdomain fkandu
USAGE
}

CLI_GATEWAY_DOMAIN=""
SUBDOMAIN=""
SINGLE_UPSTREAM=""
SKIP_DEFAULT_ROUTES="0"
ACME_EMAIL=""
SKIP_FIREWALL="0"
REPO_PORTS_FILE="deploy/ports.env"
DOMAINS_ENV_FILE="deploy/domains.env"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --gateway-domain)
      CLI_GATEWAY_DOMAIN="${2:-}"
      shift 2
      ;;
    --subdomain)
      SUBDOMAIN="${2:-}"
      shift 2
      ;;
    --single-upstream)
      SINGLE_UPSTREAM="${2:-}"
      shift 2
      ;;
    --skip-default-routes)
      SKIP_DEFAULT_ROUTES="1"
      shift
      ;;
    --domains-env)
      DOMAINS_ENV_FILE="${2:-}"
      shift 2
      ;;
    --email)
      ACME_EMAIL="${2:-}"
      shift 2
      ;;
    --no-firewall)
      SKIP_FIREWALL="1"
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

CADDYFILE_PATH="/etc/caddy/Caddyfile"
ROUTES_DIR="/etc/caddy/routes"
ROUTE_HELPER_PATH="/usr/local/bin/caddy-route"

# Default ports (fallbacks)
PORT_KANBAN=3002
PORT_FKANDU_DASHBOARD=3000
PORT_FKANDU_API=8000
PORT_FKANDU_BOT_FILES=8088
PORT_PUBG_API=8080

# Optional domains (configured in deploy/domains.env)
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

if [[ -n "${CLI_GATEWAY_DOMAIN}" ]]; then
  GATEWAY_DOMAIN="${CLI_GATEWAY_DOMAIN}"
elif [[ -n "${SUBDOMAIN}" ]]; then
  GATEWAY_DOMAIN="${SUBDOMAIN}.duckdns.org"
fi

if [[ -z "${GATEWAY_DOMAIN}" ]]; then
  echo "Error: set gateway domain via --gateway-domain, --subdomain, or GATEWAY_DOMAIN in ${DOMAINS_ENV_FILE}" >&2
  exit 1
fi

# Preferred vars:
# - SERVICE_DOMAIN_FKANDU
# - SERVICE_DOMAIN_BB_CLAN
# Backward compatibility is kept for older vars.
EFFECTIVE_SERVICE_DOMAIN_FKANDU_DASHBOARD="${SERVICE_DOMAIN_FKANDU_DASHBOARD}"
if [[ -z "${EFFECTIVE_SERVICE_DOMAIN_FKANDU_DASHBOARD}" ]]; then
  EFFECTIVE_SERVICE_DOMAIN_FKANDU_DASHBOARD="${SERVICE_DOMAIN_FKANDU}"
fi

EFFECTIVE_SERVICE_DOMAIN_PUBG="${SERVICE_DOMAIN_PUBG}"
if [[ -z "${EFFECTIVE_SERVICE_DOMAIN_PUBG}" ]]; then
  EFFECTIVE_SERVICE_DOMAIN_PUBG="${SERVICE_DOMAIN_BB_CLAN}"
fi

warn_if_fkandu_domain_matches_gateway() {
  local svc_name="$1"
  local svc_domain="$2"
  local expected_path="$3"
  if [[ -n "${svc_domain}" && "${svc_domain}" == "${GATEWAY_DOMAIN}" ]]; then
    echo "Warning: ${svc_name} domain equals GATEWAY_DOMAIN (${GATEWAY_DOMAIN})."
    echo "         Leave ${svc_name} empty to keep path route https://${GATEWAY_DOMAIN}${expected_path}"
  fi
}

warn_if_fkandu_domain_matches_gateway "SERVICE_DOMAIN_FKANDU" "${EFFECTIVE_SERVICE_DOMAIN_FKANDU_DASHBOARD}" "/dashboard"
warn_if_fkandu_domain_matches_gateway "SERVICE_DOMAIN_FKANDU_API" "${SERVICE_DOMAIN_FKANDU_API}" "/api"
warn_if_fkandu_domain_matches_gateway "SERVICE_DOMAIN_FKANDU_FILES" "${SERVICE_DOMAIN_FKANDU_FILES}" "/files"

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
  local service_name="$4"
  if [[ -z "${domain_name}" ]]; then
    return
  fi
  if [[ "${domain_name}" == "${GATEWAY_DOMAIN}" ]]; then
    echo "Skip dedicated domain for ${service_name}: same as gateway (${GATEWAY_DOMAIN})"
    return
  fi

  cat >> "${target_file}" <<EOF

${domain_name} {
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

echo "==> Installing packages"
run apt update
run apt install -y curl dnsutils ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

install_caddy() {
  if run apt install -y caddy; then
    return 0
  fi

  echo "==> Caddy package not found in current apt repos, adding official Caddy repo"
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

echo "==> Preparing Caddy gateway config"
run mkdir -p "${ROUTES_DIR}"
run rm -f "${ROUTES_DIR}"/*.caddy

if [[ -n "${SINGLE_UPSTREAM}" ]]; then
  write_route "root" "/" "127.0.0.1:${SINGLE_UPSTREAM}"
fi

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

if [[ -n "${ACME_EMAIL}" ]]; then
  cat > "${TMP_CADDYFILE}" <<EOF
{
    email ${ACME_EMAIL}
}

${GATEWAY_DOMAIN} {
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
else
  cat > "${TMP_CADDYFILE}" <<EOF
${GATEWAY_DOMAIN} {
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
fi

append_domain_proxy_block "${TMP_CADDYFILE}" "${SERVICE_DOMAIN_KANBAN}" "${UPSTREAM_KANBAN}" "kanban"
append_domain_proxy_block "${TMP_CADDYFILE}" "${EFFECTIVE_SERVICE_DOMAIN_FKANDU_DASHBOARD}" "${UPSTREAM_FKANDU_DASHBOARD}" "fkandu-dashboard"
append_domain_proxy_block "${TMP_CADDYFILE}" "${SERVICE_DOMAIN_FKANDU_API}" "${UPSTREAM_FKANDU_API}" "fkandu-api"
append_domain_proxy_block "${TMP_CADDYFILE}" "${SERVICE_DOMAIN_FKANDU_FILES}" "${UPSTREAM_FKANDU_FILES}" "fkandu-files"
append_domain_proxy_block "${TMP_CADDYFILE}" "${EFFECTIVE_SERVICE_DOMAIN_PUBG}" "${UPSTREAM_PUBG}" "pubg"

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
  run ufw --force enable
fi

echo "==> Health checks"
echo "Gateway resolve:"
dig +short "${GATEWAY_DOMAIN}" || true

echo "HTTPS check (certificate issuance may take a few minutes):"
curl -I --max-time 20 "https://${GATEWAY_DOMAIN}" || true

echo
echo "Done."
echo "Gateway domain: https://${GATEWAY_DOMAIN}"
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
echo "Configured routes:"
run ls -1 "${ROUTES_DIR}" || true
echo "Add new routes in future:"
echo "  caddy-route add --name my-service --path /my-service --upstream 127.0.0.1:9001"
echo "Or auto-detect port from systemd unit:"
echo "  caddy-route add-from-unit --unit my-service --name my-service --path /my-service"
echo "Or bulk-sync from unit files:"
echo "  caddy-route sync --from /etc/systemd/system --prefix /svc --include 'kanban|fkandu|pubg'"
