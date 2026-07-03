-- Allow the one-shot off-topic sweep to persist its run-once guard.
--
-- newsOffTopicSweep.ts (news-quality PR #87) writes a news_pipeline_jobs row
-- with job_kind 'offtopic_sweep', but 073 created the table with a CHECK
-- limiting job_kind to ('embed_backfill', 'recurate') (extended to 'autopilot'
-- in 074). The guard INSERT therefore violated the constraint on every boot and
-- the sweep aborted before doing any work — which is why off-topic cards
-- survived the first deploy. Same extend pattern as 074.

ALTER TABLE news_pipeline_jobs DROP CONSTRAINT IF EXISTS news_pipeline_jobs_job_kind_check;
ALTER TABLE news_pipeline_jobs ADD CONSTRAINT news_pipeline_jobs_job_kind_check
  CHECK (job_kind IN ('embed_backfill', 'recurate', 'autopilot', 'offtopic_sweep'));

INSERT INTO news_pipeline_jobs (job_kind, state) VALUES
  ('offtopic_sweep', 'idle')
ON CONFLICT (job_kind) DO NOTHING;
