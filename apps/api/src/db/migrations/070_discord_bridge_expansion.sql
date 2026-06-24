-- Discord bridge expansion: official forum announcements + patch alerts.

-- Forum: auto-push categories (e.g. Announcements) and Discord message tracking for edit sync.
ALTER TABLE forum_categories
  ADD COLUMN IF NOT EXISTS auto_discord_bridge BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE forum_threads
  ADD COLUMN IF NOT EXISTS discord_announcement_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS discord_announcement_message_id TEXT;

-- Patch alerts: track which game_news rows were pushed to Discord.
ALTER TABLE game_news
  ADD COLUMN IF NOT EXISTS discord_announced_at TIMESTAMPTZ;

-- Optional per-game Discord role pings for patch alerts.
CREATE TABLE IF NOT EXISTS patch_alert_roles (
  app_id INTEGER NOT NULL REFERENCES games(app_id) ON DELETE CASCADE,
  discord_role_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (app_id)
);

-- Official announcements category — Parent-only posting, auto Discord bridge.
INSERT INTO forum_categories (slug, name, description, icon, accent_color, position, is_locked, auto_discord_bridge)
VALUES (
  'announcements',
  'Announcements',
  'Official news from the island crew. Parent admins only.',
  '📣',
  '#f59e0b',
  -1,
  TRUE,
  TRUE
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  accent_color = EXCLUDED.accent_color,
  position = EXCLUDED.position,
  is_locked = EXCLUDED.is_locked,
  auto_discord_bridge = EXCLUDED.auto_discord_bridge;

-- Discord Bridge settings
INSERT INTO server_settings (key, value, label, description, is_secret) VALUES
  ('official_announcements_enabled',
   'false',
   'Official Announcements: enabled',
   'When ON, new threads in the Announcements forum category are pushed to the configured Discord channel.',
   FALSE),
  ('official_announcements_channel_id',
   '',
   'Official Announcements: channel ID',
   'Discord channel ID for official announcement embeds from the Announcements forum category.',
   FALSE),
  ('official_announcements_ping_everyone',
   'false',
   'Official Announcements: ping @everyone',
   'When ON, each official announcement includes an @everyone mention. Default OFF — members use Discord channel notification settings.',
   FALSE),
  ('patch_alerts_enabled',
   'false',
   'Patch Alerts: enabled',
   'When ON, new patch notes for crew-library games are posted to the patch-notes Discord channel.',
   FALSE),
  ('patch_notes_channel_id',
   '',
   'Patch Alerts: channel ID',
   'Discord channel ID for crew-library game patch note embeds.',
   FALSE)
ON CONFLICT (key) DO NOTHING;
