#!/usr/bin/env bash
# Pull, build, migrate, restart.
#
#   ./scripts/deploy.sh              pull latest, then deploy
#   ./scripts/deploy.sh --no-pull    deploy what is already checked out
#
# Dependencies are only reinstalled when package-lock.json actually changes.
# A full `npm ci` deletes and refetches ~350 packages and dominates the run
# time; a code-only deploy has no reason to pay that.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/repos/nerd-store}"
export CONFIG_PATH="${CONFIG_PATH:-$APP_DIR/config.json}"
cd "$APP_DIR"

PULL=1
[ "${1:-}" = "--no-pull" ] && PULL=0

step() { printf '\n==> %s\n' "$1"; }
since() { printf '    (%ss)\n' "$(( $(date +%s) - $1 ))"; }

# --- pull -----------------------------------------------------------------
if [ "$PULL" -eq 1 ]; then
  step "Pulling"
  # A tracked file edited on the server blocks a fast-forward. Say which one,
  # rather than failing with git's wall of text.
  dirty="$(git status --porcelain --untracked-files=no)"
  if [ -n "$dirty" ]; then
    echo "    Tracked files modified locally:"
    echo "$dirty" | sed 's/^/      /'
    echo "    Commit, stash, or 'git checkout --' them first."
    exit 1
  fi
  before="$(git rev-parse HEAD)"
  lock_before="$(md5sum package-lock.json 2>/dev/null | cut -d' ' -f1 || true)"
  git pull --ff-only
  after="$(git rev-parse HEAD)"
  lock_after="$(md5sum package-lock.json 2>/dev/null | cut -d' ' -f1 || true)"
  if [ "$before" = "$after" ]; then
    echo "    Already up to date at $(git log --oneline -1)"
  else
    echo "    $(git log --oneline "$before..$after" | wc -l) new commit(s) -> $(git log --oneline -1)"
  fi
else
  lock_before=""; lock_after=""
  echo "==> Skipping pull (--no-pull), at $(git log --oneline -1)"
fi

# --- dependencies ---------------------------------------------------------
step "Dependencies"
t=$(date +%s)
if [ ! -d node_modules ]; then
  echo "    node_modules missing -- full install"
  npm ci --no-audit --no-fund
elif [ -n "$lock_before" ] && [ "$lock_before" != "$lock_after" ]; then
  echo "    package-lock.json changed -- reinstalling"
  npm ci --no-audit --no-fund
else
  echo "    unchanged -- skipped"
fi
since "$t"

# --- build ----------------------------------------------------------------
step "Building storefronts"
t=$(date +%s)
npm run build:all >/dev/null
echo "    i3x   $(find apps/storefront/dist-i3x/client   -name '*.html' | wc -l | tr -d ' ') pages"
echo "    webos $(find apps/storefront/dist-webos/client -name '*.html' | wc -l | tr -d ' ') pages"
since "$t"

# --- checks ---------------------------------------------------------------
step "Validating tenant configuration"
# pipefail is on, so a failed validation still aborts the deploy.
npm run validate:dist 2>&1 | grep -E 'passed|FAIL'

step "Migrating databases"
npm run db:migrate 2>&1 | grep -E 'migrated|error' || true

# --- restart --------------------------------------------------------------
step "Restarting"
for unit in shop-i3x shop-webos; do
  sudo systemctl restart "$unit.service"
done
sleep 3
for unit in shop-i3x shop-webos; do
  if systemctl is-active --quiet "$unit"; then
    echo "    $unit: active"
  else
    echo "    $unit: FAILED"
    journalctl -u "$unit" -n 30 --no-pager
    exit 1
  fi
done

# --- smoke ----------------------------------------------------------------
step "Smoke test"
curl -fsS -o /dev/null -m 10 -w '    i3x   / -> %{http_code}\n' http://127.0.0.1:4321/
curl -fsS -o /dev/null -m 10 -w '    webos / -> %{http_code}\n' http://127.0.0.1:4322/
errs=$(journalctl -u shop-i3x -u shop-webos --since '30 seconds ago' --no-pager -o cat 2>/dev/null | grep -cE 'ERROR|SystemError' || true)
echo "    errors since restart: $errs"

printf '\n==> Done\n'
