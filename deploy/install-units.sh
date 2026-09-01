#!/usr/bin/env bash
# Link this repository's systemd units into /etc/systemd/system.
#
#   sudo ./deploy/install-units.sh
#
# /etc/systemd/system gets symlinks, not copies, so `git pull` updates the
# units along with everything else and there is no second place to edit. It
# does NOT reload them -- systemd caches unit contents, so a changed unit
# still needs `systemctl daemon-reload`. deploy.sh does that for you when a
# pull touches deploy/systemd/.
#
# Safe to re-run: it replaces whatever is at each path, including copies left
# by an older `cp`-based install. Nothing is stopped or started.
set -euo pipefail

UNIT_DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")/systemd" && pwd)"
SYSTEM_DIR=/etc/systemd/system

[ "$(id -u)" -eq 0 ] || { echo "install-units.sh: needs root -- run with sudo" >&2; exit 1; }

# Units with an [Install] section get enabled. The two oneshot services have
# none: their timers pull them in by name, so they only need to be findable.
ENABLE=(shop-i3x.service shop-webos.service nerd-store-sweep.timer nerd-store-backup.timer)
LINK_ONLY=(nerd-store-sweep.service nerd-store-backup.service)

for u in "${ENABLE[@]}" "${LINK_ONLY[@]}"; do
  [ -f "$UNIT_DIR/$u" ] || { echo "install-units.sh: missing $UNIT_DIR/$u" >&2; exit 1; }
done

# Clear the way first. A regular file at the target -- what `cp` leaves --
# takes precedence over anything we link, so `enable` would appear to succeed
# while systemd kept reading the stale copy.
for u in "${ENABLE[@]}" "${LINK_ONLY[@]}"; do
  dst="$SYSTEM_DIR/$u"
  if [ -e "$dst" ] || [ -L "$dst" ]; then
    if [ -L "$dst" ]; then printf '    replacing symlink  %s\n' "$u"
    else                   printf '    replacing copy     %s\n' "$u"; fi
    systemctl disable "$u" >/dev/null 2>&1 || true
    rm -f "$dst"
  fi
done
systemctl daemon-reload

# `enable`/`link` given an absolute path outside the unit hierarchy create the
# /etc/systemd/system symlink themselves. Pre-making the symlink by hand and
# then calling `enable` is the thing that does not work -- it fails with
# "already exists and is a symlink".
systemctl link "${LINK_ONLY[@]/#/$UNIT_DIR/}"
systemctl enable "${ENABLE[@]/#/$UNIT_DIR/}"
systemctl daemon-reload

echo
echo "Linked from $UNIT_DIR:"
for u in "${ENABLE[@]}" "${LINK_ONLY[@]}"; do
  printf '    %-28s -> %s\n' "$u" "$(readlink "$SYSTEM_DIR/$u" || echo '(not linked)')"
done
echo
echo "Nothing was started or restarted. If this was a first install:"
echo "    sudo systemctl start shop-i3x shop-webos"
echo "    sudo systemctl start nerd-store-sweep.timer nerd-store-backup.timer"
