-- News pipeline tiers: retention, member prefs, source quality, job persistence, search.

ALTER TABLE general_news
  ADD COLUMN IF NOT EXISTS retention_tier TEXT NOT NULL DEFAULT 'hot',
  ADD COLUMN IF NOT EXISTS primary_id INTEGER REFERENCES general_news(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_app_id INTEGER REFERENCES games(app_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS search_vector tsvector,
  ADD COLUMN IF NOT EXISTS pre_filter_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'general_news_retention_tier_check'
  ) THEN
    ALTER TABLE general_news
      ADD CONSTRAINT general_news_retention_tier_check
      CHECK (retention_tier IN ('hot', 'warm', 'archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS general_news_retention_tier_idx
  ON general_news (retention_tier, published_at DESC);

CREATE INDEX IF NOT EXISTS general_news_search_vector_idx
  ON general_news USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS general_news_linked_app_idx
  ON general_news (linked_app_id)
  WHERE linked_app_id IS NOT NULL;

-- Member read tracking (for future ranking; optional writes from UI).
CREATE TABLE IF NOT EXISTS general_news_reads (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  news_id   INTEGER NOT NULL REFERENCES general_news(id) ON DELETE CASCADE,
  read_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, news_id)
);

CREATE INDEX IF NOT EXISTS general_news_reads_user_idx
  ON general_news_reads (user_id, read_at DESC);

-- Per-member mutes: hide a source, tag, or game title from the feed.
CREATE TABLE IF NOT EXISTS general_news_mutes (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('source', 'tag', 'game')),
  value      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, kind, value)
);

CREATE INDEX IF NOT EXISTS general_news_mutes_user_idx
  ON general_news_mutes (user_id);

-- Source quality counters for admin yield monitoring.
ALTER TABLE news_source_registry
  ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fail_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS items_fetched_total BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS items_curated_total BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS validation_fail_total BIGINT NOT NULL DEFAULT 0;

-- Persistent background job snapshots (survives restarts for admin UI).
CREATE TABLE IF NOT EXISTS news_pipeline_jobs (
  job_kind    TEXT PRIMARY KEY CHECK (job_kind IN ('embed_backfill', 'recurate')),
  state       TEXT NOT NULL DEFAULT 'idle',
  progress    JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO news_pipeline_jobs (job_kind, state) VALUES
  ('embed_backfill', 'idle'),
  ('recurate', 'idle')
ON CONFLICT (job_kind) DO NOTHING;

-- Retention + feed tuning (admin-configurable).
INSERT INTO server_settings (key, value, label, description, is_secret) VALUES
  (
    'news_retention_hot_days',
    '90',
    'News hot tier (days)',
    'Articles younger than this stay in the hot tier: full text, embeddings, and auto-curation window eligibility.',
    FALSE
  ),
  (
    'news_retention_warm_days',
    '365',
    'News warm tier (days)',
    'Articles between hot and warm age keep title/summary/tags for search but raw contents and embeddings are stripped.',
    FALSE
  ),
  (
    'news_retention_prune_validation_days',
    '45',
    'Prune validation failures (days)',
    'Delete articles that failed AI validation and are older than this many days.',
    FALSE
  ),
  (
    'news_retention_prune_uncurated_days',
    '45',
    'Prune never-curated backlog (days)',
    'Delete articles that were ingested but never curated and are older than this many days.',
    FALSE
  ),
  (
    'news_feed_freshness_days',
    '45',
    'Public feed freshness window (days)',
    'Primary feed shows curated cards from this window. High-scoring older stories (score ≥ 0.85) may still appear as evergreen picks.',
    FALSE
  ),
  (
    'news_stale_ingest_hours',
    '6',
    'Stale feed ingest threshold (hours)',
    'When page-load ingest is off, background ingest runs only if the newest live card is older than this.',
    FALSE
  ),
  (
    'news_ingest_on_page_load',
    'false',
    'Ingest on every news page load',
    'When true, every visit to Gaming News triggers a background ingest (legacy behaviour). When false, ingest waits until the feed is stale or the 4-hour cron fires.',
    FALSE
  )
ON CONFLICT (key) DO NOTHING;
