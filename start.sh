#!/bin/bash
set -eu

echo "==> Ensure directories"
mkdir -p /app/data/config /app/data/images

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

# Run database migrations (always, idempotent)
echo "==> Running database migrations"
gosu cloudron:cloudron node /app/code/build/migrate.js

echo "==> Setting permissions"
chown -R cloudron:cloudron /app/data

echo "==> Starting NewsDiff"
exec gosu cloudron:cloudron node /app/code/build/index.js
