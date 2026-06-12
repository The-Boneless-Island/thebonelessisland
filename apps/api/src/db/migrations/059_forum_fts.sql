-- Forums v2 — Phase D: full-text search.
-- Generated, stored tsvector columns (title weighted higher than body) with
-- GIN indexes. Search queries use websearch_to_tsquery + ts_headline snippets.

ALTER TABLE forum_threads
  ADD COLUMN IF NOT EXISTS title_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, ''))) STORED;

ALTER TABLE forum_posts
  ADD COLUMN IF NOT EXISTS body_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(body, ''))) STORED;

CREATE INDEX IF NOT EXISTS forum_threads_title_tsv_idx ON forum_threads USING GIN (title_tsv);
CREATE INDEX IF NOT EXISTS forum_posts_body_tsv_idx   ON forum_posts  USING GIN (body_tsv);
