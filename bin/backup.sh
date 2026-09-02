#!/usr/bin/env bash
# Nightly database backup. One cron line, no systemd unit:
#
#   17 4 * * * /home/cesmii/repos/nerd-store/bin/backup.sh
#
# sqlite3 .backup takes a consistent snapshot of a live database including
# anything still in the write-ahead log, so this is safe while the shop is
# trading and produces exactly one file -- no -wal or -shm sidecars to sweep up.
set -euo pipefail

APP_DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="$APP_DIR/data/store.sqlite"
DEST="${BACKUP_DIR:-$HOME/backups/nerd-store}"
KEEP=14

command -v sqlite3 >/dev/null || { echo "backup: sqlite3 is not installed" >&2; exit 1; }
[ -f "$DB" ] || { echo "backup: no database at $DB" >&2; exit 1; }

mkdir -p "$DEST"
stamp="$(date +%Y%m%d-%H%M%S)"
out="$DEST/store-$stamp.db"

sqlite3 "$DB" ".backup '$out'"
gzip -f "$out"
chmod 600 "$out.gz"

# Stock lives in data/stock.json, not in the database. Without this the
# backup contains every order and no inventory at all.
STOCK="$APP_DIR/data/stock.json"
if [ -f "$STOCK" ]; then
  cp "$STOCK" "$DEST/stock-$stamp.json"
  gzip -f "$DEST/stock-$stamp.json"
  chmod 600 "$DEST/stock-$stamp.json.gz"
fi

# Keep the most recent $KEEP of each, drop the rest.
ls -1t "$DEST"/store-*.db.gz    2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
ls -1t "$DEST"/stock-*.json.gz  2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "backed up to $out.gz ($(du -h "$out.gz" | cut -f1))${STOCK:+ + stock.json}"
