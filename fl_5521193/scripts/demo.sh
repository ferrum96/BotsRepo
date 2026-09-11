#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env ]; then
  cp .env.example .env
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

export DEMO_MODE=true
export API_PORT="${API_PORT:-5521}"
export MESSAGING_PROVIDER="${MESSAGING_PROVIDER:-stub}"
export AMOCRM_MODE="${AMOCRM_MODE:-stub}"
unset DATABASE_URL

echo "=== AstroStone demo ==="
echo "Один процесс, PGlite. Канал=${MESSAGING_PROVIDER}. amoCRM=${AMOCRM_MODE}. Открой http://127.0.0.1:${API_PORT}"
echo ""

npm run build -w @astrostone/web
exec npm run start -w @astrostone/api
