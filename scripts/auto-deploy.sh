#!/usr/bin/env bash
# Deploy when the checked-out code differs from what is actually running.
#
# Intended for cron:
#   */5 * * * * /home/cesmii/repos/nerd-store/scripts/auto-deploy.sh
#
# Compares HEAD against the commit last built, NOT against origin. That
# matters here: git-update.sh already pulls every repo in ~/repos every two
# minutes, so "behind origin" is almost never true even when the running
# services are stale. What is deployed and what is checked out are different
# questions, and only the first one decides whether work is needed.
set -uo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"
STAMP="$APP_DIR/.last-deploy"
LOG="${AUTO_DEPLOY_LOG:-$HOME/logs/nerd-store-deploy.log}"
mkdir -p "$(dirname "$LOG")"

log() { printf '%s  %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >> "$LOG"; }

# One deploy at a time: two overlapping builds would race on dist-* and on
# the restart. mkdir is atomic on POSIX and, unlike flock, exists everywhere
# -- flock is util-linux only, and when it is missing the naive check reads as
# "already locked", so the deploy silently never runs.
LOCKDIR="$APP_DIR/.deploy.lock.d"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  # A crashed deploy leaves the directory behind. Reclaim it after 30 minutes
  # -- far longer than a real deploy, which takes about fifteen seconds.
  if [ -n "$(find "$LOCKDIR" -maxdepth 0 -mmin +30 2>/dev/null)" ]; then
    log "warn: reclaiming a stale lock from a previous run"
    rm -rf "$LOCKDIR"; mkdir "$LOCKDIR" 2>/dev/null || exit 0
  else
    log "skipped: a deploy is already running"
    exit 0
  fi
fi
trap 'rmdir "$LOCKDIR" 2>/dev/null || true' EXIT

# Pick up anything git-update.sh has not fetched yet. Never merge: a rebased
# or force-pushed branch should stop and be looked at, not resolved by cron.
git fetch -q origin main 2>/dev/null || log "warn: git fetch failed"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  log "BLOCKED: tracked files modified locally -- $(git status --porcelain --untracked-files=no | tr '\n' ' ')"
  exit 1
fi
git merge --ff-only -q origin/main 2>/dev/null || true

HEAD_SHA="$(git rev-parse HEAD)"
LAST_SHA="$(cat "$STAMP" 2>/dev/null || echo none)"

if [ "$HEAD_SHA" = "$LAST_SHA" ]; then
  exit 0            # already deployed; say nothing, cron runs constantly
fi

log "deploying $(git log --oneline -1 | tr -d '\n')"
if ./scripts/deploy.sh --no-pull >>"$LOG" 2>&1; then
  echo "$HEAD_SHA" > "$STAMP"
  log "OK -> ${HEAD_SHA:0:7}"
else
  # Deliberately do NOT stamp: the next run retries. deploy.sh aborts before
  # restarting if validation or the build fails, so the running services are
  # still on the previous, working code.
  log "FAILED at ${HEAD_SHA:0:7} -- services left on ${LAST_SHA:0:7}, will retry"
  exit 1
fi
