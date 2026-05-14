-- News source registry — replaces the hardcoded RSS map + CSV setting with
-- a DB-driven table that holds curated presets AND admin-added custom URLs
-- AND keyed API services (Reddit, YouTube, GNews) behind a uniform schema.
--
-- The orchestrator iterates `enabled = TRUE` rows and dispatches each to its
-- per-kind NewsProvider. Curated rows are reseeded on every boot via
-- ON CONFLICT DO NOTHING so admin edits to display name/identifier persist
-- but new curated sources show up automatically.

CREATE TABLE IF NOT EXISTS news_source_registry (
  id              BIGSERIAL PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('rss', 'reddit', 'youtube', 'gnews')),
  slug            TEXT NOT NULL,                       -- stable id: "pcgamer", "reddit-pcgaming", "yt-skillup"
  name            TEXT NOT NULL,                       -- display label
  identifier      TEXT NOT NULL,                       -- RSS URL, subreddit name, or YouTube channel ID
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  is_preset       BOOLEAN NOT NULL DEFAULT TRUE,       -- false = admin-added, may be deleted
  config          JSONB NOT NULL DEFAULT '{}',         -- provider-specific knobs (region, lang, etc.)
  last_fetched_at TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, slug)
);

CREATE INDEX IF NOT EXISTS news_source_registry_enabled_idx
  ON news_source_registry (enabled, kind);

-- ── Server settings additions ───────────────────────────────────────────────

INSERT INTO server_settings (key, value, label, description, is_secret) VALUES
  (
    'youtube_api_key',
    '',
    'YouTube API Key',
    'Optional YouTube Data API v3 key. When set, the news pipeline pulls recent uploads from configured gaming channels. Get a free key at console.cloud.google.com (10,000 units/day on the free tier).',
    TRUE
  ),
  (
    'reddit_user_agent',
    'boneless-island-news-bot/1.0',
    'Reddit User-Agent',
    'User-Agent string sent when polling public subreddit RSS. Reddit asks for a unique identifier per app. Edit only if you need to comply with Reddit''s API guidelines.',
    FALSE
  )
ON CONFLICT (key) DO NOTHING;
