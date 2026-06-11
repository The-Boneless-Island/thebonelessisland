-- Weekly "Tide" digest snapshots. Each row stores the fully computed
-- DigestPayload as jsonb, keyed by the ISO week start (Monday). UPSERTed on
-- week_start so re-running within the same week refreshes the snapshot.
CREATE TABLE IF NOT EXISTS weekly_digests (
  id           BIGSERIAL PRIMARY KEY,
  week_start   DATE NOT NULL UNIQUE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload      JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS weekly_digests_week_start_idx ON weekly_digests (week_start DESC);
