#!/bin/sh
set -eu
alembic upgrade head
python -c "from app.horoscope.vector_store import warm; warm()" || echo "horoscope index was not warmed"
exec python -m app.main
