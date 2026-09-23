#!/bin/sh
set -eu

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT_DIR=${BACKUP_DIR:-/backups}
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/astro-$STAMP.sql"

pg_dump \
  --host "${POSTGRES_HOST:-postgres}" \
  --port "${POSTGRES_PORT:-5432}" \
  --username "${POSTGRES_USER:-astro}" \
  --dbname "${POSTGRES_DB:-astro}" \
  --no-owner \
  --format=plain \
  --file "$FILE"

gzip -f "$FILE"
echo "backup written: $FILE.gz"

ls -1t "$OUT_DIR"/astro-*.sql.gz 2>/dev/null | awk 'NR>14' | while read -r old; do
  rm -f "$old"
done
