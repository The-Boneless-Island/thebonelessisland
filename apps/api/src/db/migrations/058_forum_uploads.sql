-- Forums v2 — Phase C: image uploads.
-- Every accepted image is re-encoded by sharp to WebP (+ a thumbnail) before
-- it is written to disk, which strips EXIF/GPS and neutralizes MIME spoofing.
-- A row is created at upload time (post_id NULL) and claimed when the owning
-- post is created.

CREATE TABLE IF NOT EXISTS forum_uploads (
  id               BIGSERIAL PRIMARY KEY,
  uploader_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id          BIGINT REFERENCES forum_posts(id) ON DELETE SET NULL,
  file_path        TEXT NOT NULL,   -- relative to the uploads dir, e.g. forums/2026/06/<uuid>.webp
  thumb_path       TEXT NOT NULL,
  width            INT NOT NULL,
  height           INT NOT NULL,
  bytes            INT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS forum_uploads_post_idx ON forum_uploads(post_id);
CREATE INDEX IF NOT EXISTS forum_uploads_uploader_idx ON forum_uploads(uploader_user_id, created_at);
