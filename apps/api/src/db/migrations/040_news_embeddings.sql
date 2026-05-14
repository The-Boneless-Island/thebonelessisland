-- Add pgvector-based embeddings to general_news for deterministic clustering.
-- Approach mirrors Ground News / Particle / Google News: embed each article,
-- find existing primary stories via cosine similarity, absorb new article as
-- a sibling instead of generating a redundant LLM summary.
--
-- The CREATE EXTENSION call is wrapped so that a Postgres install missing the
-- pgvector binary doesn't brick this migration. If the extension is absent,
-- the embedding column / index simply skip and the application gracefully
-- falls back to the existing fingerprint-only clustering path.

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgvector extension unavailable — embedding clustering disabled. Install pgvector and re-run this migration to enable.';
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    -- text-embedding-3-small returns 1536-dim vectors.
    EXECUTE 'ALTER TABLE general_news ADD COLUMN IF NOT EXISTS embedding vector(1536)';
    -- ivfflat index for fast cosine-similarity nearest-neighbor lookup.
    -- 100 lists is a good default for tables up to ~1M rows.
    EXECUTE 'CREATE INDEX IF NOT EXISTS general_news_embedding_idx
               ON general_news USING ivfflat (embedding vector_cosine_ops)
               WITH (lists = 100)';
  END IF;
END $$;
