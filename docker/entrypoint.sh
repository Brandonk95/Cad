#!/bin/sh
set -e

PB=/pb/pocketbase
DATA=/pb/pb_data
mkdir -p "$DATA"

# Apply schema before anything else touches the database.
"$PB" migrate up --dir="$DATA" --migrationsDir=/pb/pb_migrations >/dev/null

# Optional: create or reset the PocketBase admin from env vars.
if [ -n "$PB_ADMIN_EMAIL" ] && [ -n "$PB_ADMIN_PASSWORD" ]; then
  "$PB" superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" --dir="$DATA" >/dev/null \
    && echo "stratum: admin account ready for $PB_ADMIN_EMAIL"
fi

exec "$PB" serve \
  --http=0.0.0.0:8090 \
  --dir="$DATA" \
  --publicDir=/pb/pb_public \
  --migrationsDir=/pb/pb_migrations \
  --hooksDir=/pb/pb_hooks \
  --automigrate=false
