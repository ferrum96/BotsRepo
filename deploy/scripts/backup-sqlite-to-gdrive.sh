#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${REPO_DIR}/deploy/backup.env"
UPLOADER="${REPO_DIR}/deploy/scripts/gdrive-upload.py"

JOB_NAME="${1:-}"
if [ -z "$JOB_NAME" ]; then
  echo "usage: $0 <job-name>"
  exit 1
fi

PREFIX="$(echo "${JOB_NAME}_BACKUP_" | tr '[:lower:]' '[:upper:]')"

get_env() {
  local var_name="$1"
  local default_value="$2"
  local value="${!var_name:-}"
  if [ -z "$value" ]; then
    printf '%s' "$default_value"
  else
    printf '%s' "$value"
  fi
}

ENABLED="$(get_env "${PREFIX}ENABLED" "false")"
DB_PATH="$(get_env "${PREFIX}DB_PATH" "")"
LOCAL_DIR="$(get_env "${PREFIX}LOCAL_DIR" "/var/backups/${JOB_NAME}")"
GDRIVE_FOLDER_ID="$(get_env "${PREFIX}GDRIVE_FOLDER_ID" "")"
GDRIVE_SERVICE_ACCOUNT="$(get_env "${PREFIX}GDRIVE_SERVICE_ACCOUNT" "")"
RETENTION_DAYS="$(get_env "${PREFIX}RETENTION_DAYS" "7")"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a

  # Re-read after sourcing because defaults may now be overridden.
  ENABLED="$(get_env "${PREFIX}ENABLED" "false")"
  DB_PATH="$(get_env "${PREFIX}DB_PATH" "")"
  LOCAL_DIR="$(get_env "${PREFIX}LOCAL_DIR" "/var/backups/${JOB_NAME}")"
  GDRIVE_FOLDER_ID="$(get_env "${PREFIX}GDRIVE_FOLDER_ID" "")"
  GDRIVE_SERVICE_ACCOUNT="$(get_env "${PREFIX}GDRIVE_SERVICE_ACCOUNT" "")"
  RETENTION_DAYS="$(get_env "${PREFIX}RETENTION_DAYS" "7")"
fi

if [ "$ENABLED" != "true" ]; then
  echo "${JOB_NAME} backup skipped: ${PREFIX}ENABLED != true"
  exit 0
fi

if [ -z "$DB_PATH" ]; then
  echo "ERROR: ${PREFIX}DB_PATH is not set"
  exit 1
fi

if [ -z "$GDRIVE_FOLDER_ID" ] || [ -z "$GDRIVE_SERVICE_ACCOUNT" ]; then
  echo "ERROR: ${PREFIX}GDRIVE_FOLDER_ID and ${PREFIX}GDRIVE_SERVICE_ACCOUNT must be set in ${ENV_FILE}"
  exit 1
fi

if [ ! -f "$DB_PATH" ]; then
  echo "ERROR: DB not found: ${DB_PATH}"
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "ERROR: sqlite3 CLI not found"
  exit 1
fi

if [ ! -f "$UPLOADER" ]; then
  echo "ERROR: uploader script not found: ${UPLOADER}"
  exit 1
fi

mkdir -p "$LOCAL_DIR"

TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
DUMP_NAME="${JOB_NAME}-db-${TIMESTAMP}.sqlite"
DUMP_PATH="${LOCAL_DIR}/${DUMP_NAME}"
ARCHIVE_NAME="${JOB_NAME}-db-${TIMESTAMP}.tar.gz"
ARCHIVE_PATH="${LOCAL_DIR}/${ARCHIVE_NAME}"

sqlite3 "$DB_PATH" ".backup '${DUMP_PATH}'"

tar -czf "$ARCHIVE_PATH" -C "$LOCAL_DIR" "$DUMP_NAME"
rm -f "$DUMP_PATH"

python3 "$UPLOADER" \
  --file "$ARCHIVE_PATH" \
  --folder-id "$GDRIVE_FOLDER_ID" \
  --credentials "$GDRIVE_SERVICE_ACCOUNT" \
  --retention-days "$RETENTION_DAYS" \
  --prefix "${JOB_NAME}-db-"

find "$LOCAL_DIR" -type f -name "${JOB_NAME}-db-*.tar.gz" -mtime "+${RETENTION_DAYS}" -delete
