#!/usr/bin/env bash
# Nightly Mongo dump. Keeps 14 days.
#   crontab -e  ->  30 3 * * * /home/deploy/abzar-api/deploy/backup-mongo.sh
set -euo pipefail

cd "$(dirname "$0")/.."
OUT_DIR="${BACKUP_DIR:-$HOME/backups/mongo}"
STAMP="$(date +%F-%H%M)"
mkdir -p "$OUT_DIR"

docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T mongo mongodump --archive --gzip --db abzar >"$OUT_DIR/abzar-$STAMP.archive.gz"

find "$OUT_DIR" -name 'abzar-*.archive.gz' -mtime +14 -delete
echo "backup: $OUT_DIR/abzar-$STAMP.archive.gz"

# Restore:
#   docker compose -f docker-compose.prod.yml --env-file .env.production \
#     exec -T mongo mongorestore --archive --gzip --drop < abzar-<stamp>.archive.gz
