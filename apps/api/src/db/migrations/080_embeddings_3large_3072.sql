-- Resize the embedding column to 3072 dims for OpenAI text-embedding-3-large.
--
-- Strategy (mirrors 072 pattern):
--   1. Guard the whole block behind pgvector availability.
--   2. Drop the existing index and column (wipe old 1024-dim Titan vectors).
--   3. Auto-detect halfvec support (pgvector >= 0.7):
--        halfvec  → add embedding halfvec(3072) + HNSW halfvec_cosine_ops index
--        vector   → add embedding vector(3072) with NO ANN index
--                   (3072 exceeds ivfflat/hnsw's 2000-dim limit on older pgvector;
--                    sequential cosine scan is fast enough at our corpus size)
--   4. Wire up the new server_settings key for embedding model selection.
--
-- Idempotent: each step uses IF EXISTS / IF NOT EXISTS guards.
-- Note: existing vectors are lost (DROP COLUMN). Re-embed via backfillEmbeddings()
-- post-deploy; articles, summaries, and cards are untouched.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN

    -- 1. Drop the old index and column (1024-dim Titan vectors).
    DROP INDEX IF EXISTS general_news_embedding_idx;
    ALTER TABLE general_news DROP COLUMN IF EXISTS embedding;

    -- 2. Add the resized column + index based on pgvector capabilities.
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'halfvec') THEN
      -- pgvector >= 0.7: halfvec stores FP16 half-precision — half the storage
      -- of float4 vector, same cosine quality, HNSW supported at any dim.
      EXECUTE 'ALTER TABLE general_news ADD COLUMN embedding halfvec(3072)';
      EXECUTE 'CREATE INDEX IF NOT EXISTS general_news_embedding_idx
                 ON general_news USING hnsw (embedding halfvec_cosine_ops)';
    ELSE
      -- Older pgvector: ivfflat/hnsw cap at 2000 dims; use sequential scan.
      -- At our corpus size (<50k rows) a seq scan with vector_cosine_ops is
      -- well under 100ms. We can add an index after an upgrade later.
      EXECUTE 'ALTER TABLE general_news ADD COLUMN embedding vector(3072)';
      -- No ANN index: sequential cosine scan only.
    END IF;

  ELSE
    RAISE NOTICE 'pgvector extension not found — embedding column not created. Install pgvector and re-run this migration.';
  END IF;
END $$;

-- Embedding model selection setting.
-- Default is blank so the app falls back to text-embedding-3-large (the
-- hard-coded DEFAULT_EMBEDDING_MODEL constant). Admin can override with:
--   text-embedding-3-large  (OpenAI, 3072-dim native)
--   text-embedding-3-small  (OpenAI, truncated to 3072 via Matryoshka)
--   gemini-embedding-001    (Google, truncated to 3072 via outputDimensionality)
--   amazon.titan-embed-text-v2:0  (Bedrock, max 1024-dim — INCOMPATIBLE with 3072 schema)
INSERT INTO server_settings (key, value, label, description, is_secret) VALUES
  (
    'ai_embedding_model',
    '',
    'Embedding model',
    'Model used for article embedding / semantic dedup. Empty = text-embedding-3-large (OpenAI, 3072 dims). Also accepted: text-embedding-3-small, gemini-embedding-001. Titan v2 is incompatible with the current 3072-dim schema and will be treated as unavailable.',
    FALSE
  )
ON CONFLICT (key) DO NOTHING;
