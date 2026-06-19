-- Daily per-app snapshots of the crew's rolling 2-week playtime. Steam only
-- exposes the rolling window, so trending deltas ("up vs last fortnight")
-- need history captured over time. One row per app per day; the writer
-- upserts so re-runs within a day are harmless.
CREATE TABLE IF NOT EXISTS crew_trending_snapshots (
  app_id               INTEGER NOT NULL,
  total_minutes_2weeks INTEGER NOT NULL,
  players              INTEGER NOT NULL,
  captured_on          DATE    NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (app_id, captured_on)
);
CREATE INDEX IF NOT EXISTS crew_trending_snapshots_day_idx
  ON crew_trending_snapshots (captured_on);
