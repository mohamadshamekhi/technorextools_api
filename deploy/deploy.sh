#!/usr/bin/env bash
# Build + (re)start the production stack. Run from the repo root on the server.
#
#   bash deploy/deploy.sh          # pull, build, restart
#   bash deploy/deploy.sh --seed   # also run `prisma db push` + seed (first deploy,
#                                  #  or after a schema change)
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.production)

[ -f .env.production ] || {
  echo "missing .env.production — cp deploy/env.production.example .env.production" >&2
  exit 1
}

if [ -d .git ]; then
  echo "==> git pull"
  git pull --ff-only
fi

echo "==> build"
"${COMPOSE[@]}" build

echo "==> infra up (mongo, redis)"
"${COMPOSE[@]}" up -d mongo redis

if [ "${1:-}" = "--seed" ]; then
  echo "==> prisma db push + seed"
  "${COMPOSE[@]}" --profile tools run --rm migrate
fi

echo "==> api up"
"${COMPOSE[@]}" up -d api

echo "==> waiting for health"
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4000/health >/dev/null; then
    echo "healthy"
    "${COMPOSE[@]}" ps
    exit 0
  fi
  sleep 2
done

echo "api did not become healthy — last 50 log lines:" >&2
"${COMPOSE[@]}" logs --tail 50 api >&2
exit 1
