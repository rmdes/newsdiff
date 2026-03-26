#!/bin/bash
set -eu

echo "==> Ensure directories"
mkdir -p /app/data/config /app/data/images /run/nginx-client-body /run/nginx-proxy /run/nginx-fastcgi /run/nginx-uwsgi /run/nginx-scgi

# First-run: create env.sh template for user secrets
if [[ ! -f /app/data/config/env.sh ]]; then
    echo "==> Creating env.sh for social media credentials"
    cp /app/pkg/env.sh.template /app/data/config/env.sh
fi

# Source user secrets
source /app/data/config/env.sh

# Map Cloudron environment variables
export DATABASE_URL="postgresql://${CLOUDRON_POSTGRESQL_USERNAME}:${CLOUDRON_POSTGRESQL_PASSWORD}@${CLOUDRON_POSTGRESQL_HOST}:${CLOUDRON_POSTGRESQL_PORT}/${CLOUDRON_POSTGRESQL_DATABASE}"
export REDIS_URL="redis://:${CLOUDRON_REDIS_PASSWORD}@${CLOUDRON_REDIS_HOST}:${CLOUDRON_REDIS_PORT}"
export ORIGIN="${CLOUDRON_APP_ORIGIN}"
export PORT=3000
export IMAGE_DIR=/app/data/images

# Bot environment
export BOT_ORIGIN="${CLOUDRON_APP_ORIGIN}"
export BOT_PORT=8001
export BOT_USERNAME="${BOT_USERNAME:-bot}"
export BOT_NAME="${BOT_NAME:-NewsDiff Bot}"
export REDIS_HOST="${CLOUDRON_REDIS_HOST}"
export REDIS_PORT="${CLOUDRON_REDIS_PORT}"
export REDIS_PASSWORD="${CLOUDRON_REDIS_PASSWORD}"

# Run database migrations (always, idempotent)
echo "==> Running database migrations"
gosu cloudron:cloudron node --import tsx/esm /app/code/src/lib/server/db/migrate.ts

echo "==> Setting permissions"
chown -R cloudron:cloudron /app/data

# Setup nginx
cp /app/pkg/nginx.conf /run/nginx.conf
echo "==> Starting nginx on port 8000"
nginx -c /run/nginx.conf &

# Start ActivityPub bot in background
echo "==> Starting ActivityPub bot on port ${BOT_PORT}"
gosu cloudron:cloudron node --import tsx/esm /app/code/src/bot/index.ts &
BOT_PID=$!

# Start SvelteKit (main process)
echo "==> Starting SvelteKit on port ${PORT}"
gosu cloudron:cloudron node /app/code/build/index.js &
SVELTE_PID=$!

# Wait for both — if either exits, the container should stop
wait -n $BOT_PID $SVELTE_PID
echo "==> A process exited, shutting down"
kill $BOT_PID $SVELTE_PID 2>/dev/null || true
wait
