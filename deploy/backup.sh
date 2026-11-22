#!/usr/bin/env bash
# Daily database backup. Keeps 30 days. Usage: bash deploy/backup.sh
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${BACKUP_DIR:-$HOME/salonpro-backups}"
mkdir -p "$OUT"
URL=$(grep -E '^DATABASE_URL=' "$APP_DIR/server/.env" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
URL="${URL%%\?*}"
FILE="$OUT/salonpro_$(date +%F_%H%M).dump"
pg_dump -Fc -d "$URL" -f "$FILE"
pg_restore --list "$FILE" > /dev/null
find "$OUT" -name 'salonpro_*.dump' -mtime +30 -delete
echo "Backup saved: $FILE ($(du -h "$FILE" | cut -f1))"