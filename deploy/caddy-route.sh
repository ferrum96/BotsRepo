#!/usr/bin/env bash
set -euo pipefail

ROUTES_DIR="/etc/caddy/routes"
CADDYFILE_PATH="/etc/caddy/Caddyfile"
DEFAULT_HOST="127.0.0.1"

usage() {
  cat <<'USAGE'
Usage:
  caddy-route add --name NAME --path /prefix --upstream 127.0.0.1:PORT
  caddy-route add-from-unit --unit UNIT --name NAME --path /prefix [--host 127.0.0.1]
  caddy-route sync --from DIR [--prefix /svc] [--host 127.0.0.1] [--include REGEX] [--exclude REGEX] [--dry-run]
  caddy-route remove --name NAME
  caddy-route list

Examples:
  caddy-route add --name analytics --path /analytics --upstream 127.0.0.1:9100
  caddy-route add-from-unit --unit kanban --name kanban --path /kanban
  caddy-route sync --from /etc/systemd/system --prefix /svc
  caddy-route remove --name analytics
  caddy-route list
USAGE
}

run() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

require_caddy() {
  if [[ ! -f "${CADDYFILE_PATH}" ]]; then
    echo "Caddyfile not found at ${CADDYFILE_PATH}" >&2
    exit 1
  fi
  run mkdir -p "${ROUTES_DIR}"
}

normalize_prefix() {
  local raw="$1"
  if [[ "${raw}" != /* ]]; then
    echo "Path prefix must start with '/': ${raw}" >&2
    exit 1
  fi
  raw="${raw%/}"
  if [[ -z "${raw}" ]]; then
    raw="/"
  fi
  echo "${raw}"
}

validate_name() {
  local name="$1"
  if ! [[ "${name}" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    echo "Invalid --name. Use letters, digits, dot, underscore, dash." >&2
    exit 1
  fi
}

validate_upstream() {
  local upstream="$1"
  if ! [[ "${upstream}" =~ ^[^:]+:[0-9]+$ ]]; then
    echo "Invalid upstream. Expected host:port, got: ${upstream}" >&2
    exit 1
  fi
}

normalize_unit_name() {
  local unit="$1"
  if [[ "${unit}" == *.service ]]; then
    echo "${unit}"
  else
    echo "${unit}.service"
  fi
}

resolve_unit_path() {
  local unit="$1"
  if [[ "${unit}" = /* ]]; then
    if [[ -f "${unit}" ]]; then
      echo "${unit}"
      return 0
    fi
    echo "Unit file not found: ${unit}" >&2
    exit 1
  fi

  local with_ext
  with_ext="$(normalize_unit_name "${unit}")"
  local candidates=(
    "/etc/systemd/system/${with_ext}"
    "/lib/systemd/system/${with_ext}"
    "/usr/lib/systemd/system/${with_ext}"
  )
  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -f "${candidate}" ]]; then
      echo "${candidate}"
      return 0
    fi
  done

  echo "Cannot resolve unit path for: ${unit}" >&2
  echo "Checked: ${candidates[*]}" >&2
  exit 1
}

strip_wrapping_quotes() {
  local value="$1"
  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"
  echo "${value}"
}

extract_env_value_from_assignment() {
  local assignment="$1"
  local key="$2"
  local token
  for token in ${assignment}; do
    token="$(strip_wrapping_quotes "${token}")"
    if [[ "${token}" == "${key}="* ]]; then
      echo "${token#${key}=}"
      return 0
    fi
  done
  return 1
}

collect_env_files() {
  local unit_path="$1"
  local files=()
  local line value
  while IFS= read -r line; do
    [[ "${line}" =~ ^[[:space:]]*EnvironmentFile= ]] || continue
    value="${line#*=}"
    value="$(strip_wrapping_quotes "${value}")"
    value="${value#-}"
    [[ -n "${value}" ]] && files+=("${value}")
  done < "${unit_path}"

  printf '%s\n' "${files[@]}"
}

lookup_env_file_var() {
  local key="$1"
  shift
  local file line
  for file in "$@"; do
    [[ -f "${file}" ]] || continue
    while IFS= read -r line; do
      [[ "${line}" =~ ^[[:space:]]*# ]] && continue
      [[ "${line}" == "${key}="* ]] || continue
      echo "${line#${key}=}"
      return 0
    done < "${file}"
  done
  return 1
}

resolve_value_from_env_reference() {
  local raw="$1"
  shift
  local env_files=("$@")
  local env_key=""

  if [[ "${raw}" =~ ^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$ ]]; then
    env_key="${BASH_REMATCH[1]}"
  elif [[ "${raw}" =~ ^\$([A-Za-z_][A-Za-z0-9_]*)$ ]]; then
    env_key="${BASH_REMATCH[1]}"
  fi

  if [[ -n "${env_key}" ]]; then
    lookup_env_file_var "${env_key}" "${env_files[@]}" || return 1
    return 0
  fi

  echo "${raw}"
}

extract_port_from_unit() {
  local unit_path="$1"
  local env_files=()
  local env_file
  while IFS= read -r env_file; do
    [[ -n "${env_file}" ]] && env_files+=("${env_file}")
  done < <(collect_env_files "${unit_path}")

  local keys=(PORT DASHBOARD_PORT APP_PORT SERVICE_PORT HTTP_PORT LISTEN_PORT)
  local key line assignment value resolved

  for key in "${keys[@]}"; do
    while IFS= read -r line; do
      [[ "${line}" =~ ^[[:space:]]*Environment= ]] || continue
      assignment="${line#*=}"
      if value="$(extract_env_value_from_assignment "${assignment}" "${key}")"; then
        resolved="$(resolve_value_from_env_reference "${value}" "${env_files[@]}" || true)"
        resolved="$(strip_wrapping_quotes "${resolved}")"
        if [[ "${resolved}" =~ ^[0-9]+$ ]]; then
          echo "${resolved}"
          return 0
        fi
      fi
    done < "${unit_path}"
  done

  if grep -Eq -- '--port[=[:space:]]+[0-9]+' "${unit_path}"; then
    grep -Eo -- '--port[=[:space:]]+[0-9]+' "${unit_path}" | grep -Eo '[0-9]+' | head -n 1
    return 0
  fi

  if grep -Eq -- '--port[=[:space:]]+\$\{?[A-Za-z_][A-Za-z0-9_]*\}?' "${unit_path}"; then
    local token var_ref
    token="$(grep -Eo -- '--port[=[:space:]]+\$\{?[A-Za-z_][A-Za-z0-9_]*\}?' "${unit_path}" | head -n 1)"
    var_ref="${token#*=}"
    var_ref="${var_ref#--port }"
    resolved="$(resolve_value_from_env_reference "${var_ref}" "${env_files[@]}" || true)"
    resolved="$(strip_wrapping_quotes "${resolved}")"
    if [[ "${resolved}" =~ ^[0-9]+$ ]]; then
      echo "${resolved}"
      return 0
    fi
  fi

  for key in "${keys[@]}"; do
    if value="$(lookup_env_file_var "${key}" "${env_files[@]}" || true)"; then
      value="$(strip_wrapping_quotes "${value}")"
      if [[ "${value}" =~ ^[0-9]+$ ]]; then
        echo "${value}"
        return 0
      fi
    fi
  done

  return 1
}

add_route() {
  local name="$1"
  local prefix="$2"
  local upstream="$3"

  validate_name "${name}"
  validate_upstream "${upstream}"

  require_caddy
  prefix="$(normalize_prefix "${prefix}")"

  local route_file="${ROUTES_DIR}/${name}.caddy"
  run tee "${route_file}" >/dev/null <<EOF
# ${name}
handle_path ${prefix}* {
    reverse_proxy ${upstream}
}
EOF

  run caddy validate --config "${CADDYFILE_PATH}"
  run systemctl reload caddy
  echo "Route added: ${name} (${prefix}* -> ${upstream})"
}

add_route_from_unit() {
  local unit="$1"
  local name="$2"
  local prefix="$3"
  local host="$4"
  local unit_path port

  validate_name "${name}"
  unit_path="$(resolve_unit_path "${unit}")"

  if ! port="$(extract_port_from_unit "${unit_path}")"; then
    echo "Failed to detect port from unit: ${unit_path}" >&2
    echo "Tip: use manual mode:" >&2
    echo "  caddy-route add --name ${name} --path ${prefix} --upstream ${host}:PORT" >&2
    exit 1
  fi

  add_route "${name}" "${prefix}" "${host}:${port}"
  echo "Detected from unit ${unit_path}: port ${port}"
}

list_unit_files_from_dir() {
  local from_dir="$1"
  if [[ ! -d "${from_dir}" ]]; then
    echo "Directory not found: ${from_dir}" >&2
    exit 1
  fi

  local found_any=0
  local unit_path
  for unit_path in "${from_dir}"/*.service; do
    [[ -f "${unit_path}" ]] || continue
    found_any=1
    echo "${unit_path}"
  done

  if [[ "${found_any}" -eq 0 ]]; then
    echo "No .service files found in ${from_dir}" >&2
    exit 1
  fi
}

unit_name_from_path() {
  local unit_path="$1"
  local name
  name="$(basename "${unit_path}")"
  echo "${name%.service}"
}

sync_routes_from_units() {
  local from_dir="$1"
  local base_prefix="$2"
  local host="$3"
  local include_regex="$4"
  local exclude_regex="$5"
  local dry_run="$6"

  require_caddy
  base_prefix="$(normalize_prefix "${base_prefix}")"

  local unit_path name route_name route_path port upstream
  local total=0
  local created=0
  local skipped=0

  while IFS= read -r unit_path; do
    [[ -n "${unit_path}" ]] || continue
    total=$((total + 1))
    name="$(unit_name_from_path "${unit_path}")"

    if [[ -n "${include_regex}" ]] && ! [[ "${name}" =~ ${include_regex} ]]; then
      skipped=$((skipped + 1))
      continue
    fi
    if [[ -n "${exclude_regex}" ]] && [[ "${name}" =~ ${exclude_regex} ]]; then
      skipped=$((skipped + 1))
      continue
    fi

    route_name="${name}"
    if [[ "${base_prefix}" == "/" ]]; then
      route_path="/${name}"
    else
      route_path="${base_prefix}/${name}"
    fi

    if ! port="$(extract_port_from_unit "${unit_path}")"; then
      echo "Skip ${name}: cannot detect port from ${unit_path}" >&2
      skipped=$((skipped + 1))
      continue
    fi

    upstream="${host}:${port}"
    if [[ "${dry_run}" = "1" ]]; then
      echo "DRY RUN: ${route_name} ${route_path}* -> ${upstream}"
      created=$((created + 1))
      continue
    fi

    add_route "${route_name}" "${route_path}" "${upstream}" >/dev/null
    echo "Synced: ${route_name} (${route_path}* -> ${upstream})"
    created=$((created + 1))
  done < <(list_unit_files_from_dir "${from_dir}")

  if [[ "${dry_run}" = "1" ]]; then
    echo "Dry run complete. scanned=${total} matched=${created} skipped=${skipped}"
  else
    echo "Sync complete. scanned=${total} created_or_updated=${created} skipped=${skipped}"
  fi
}

remove_route() {
  local name="$1"
  local route_file="${ROUTES_DIR}/${name}.caddy"
  require_caddy

  if [[ ! -f "${route_file}" ]]; then
    echo "Route not found: ${name}"
    exit 1
  fi

  run rm -f "${route_file}"
  run caddy validate --config "${CADDYFILE_PATH}"
  run systemctl reload caddy
  echo "Route removed: ${name}"
}

list_routes() {
  require_caddy
  echo "Routes in ${ROUTES_DIR}:"
  run ls -1 "${ROUTES_DIR}" || true
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

COMMAND="$1"
shift

case "${COMMAND}" in
  add)
    NAME=""
    PREFIX=""
    UPSTREAM=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --name)
          NAME="${2:-}"
          shift 2
          ;;
        --path)
          PREFIX="${2:-}"
          shift 2
          ;;
        --upstream)
          UPSTREAM="${2:-}"
          shift 2
          ;;
        *)
          echo "Unknown argument: $1" >&2
          usage
          exit 1
          ;;
      esac
    done
    if [[ -z "${NAME}" || -z "${PREFIX}" || -z "${UPSTREAM}" ]]; then
      echo "add requires --name, --path, --upstream" >&2
      exit 1
    fi
    add_route "${NAME}" "${PREFIX}" "${UPSTREAM}"
    ;;
  add-from-unit)
    UNIT=""
    NAME=""
    PREFIX=""
    HOST="${DEFAULT_HOST}"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --unit)
          UNIT="${2:-}"
          shift 2
          ;;
        --name)
          NAME="${2:-}"
          shift 2
          ;;
        --path)
          PREFIX="${2:-}"
          shift 2
          ;;
        --host)
          HOST="${2:-}"
          shift 2
          ;;
        *)
          echo "Unknown argument: $1" >&2
          usage
          exit 1
          ;;
      esac
    done
    if [[ -z "${UNIT}" || -z "${NAME}" || -z "${PREFIX}" ]]; then
      echo "add-from-unit requires --unit, --name, --path" >&2
      exit 1
    fi
    add_route_from_unit "${UNIT}" "${NAME}" "${PREFIX}" "${HOST}"
    ;;
  sync)
    FROM_DIR="/etc/systemd/system"
    BASE_PREFIX="/svc"
    HOST="${DEFAULT_HOST}"
    INCLUDE_REGEX=""
    EXCLUDE_REGEX=""
    DRY_RUN="0"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --from)
          FROM_DIR="${2:-}"
          shift 2
          ;;
        --prefix)
          BASE_PREFIX="${2:-}"
          shift 2
          ;;
        --host)
          HOST="${2:-}"
          shift 2
          ;;
        --include)
          INCLUDE_REGEX="${2:-}"
          shift 2
          ;;
        --exclude)
          EXCLUDE_REGEX="${2:-}"
          shift 2
          ;;
        --dry-run)
          DRY_RUN="1"
          shift
          ;;
        *)
          echo "Unknown argument: $1" >&2
          usage
          exit 1
          ;;
      esac
    done
    sync_routes_from_units "${FROM_DIR}" "${BASE_PREFIX}" "${HOST}" "${INCLUDE_REGEX}" "${EXCLUDE_REGEX}" "${DRY_RUN}"
    ;;
  remove)
    NAME=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --name)
          NAME="${2:-}"
          shift 2
          ;;
        *)
          echo "Unknown argument: $1" >&2
          usage
          exit 1
          ;;
      esac
    done
    if [[ -z "${NAME}" ]]; then
      echo "remove requires --name" >&2
      exit 1
    fi
    remove_route "${NAME}"
    ;;
  list)
    list_routes
    ;;
  --help|-h|help)
    usage
    ;;
  *)
    echo "Unknown command: ${COMMAND}" >&2
    usage
    exit 1
    ;;
esac
