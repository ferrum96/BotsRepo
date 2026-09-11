#!/bin/sh
set -eu

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT_DIR=${BACKUP_DIR:-/backups}
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/maxbot-$STAMP.sql"

pg_dump \
  --host "${POSTGRES_HOST:-postgres}" \
  --port "${POSTGRES_PORT:-5432}" \
  --username "${POSTGRES_USER:-maxbot}" \
  --dbname "${POSTGRES_DB:-maxbot}" \
  --no-owner \
  --format=plain \
  --file "$FILE"

gzip -f "$FILE"
echo "backup written: $FILE.gz"
