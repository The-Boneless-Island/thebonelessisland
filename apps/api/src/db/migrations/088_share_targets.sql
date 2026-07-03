-- Share-to-Discord: member-facing "send to a channel" feature (WS5).
-- Replaces the old thin navigator.share buttons on Gaming News with a
-- picker over admin-curated Discord channels. The bot_announcements outbox
-- (kind = 'member.share') carries delivery; this table is just the admin's
-- curated channel list.

CREATE TABLE IF NOT EXISTS share_targets (
  id                 BIGSERIAL PRIMARY KEY,
  discord_channel_id TEXT NOT NULL UNIQUE,
  label              TEXT NOT NULL,
  emoji              TEXT,
  position           INT NOT NULL DEFAULT 0,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS share_targets_active_position_idx
  ON share_targets (position)
  WHERE is_active = TRUE;

-- Global kill-switch, same ON CONFLICT DO NOTHING style as
-- 070_discord_bridge_expansion.sql.
INSERT INTO server_settings (key, value, label, description, is_secret) VALUES
  ('share_enabled',
   'true',
   'Sharing: enabled',
   'Turn off the share-to-Discord feature sitewide.',
   FALSE)
ON CONFLICT (key) DO NOTHING;
