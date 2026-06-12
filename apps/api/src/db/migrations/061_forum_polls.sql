-- Forums v2 — Phase G: optional poll attached to a thread.
-- One poll per thread; 2–10 options; single- or multi-choice; optional close time.

CREATE TABLE IF NOT EXISTS forum_polls (
  id         BIGSERIAL PRIMARY KEY,
  thread_id  BIGINT NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  question   TEXT NOT NULL,
  multi      BOOLEAN NOT NULL DEFAULT FALSE,
  closes_at  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (thread_id)
);

CREATE TABLE IF NOT EXISTS forum_poll_options (
  id        BIGSERIAL PRIMARY KEY,
  poll_id   BIGINT NOT NULL REFERENCES forum_polls(id) ON DELETE CASCADE,
  position  INT NOT NULL,
  label     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS forum_poll_options_poll_idx ON forum_poll_options(poll_id, position);

CREATE TABLE IF NOT EXISTS forum_poll_votes (
  poll_id    BIGINT NOT NULL REFERENCES forum_polls(id) ON DELETE CASCADE,
  option_id  BIGINT NOT NULL REFERENCES forum_poll_options(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (poll_id, option_id, user_id)
);
CREATE INDEX IF NOT EXISTS forum_poll_votes_option_idx ON forum_poll_votes(option_id);
