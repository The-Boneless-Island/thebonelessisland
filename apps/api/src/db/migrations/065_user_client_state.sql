-- Per-user key/value store for client-side state that benefits from server
-- persistence: onboarding progress, forum intro seen, Steam share ack, theme
-- preference, achievement cursor, activity last-seen.  One extensible table
-- beats a column-per-flag: a new "seen / pref" key requires no migration.
--
-- key whitelist is enforced at the API layer (clientState.ts).
-- ON DELETE CASCADE: rows vanish automatically when the user is deleted.

CREATE TABLE IF NOT EXISTS user_client_state (
  user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT        NOT NULL,
  value      JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
