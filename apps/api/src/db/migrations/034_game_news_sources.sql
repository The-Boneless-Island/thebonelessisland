-- Per-game patch/news source registry. Steam GetNewsForApp remains implicit
-- (every app in `games` is queried via the API automatically); this table
-- registers extra RSS/Atom feeds per game (subreddits, official feeds, etc.).

CREATE TABLE IF NOT EXISTS game_news_sources (
  id          BIGSERIAL PRIMARY KEY,
  app_id      INTEGER NOT NULL REFERENCES games(app_id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('rss', 'atom')),
  source_url  TEXT NOT NULL,
  label       TEXT,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  fetched_at  TIMESTAMPTZ,
  last_error  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (app_id, source_url)
);

CREATE INDEX IF NOT EXISTS game_news_sources_app_idx ON game_news_sources(app_id);
CREATE INDEX IF NOT EXISTS game_news_sources_fetched_idx ON game_news_sources(fetched_at NULLS FIRST);

-- Tag rows in game_news with which source produced them (for display + analytics).
ALTER TABLE game_news ADD COLUMN IF NOT EXISTS source_kind  TEXT NOT NULL DEFAULT 'steam';
ALTER TABLE game_news ADD COLUMN IF NOT EXISTS source_label TEXT;
