#!/usr/bin/env bash
# Back up every tenant database.
#
# Uses sqlite3 .backup rather than cp: it takes a consistent snapshot of a
# live database, where copying the file while a write is in flight can capture
# a torn page or miss the -wal contents entirely.
#
# Paths come from config.json so there is one source of truth; DATA_DIR and
# BACKUP_DIR override it if set.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

# Ask the app where its data lives rather than guessing.
if [ -z "${DATA_DIR:-}" ]; then
  DATA_DIR="$(node -e "
    import('./packages/core/src/config/index.ts')
      .then(m => process.stdout.write(m.tenantDbPath('i3x')))
  " 2>/dev/null | xargs -r dirname)"
fi
DATA_DIR="${DATA_DIR:-$APP_DIR/data}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/nerd-store}"
KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"
echo "  data:    $DATA_DIR"
echo "  backups: $BACKUP_DIR"

found=0
for db in "$DATA_DIR"/*.db; do
  [ -e "$db" ] || continue
  found=1
  name="$(basename "$db" .db)"
  out="$BACKUP_DIR/${name}-${STAMP}.db"

  # Never leave a plaintext database behind. Two runs inside the same second
  # share a timestamp, and without this the second aborted mid-way and left an
  # uncompressed copy of the store in the backup directory. The -wal and -shm
  # sidecars count too: they are readable database content.
  trap 'rm -f "$out" "$out-wal" "$out-shm"' EXIT

  sqlite3 "$db" ".backup '$out'"
  # Take the copy out of WAL mode so it is a single self-contained file with
  # no sidecars, then compact it. A restore then needs only the .gz.
  sqlite3 "$out" "pragma journal_mode=DELETE; vacuum;" > /dev/null
  rm -f "$out-wal" "$out-shm"
  gzip -9 -f "$out"
  trap - EXIT
  echo "  backed up $name -> $(basename "$out").gz ($(du -h "${out}.gz" | cut -f1))"
done

if [ "$found" -eq 0 ]; then
  echo "  no databases found in $DATA_DIR" >&2
  exit 1
fi

find "$BACKUP_DIR" -name '*.db.gz' -mtime "+$KEEP_DAYS" -delete
echo "  pruned backups older than ${KEEP_DAYS} days"
