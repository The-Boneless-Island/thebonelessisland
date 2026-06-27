-- Extend serial pipeline queue with long-running admin jobs.

ALTER TABLE news_pipeline_queue DROP CONSTRAINT IF EXISTS news_pipeline_queue_job_kind_check;

ALTER TABLE news_pipeline_queue
  ADD CONSTRAINT news_pipeline_queue_job_kind_check
  CHECK (job_kind IN ('ingest', 'curate', 'autopilot', 'retire_stale', 'recurate', 'embed_backfill'));
