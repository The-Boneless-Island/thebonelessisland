#!/usr/bin/env bash
# Nightly backup: dumps Postgres + tars the forum-uploads volume, both to S3.
#
# Runs ON THE PROD BOX (Amazon Linux 2023), not in CI — installed as a cron
# job by install-backup-cron.sh (see /etc/cron.d/boneless-backup). It has no
# knowledge of this repo's dev/CI tooling; it only assumes docker + the aws
# CLI are on PATH, which they already are for the deploy user (see DEPLOY.md).
#
# Config comes from an env file OUTSIDE the repo, /etc/boneless-backup.env,
# so the bucket name/ping URL aren't tied to a git checkout and don't need a
# repo write to rotate. install-backup-cron.sh documents the expected keys;
# see DEPLOY.md §7 for the full setup.
#
# Bash (not strict POSIX sh) because `pipefail` below needs it — AL2023 ships
# bash by default, so this is not an extra dependency on the box.
#
# Manual run/test:
#   sudo /home/ssm-user/thebonelessisland/scripts/ops/pg-backup.sh
set -euo pipefail

ENV_FILE="/etc/boneless-backup.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "pg-backup: missing config file $ENV_FILE (see DEPLOY.md §7) — aborting" >&2
  exit 1
fi

# shellcheck source=/dev/null
. "$ENV_FILE"

if [ -z "${BACKUP_S3_BUCKET:-}" ]; then
  echo "pg-backup: BACKUP_S3_BUCKET is not set in $ENV_FILE — aborting" >&2
  exit 1
fi

# BACKUP_PING_URL (healthchecks.io or similar) is optional — back up
# regardless, just skip the success ping if it's unset.

PG_CONTAINER="${BACKUP_PG_CONTAINER:-boneless-postgres}"
PG_USER="${BACKUP_PG_USER:-postgres}"
PG_DATABASE="${BACKUP_PG_DATABASE:-boneless}"
UPLOADS_VOLUME="${BACKUP_UPLOADS_VOLUME:-boneless_uploads}"
TIMESTAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)

echo "pg-backup: starting run at $TIMESTAMP"

# ── 1. Postgres dump ────────────────────────────────────────────────────────
# `docker exec` (not `docker run`) — the dump must hit the LIVE database
# through the running postgres container, not a fresh throwaway one. Piped
# straight through gzip and into `aws s3 cp -` (stdin) so the full dump never
# touches the box's disk — matters on a 20GB gp3 root volume that also holds
# the Docker image cache.
PG_DUMP_KEY="pg/boneless-${TIMESTAMP}.sql.gz"
echo "pg-backup: dumping database '$PG_DATABASE' from container '$PG_CONTAINER'"
if ! docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" "$PG_DATABASE" \
    | gzip \
    | aws s3 cp - "s3://${BACKUP_S3_BUCKET}/${PG_DUMP_KEY}"; then
  echo "pg-backup: FAILED — postgres dump/upload did not complete (s3://${BACKUP_S3_BUCKET}/${PG_DUMP_KEY})" >&2
  exit 1
fi
echo "pg-backup: postgres dump uploaded to s3://${BACKUP_S3_BUCKET}/${PG_DUMP_KEY}"

# ── 2. Uploads volume ────────────────────────────────────────────────────────
# Forum image uploads live on the named `boneless_uploads` docker volume (see
# infra/docker-compose.yml), not in postgres — pg_dump above doesn't cover
# them. A throwaway `alpine` container mounts the volume read-only and tars
# it straight to stdout; `--rm` cleans it up immediately either way.
UPLOADS_KEY="uploads/boneless-uploads-${TIMESTAMP}.tar.gz"
echo "pg-backup: archiving uploads volume '$UPLOADS_VOLUME'"
if ! docker run --rm \
    -v "${UPLOADS_VOLUME}:/data:ro" \
    alpine:3 \
    tar -czf - -C /data . \
    | aws s3 cp - "s3://${BACKUP_S3_BUCKET}/${UPLOADS_KEY}"; then
  echo "pg-backup: FAILED — uploads volume archive/upload did not complete (s3://${BACKUP_S3_BUCKET}/${UPLOADS_KEY})" >&2
  exit 1
fi
echo "pg-backup: uploads volume archived to s3://${BACKUP_S3_BUCKET}/${UPLOADS_KEY}"

# ── 3. Success ping ──────────────────────────────────────────────────────────
# healthchecks.io (or similar dead-man's-switch monitor): a GET here tells the
# monitor "the cron ran and finished today." If this script errors out above
# (`set -e` + the explicit `exit 1`s), we never reach this line, so a silently
# broken backup shows up as a missed check-in instead of nothing at all.
# `-fsS`: fail on HTTP error, silent on success, but still show real errors.
if [ -n "${BACKUP_PING_URL:-}" ]; then
  if curl -fsS "$BACKUP_PING_URL" > /dev/null; then
    echo "pg-backup: ping sent to BACKUP_PING_URL"
  else
    # Don't fail the whole backup over a ping — the actual data is already
    # safely in S3 by this point. Just note it so it's visible in cron mail
    # /journal output.
    echo "pg-backup: WARNING — success ping to BACKUP_PING_URL failed (backup itself succeeded)" >&2
  fi
fi

echo "pg-backup: run complete"
