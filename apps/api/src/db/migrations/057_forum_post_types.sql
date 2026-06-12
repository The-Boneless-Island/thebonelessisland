-- Forums v2 — Phase B: post types, resource links, link-preview cache,
-- reaction rename, and new forum settings.

-- 1. Post type + optional primary link on threads.
ALTER TABLE forum_threads
  ADD COLUMN IF NOT EXISTS thread_type TEXT NOT NULL DEFAULT 'discussion'
    CHECK (thread_type IN ('discussion','memory','recommendation','resource')),
  ADD COLUMN IF NOT EXISTS link_url TEXT;

CREATE INDEX IF NOT EXISTS forum_threads_type_idx
  ON forum_threads(thread_type) WHERE is_deleted = FALSE;

-- 2. Server-side OpenGraph/link-preview cache. Keyed by URL; populated at
--    thread-create time by the SSRF-guarded unfurler. status='failed' rows
--    are kept so we don't retry a dead URL more than once per day.
CREATE TABLE IF NOT EXISTS forum_link_previews (
  url          TEXT PRIMARY KEY,
  title        TEXT,
  description  TEXT,
  image_url    TEXT,
  site_name    TEXT,
  status       TEXT NOT NULL DEFAULT 'ok',
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Reaction rename: legacy single 'like' becomes the v2 'nug'. Dedupe first
--    in case Phase A already wrote a 'nug' for the same (post,user) — the PK is
--    (post_id, user_id, reaction), so a blind UPDATE could collide.
DELETE FROM forum_post_reactions a
 WHERE a.reaction = 'like'
   AND EXISTS (
     SELECT 1 FROM forum_post_reactions b
     WHERE b.post_id = a.post_id AND b.user_id = a.user_id AND b.reaction = 'nug'
   );
UPDATE forum_post_reactions SET reaction = 'nug' WHERE reaction = 'like';

-- 4. New forum settings. Webhook URL is secret (contains a token).
INSERT INTO server_settings (key, value, label, description, is_secret) VALUES
  ('forums_discord_webhook_url', '', 'Forums: Discord announce webhook', 'Discord webhook URL for new-thread announcements (empty = off)', true),
  ('forums_upload_max_mb',       '8',  'Forums: upload max size (MB)',  'Maximum size of a single forum image upload',                false),
  ('forums_upload_per_hour',     '20', 'Forums: uploads per hour',       'Max image uploads per user per hour',                        false)
ON CONFLICT (key) DO NOTHING;
