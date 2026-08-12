#!/bin/bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${REPO_DIR}/deploy/backup.env"
BACKUP_SCRIPT="${SCRIPT_DIR}/backup-sqlite-to-b2.sh"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

BACKUP_JOBS="${BACKUP_JOBS:-kanban}"

if [ -z "$BACKUP_JOBS" ]; then
  echo "backup-all-db: BACKUP_JOBS empty"
  exit 0
fi

failed=0
IFS=',' read -ra JOBS <<< "$BACKUP_JOBS"
for job in "${JOBS[@]}"; do
  job=$(echo "$job" | xargs)
  [ -n "$job" ] || continue
  echo "==> backup job: ${job}"
  if bash "$BACKUP_SCRIPT" "$job"; then
    :
  else
    echo "backup-all-db: job ${job} failed"
    failed=$((failed + 1))
  fi
done

if [ "$failed" -gt 0 ]; then
  echo "backup-all-db: ${failed} job(s) failed"
  exit 1
fi
