#!/usr/bin/env bash
#
# Run the whole app locally in SINGLE-ORIGIN mode so you can try the
# "Ohne Anmeldung testen" (guest demo) flow before deploying.
#
# One Node server serves BOTH the API and the built web app at
# http://localhost:8080 — this keeps the Better Auth session cookie
# first-party, so anonymous sign-in + the demo seed work without any
# CORS/proxy juggling.
#
# Usage:
#   ./scripts/demo-local.sh
#
# Override defaults via env if your Postgres differs, e.g.:
#   DATABASE_URL="postgresql://user:pass@host:5432/mydb" ./scripts/demo-local.sh
#   PORT=9000 ./scripts/demo-local.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8080}"
DB_NAME="${DB_NAME:-pokekon_dev}"
# Defaults to a local Postgres reachable as the current OS user (Homebrew default).
export DATABASE_URL="${DATABASE_URL:-postgresql://$(whoami)@127.0.0.1:5432/${DB_NAME}}"

# Stable local secrets (gitignored via .env.*.local) so sessions survive restarts.
SECRETS_FILE=".env.demo.local"
if [ ! -f "$SECRETS_FILE" ]; then
  echo "Generating local secrets → $SECRETS_FILE"
  {
    echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
    echo "BETTER_AUTH_SECRET=$(openssl rand -hex 24)"
  } >"$SECRETS_FILE"
fi
set -a
# shellcheck disable=SC1090
. "./$SECRETS_FILE"
set +a

export PORT
export WEB_ORIGIN="http://localhost:${PORT}"
export BETTER_AUTH_URL="http://localhost:${PORT}"
export WEB_DIST_PATH="$PWD/apps/web/dist"

echo "▶ Database: $DATABASE_URL"
echo "▶ Ensuring database '${DB_NAME}' exists…"
createdb "$DB_NAME" 2>/dev/null && echo "  created." || echo "  (already exists / using existing)"

echo "▶ Applying migrations…"
npm run db:migrate -w @pokekon/api

echo "▶ Building (shared → web → api)…"
npm run build -w @pokekon/shared
npm run build -w @pokekon/web
npm run build -w @pokekon/api

echo ""
echo "▶ Starting single-origin server on http://localhost:${PORT}"
echo "  Open it, click \"Ohne Anmeldung testen\". Ctrl+C to stop."
echo ""
exec node apps/api/dist/index.js
