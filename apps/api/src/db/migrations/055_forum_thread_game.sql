-- Forum threads can optionally tag a game (Steam appId). Gaming-category
-- threads about a specific title get capsule art in feeds; the column joins
-- against games(app_id) for name/art so nothing is denormalized.
ALTER TABLE forum_threads ADD COLUMN IF NOT EXISTS app_id INTEGER;
CREATE INDEX IF NOT EXISTS forum_threads_app_idx ON forum_threads(app_id) WHERE app_id IS NOT NULL;
