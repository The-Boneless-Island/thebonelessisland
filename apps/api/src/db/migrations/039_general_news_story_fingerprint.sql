-- AI-assigned semantic fingerprint per curated story. Format is a normalized
-- lowercase kebab tag combining the primary entity and event topic, e.g.
-- "poe2:1-0-launch-roadmap", "ea:layoffs-2026q1", "epic:fortnite-chapter-6".
-- Used to find merge candidates across cluster-key boundaries (cross-game
-- industry stories that the heuristic title-regex misses).

ALTER TABLE general_news
  ADD COLUMN IF NOT EXISTS ai_story_fingerprint TEXT;

-- Partial index — only curated primary cards need to be looked up by fingerprint.
CREATE INDEX IF NOT EXISTS general_news_story_fingerprint_idx
  ON general_news (ai_story_fingerprint, published_at DESC)
  WHERE ai_curated_at IS NOT NULL AND ai_relevance_score > 0;
