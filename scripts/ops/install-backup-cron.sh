#!/usr/bin/env bash
# One-time setup: installs the nightly backup cron job on the prod box.
#
# Run ONCE on the box (Amazon Linux 2023), as root or via sudo, after cloning
# the repo (see DEPLOY.md §7). Re-running is safe — it just overwrites the
# same /etc/cron.d file with identical content.
#
# This script does NOT create /etc/boneless-backup.env — that holds
# per-environment config (bucket name, ping URL) and is created by hand per
# DEPLOY.md so a secret-free repo checkout never implies secret-free ops
# config. pg-backup.sh refuses to run without it.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "install-backup-cron: must run as root (try: sudo $0)" >&2
  exit 1
fi

# Resolve the script's own directory so this works regardless of cwd, then
# derive the repo root (scripts/ops/../..) to build an absolute path to
# pg-backup.sh — cron entries run with no shell profile / relative-path
# context, so the command in the crontab line must be an absolute path.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PG_BACKUP_SCRIPT="${SCRIPT_DIR}/pg-backup.sh"

if [ ! -x "$PG_BACKUP_SCRIPT" ]; then
  echo "install-backup-cron: expected an executable pg-backup.sh at $PG_BACKUP_SCRIPT" >&2
  echo "install-backup-cron: run 'chmod +x $PG_BACKUP_SCRIPT' first" >&2
  exit 1
fi

CRON_FILE="/etc/cron.d/boneless-backup"
CRON_USER="${SUDO_USER:-root}"

# 03:15 UTC daily — off-peak for the crew's timezone spread, and far enough
# from midnight UTC to avoid clashing with any other date-rollover jobs.
# Output is redirected to a log file (not just cron's mail, which is often
# unconfigured/unread on a minimal box) so a failed run leaves a trail.
cat > "$CRON_FILE" <<EOF
# Managed by scripts/ops/install-backup-cron.sh — re-run that script to
# reinstall after editing this file's schedule (edits here are NOT
# preserved automatically; the source of truth is the install script).
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 3 * * * ${CRON_USER} ${PG_BACKUP_SCRIPT} >> /var/log/boneless-backup.log 2>&1
EOF

chmod 644 "$CRON_FILE"

echo "install-backup-cron: installed $CRON_FILE (runs pg-backup.sh daily at 03:15 UTC as '${CRON_USER}')"
echo "install-backup-cron: logs will accumulate at /var/log/boneless-backup.log"
echo "install-backup-cron: reminder — /etc/boneless-backup.env must exist before the first run (see DEPLOY.md §7)"
