-- News pipeline autopilot: bounded self-healing job + admin settings.

ALTER TABLE news_pipeline_jobs DROP CONSTRAINT IF EXISTS news_pipeline_jobs_job_kind_check;
ALTER TABLE news_pipeline_jobs ADD CONSTRAINT news_pipeline_jobs_job_kind_check
  CHECK (job_kind IN ('embed_backfill', 'recurate', 'autopilot'));

INSERT INTO news_pipeline_jobs (job_kind, state) VALUES
  ('autopilot', 'idle')
ON CONFLICT (job_kind) DO NOTHING;

INSERT INTO server_settings (key, value, label, description, is_secret) VALUES
  (
    'news_autopilot_enabled',
    'true',
    'News autopilot enabled',
    'When true, the server runs a bounded recovery pass (retire stale → ingest → curate → embed) on a schedule instead of only alerting admins.',
    FALSE
  ),
  (
    'news_autopilot_max_curate_batches',
    '10',
    'Autopilot max curation batches',
    'Maximum AI curation batches per autopilot run. Each batch processes up to 24 recent articles on Bedrock.',
    FALSE
  ),
  (
    'news_autopilot_max_embed_rows',
    '200',
    'Autopilot max embed rows',
    'Maximum embedding backfill rows per autopilot run.',
    FALSE
  ),
  (
    'news_autopilot_retire_threshold',
    '100',
    'Autopilot retire stale threshold',
    'When this many uncurated articles are older than the 14-day curation window, autopilot marks them handled before spending AI on them.',
    FALSE
  )
ON CONFLICT (key) DO NOTHING;
