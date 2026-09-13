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

WEB_PORT="${WEB_PORT:-5173}"

echo "=== AstroStone demo (HMR) ==="
echo "UI: http://127.0.0.1:${WEB_PORT}  API: http://127.0.0.1:${API_PORT}"
echo "Канал=${MESSAGING_PROVIDER}. amoCRM=${AMOCRM_MODE}. :${API_PORT} без HMR — не открывай."
echo ""

exec npx concurrently -k -n api,web -c cyan,magenta \
  "npm run dev -w @astrostone/api" \
  "npm run dev -w @astrostone/web"
