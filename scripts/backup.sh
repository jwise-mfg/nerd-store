#!/usr/bin/env bash
# Back up every tenant database.
#
# Uses sqlite3 .backup rather than cp: it takes a consistent snapshot of a
# live database, where copying the file while a write is in flight can capture
# a torn page or miss the -wal contents entirely.
set -euo pipefail

DATA_DIR="${DATA_DIR:-/var/lib/nerd-store}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/nerd-store}"
KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"

for db in "$DATA_DIR"/*.db; do
  [ -e "$db" ] || continue
  name="$(basename "$db" .db)"
  out="$BACKUP_DIR/${name}-${STAMP}.db"
  sqlite3 "$db" ".backup '$out'"
  # Collapse the WAL into the copy so a restore needs only this one file.
  sqlite3 "$out" "pragma wal_checkpoint(TRUNCATE); vacuum;" > /dev/null
  gzip -9 "$out"
  echo "backed up $name -> ${out}.gz ($(du -h "${out}.gz" | cut -f1))"
done

find "$BACKUP_DIR" -name '*.db.gz' -mtime "+$KEEP_DAYS" -delete
echo "pruned backups older than ${KEEP_DAYS} days"
