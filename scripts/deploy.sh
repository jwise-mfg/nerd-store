#!/usr/bin/env bash
# Build, migrate, and restart both storefronts.
#
# Order matters: build first (a failed build must not take the site down),
# migrate before restarting (new code may expect new columns), and restart the
# two services independently so a fault in one store does not stop the other.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/repos/nerd-store}"
export CONFIG_PATH="${CONFIG_PATH:-$APP_DIR/config.json}"
cd "$APP_DIR"

echo "==> Installing dependencies"
npm ci --omit=dev --ignore-scripts=false

echo "==> Building both storefronts"
npm run build:all

echo "==> Validating tenant configuration"
# Refuse to deploy a build where one store's assets ended up in the other.
npm run validate:dist

echo "==> Migrating tenant databases"
CONFIG_PATH="${CONFIG_PATH:-/etc/nerd-store/config.json}" npm run db:migrate

echo "==> Restarting services"
sudo systemctl restart shop-i3x.service
sudo systemctl restart shop-webos.service

sleep 2
for unit in shop-i3x shop-webos; do
  if systemctl is-active --quiet "$unit"; then
    echo "    $unit: active"
  else
    echo "    $unit: FAILED"
    journalctl -u "$unit" -n 30 --no-pager
    exit 1
  fi
done

echo "==> Smoke test"
curl -fsS -o /dev/null -w '    i3x   / -> %{http_code}\n' http://127.0.0.1:4321/
curl -fsS -o /dev/null -w '    webos / -> %{http_code}\n' http://127.0.0.1:4322/
echo "==> Done"
