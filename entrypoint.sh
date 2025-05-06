#!/bin/sh
# entrypoint.sh - Runs migrations and then starts the main application.

# Exit immediately if a command exits with a non-zero status.
set -e

echo "[Entrypoint] Running database migrations..."

# IMPORTANT: node-pg-migrate uses PG* environment variables by default.
export PGHOST=$DB_HOST
export PGPORT=$DB_PORT
export PGUSER=$DB_USERNAME
export PGPASSWORD=$DB_PASSWORD
export PGDATABASE=$DB_NAME

npm run migrate:up

# Check migration exit code ($? holds the exit status of the last command)
if [ $? -ne 0 ]; then
  echo "[Entrypoint] Migrations failed. Exiting."
  exit 1
fi

echo "[Entrypoint] Migrations complete."
echo "[Entrypoint] Starting application..."

# Execute the command passed as arguments to this script (the CMD from Dockerfile)
exec node dist/src/index.js