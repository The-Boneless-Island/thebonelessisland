-- Outbox delivery tracking for bot_announcements (bot reliability hardening).
--
-- Today the bot marks every polled row "processed" in a blanket `finally`
-- regardless of whether the Discord send actually succeeded — a transient
-- Discord/gateway blip silently drops the announcement (and, for milestone
-- rows, the tier-role grant that used to live in the same handler) forever,
-- with no record it ever happened.
--
-- `attempts` + `last_error` back a per-row retry contract (see
-- apps/api/src/routes/internal.ts POST /bot/announcements/:id/processed and
-- apps/bot/src/index.ts processPendingAnnouncements): a failed delivery
-- bumps `attempts` and records `last_error` instead of being marked
-- processed, so the outbox poller (`WHERE processed_at IS NULL AND
-- attempts < 5`) retries it on the next 30s tick. After 5 failed attempts
-- the row is dead-lettered (processed_at set, last_error kept as the
-- tombstone) so a permanently-broken row (bad channel id, missing
-- permissions) can't retry forever.
--
-- Safe to re-run — IF NOT EXISTS on both columns.

ALTER TABLE bot_announcements
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT;
