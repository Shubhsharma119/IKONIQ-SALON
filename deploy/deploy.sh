#!/usr/bin/env bash
# Update the live app after you push new code. Usage: bash deploy/deploy.sh
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_ROOT=/var/www/salonpro
install_deps() { if [ -f package-lock.json ]; then npm ci; else npm install; fi; }
cd "$APP_DIR"
echo "==> Getting the latest code"
git pull --ff-only
echo "==> Backing up the database first"
bash "$APP_DIR/deploy/backup.sh"
echo "==> Server"
cd "$APP_DIR/server"
install_deps
npx prisma generate
npx prisma migrate deploy
echo "==> App screens"
cd "$APP_DIR/client"
install_deps
npx vite build
rsync -a --delete dist/ "$WEB_ROOT/"
echo "==> Restarting the server"
pm2 startOrReload "$APP_DIR/deploy/ecosystem.config.cjs" --update-env
pm2 save
sleep 3
CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5000/api/customers || true)
if [ "$CODE" = "401" ] || [ "$CODE" = "200" ]; then echo "Server is up (HTTP $CODE). Deploy finished."; else echo "WARNING: server answered HTTP $CODE. Check: pm2 logs salonpro-api"; exit 1; fi