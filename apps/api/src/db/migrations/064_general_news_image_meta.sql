-- Cover-image provenance + dimensions for general_news.
-- Lets ingestion scrape a large og:image when the feed ships no image, record
-- where the image came from, and (later) gate Hero eligibility on size.
--   image_source      — 'feed' | 'og' | 'twitter' | 'img' | 'none'
--   image_resolved_at — scrape-once guard (set even on failure)
--   image_width/height — pixel dims when known (from og:image meta)
ALTER TABLE general_news
  ADD COLUMN IF NOT EXISTS image_source      TEXT,
  ADD COLUMN IF NOT EXISTS image_resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS image_width       INT,
  ADD COLUMN IF NOT EXISTS image_height      INT;
