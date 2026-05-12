-- General news AI output v3: rewritten title, sources list, validation/retry tracking.

ALTER TABLE general_news ADD COLUMN IF NOT EXISTS ai_title                    TEXT;
ALTER TABLE general_news ADD COLUMN IF NOT EXISTS ai_sources                  TEXT[];
ALTER TABLE general_news ADD COLUMN IF NOT EXISTS ai_retry_count              INTEGER NOT NULL DEFAULT 0;
ALTER TABLE general_news ADD COLUMN IF NOT EXISTS ai_validation_failed        BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE general_news ADD COLUMN IF NOT EXISTS ai_last_validation_errors   TEXT[];

CREATE INDEX IF NOT EXISTS general_news_validation_failed_idx
  ON general_news(ai_validation_failed) WHERE ai_validation_failed = TRUE;
