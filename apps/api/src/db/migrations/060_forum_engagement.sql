-- Forums v2 — Phase E: subscriptions, read tracking, notifications.

CREATE TABLE IF NOT EXISTS forum_thread_subscriptions (
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id  BIGINT NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, thread_id)
);

CREATE TABLE IF NOT EXISTS forum_thread_reads (
  user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id         BIGINT NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  last_read_post_id BIGINT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, thread_id)
);

CREATE TABLE IF NOT EXISTS forum_notifications (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('mention','reply')),
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  thread_id     BIGINT REFERENCES forum_threads(id) ON DELETE CASCADE,
  post_id       BIGINT REFERENCES forum_posts(id) ON DELETE CASCADE,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS forum_notifications_user_idx
  ON forum_notifications (user_id, read_at, created_at DESC);
