-- Serial pipeline queue: one worker drains jobs instead of competing advisory locks.

CREATE TABLE IF NOT EXISTS news_pipeline_queue (
  id          BIGSERIAL PRIMARY KEY,
  job_kind    TEXT NOT NULL CHECK (job_kind IN ('ingest', 'curate', 'autopilot', 'retire_stale')),
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority    INT NOT NULL DEFAULT 0,
  state       TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'running', 'done', 'failed', 'cancelled')),
  dedupe_key  TEXT,
  result      JSONB NOT NULL DEFAULT '{}'::jsonb,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS news_pipeline_queue_pending_idx
  ON news_pipeline_queue (state, priority DESC, created_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS news_pipeline_queue_dedupe_pending_idx
  ON news_pipeline_queue (dedupe_key)
  WHERE state = 'pending' AND dedupe_key IS NOT NULL;

INSERT INTO server_settings (key, value, label, description, is_secret) VALUES
  (
    'news_pipeline_queue_enabled',
    'true',
    'News pipeline queue enabled',
    'When true, ingest/curate/autopilot run through a single serial queue instead of competing for the pipeline lock (recommended).',
    FALSE
  )
ON CONFLICT (key) DO NOTHING;
