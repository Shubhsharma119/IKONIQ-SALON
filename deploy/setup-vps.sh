#!/usr/bin/env bash
# One-time server setup for Ubuntu 22.04 / 24.04.
# Usage: DOMAIN=app.example.com EMAIL=you@example.com [DUMP=$HOME/salonpro_local.dump] bash deploy/setup-vps.sh
set -euo pipefail
: "${DOMAIN:?Set DOMAIN, for example DOMAIN=app.example.com}"
: "${EMAIL:?Set EMAIL for the SSL certificate}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_ROOT=/var/www/salonpro
ENV_FILE="$APP_DIR/server/.env"
install_deps() { if [ -f package-lock.json ]; then npm ci; else npm install; fi; }
echo "==> Memory check"
if [ "$(free -m | awk '/Mem:/ {print $2}')" -lt 1800 ] && [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  echo "Added 2 GB swap so the build does not run out of memory"
fi
echo "==> System packages"
sudo apt-get update -y
sudo apt-get install -y curl git nginx rsync ufw openssl ca-certificates postgresql postgresql-contrib certbot python3-certbot-nginx
echo "==> Node.js"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo npm install -g pm2
echo "==> Database and secrets"
if [ ! -f "$ENV_FILE" ]; then
  DBPASS=$(openssl rand -hex 16)
  JWT=$(openssl rand -hex 48)
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE USER salonpro WITH PASSWORD '$DBPASS';"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE salonpro_db OWNER salonpro;"
  if [ -f "$APP_DIR/server/.env.example" ]; then cp "$APP_DIR/server/.env.example" "$ENV_FILE"; else : > "$ENV_FILE"; fi
  set_var() { local k="$1" v="$2"; if grep -qE "^$k=" "$ENV_FILE"; then sed -i "s|^$k=.*|$k=\"$v\"|" "$ENV_FILE"; else echo "$k=\"$v\"" >> "$ENV_FILE"; fi; }
  set_var DATABASE_URL "postgresql://salonpro:$DBPASS@localhost:5432/salonpro_db?schema=public"
  set_var JWT_SECRET "$JWT"
  set_var PORT 5000
  set_var NODE_ENV production
  chmod 600 "$ENV_FILE"
  if [ -n "${DUMP:-}" ]; then
    [ -f "$DUMP" ] || { echo "Dump file not found: $DUMP"; exit 1; }
    echo "==> Restoring your existing data"
    pg_restore --no-owner --no-privileges -d "postgresql://salonpro:$DBPASS@localhost:5432/salonpro_db" "$DUMP"
  fi
else
  echo "server/.env already exists, keeping it"
fi
echo "Variables in server/.env: $(grep -oE '^[A-Za-z_][A-Za-z0-9_]*' "$ENV_FILE" | tr '\n' ' ')"
echo "==> Server code"
cd "$APP_DIR/server"
install_deps
npx prisma generate
npx prisma migrate deploy
if [ -z "${DUMP:-}" ] && grep -q '"seed"' package.json; then npx prisma db seed || true; fi
echo "==> App screens"
cd "$APP_DIR/client"
install_deps
npx vite build
sudo mkdir -p "$WEB_ROOT"
sudo chown "$USER":"$USER" "$WEB_ROOT"
rsync -a --delete dist/ "$WEB_ROOT/"
echo "==> Starting the server and keeping it alive after reboot"
pm2 startOrReload "$APP_DIR/deploy/ecosystem.config.cjs" --update-env
pm2 save
sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$USER" --hp "$HOME"
pm2 save
echo "==> Web server"
sudo tee /etc/nginx/conf.d/salonpro-limits.conf >/dev/null <<'EOF'
limit_req_zone $binary_remote_addr zone=salonpro_login:10m rate=10r/m;
EOF
sed "s/__DOMAIN__/$DOMAIN/g" "$APP_DIR/deploy/nginx.conf.template" | sudo tee /etc/nginx/sites-available/salonpro >/dev/null
sudo ln -sf /etc/nginx/sites-available/salonpro /etc/nginx/sites-enabled/salonpro
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
echo "==> Firewall"
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
echo "==> Daily backup at 10:30 PM"
mkdir -p "$HOME/salonpro-backups"
( crontab -l 2>/dev/null | grep -v 'salonpro/deploy/backup.sh' ; echo "30 22 * * * bash $APP_DIR/deploy/backup.sh >> $HOME/salonpro-backups/backup.log 2>&1" ) | crontab -
echo "==> HTTPS certificate"
sudo certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --no-eff-email --redirect --non-interactive \
  || echo "Certificate step failed. Check that the DNS A record of $DOMAIN points to this server, then run the same certbot command again."
echo
echo "Done. Open https://$DOMAIN"
echo "NEXT: change the Owner password (see the instructions) before anyone else uses the site."