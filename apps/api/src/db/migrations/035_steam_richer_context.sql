-- Crew Steam community affiliations (mod communities, fan groups, esports).
-- Signals which "community" articles the AI curator should weight higher.
CREATE TABLE IF NOT EXISTS user_steam_groups (
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id    TEXT   NOT NULL,
  group_name  TEXT,
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, group_id)
);
CREATE INDEX IF NOT EXISTS user_steam_groups_group_idx ON user_steam_groups(group_id);

-- Per-user achievement progress. Synced only for top-N owned-by-playtime per
-- user. Rows with has_stats_api=false skipped from future syncs (Steam returns
-- "Requested app has no stats" for games without an achievement API).
CREATE TABLE IF NOT EXISTS user_game_progress (
  user_id                BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id                 INTEGER NOT NULL REFERENCES games(app_id) ON DELETE CASCADE,
  achievements_unlocked  INTEGER,
  achievements_total     INTEGER,
  completion_pct         NUMERIC(5,2),
  has_stats_api          BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, app_id)
);
CREATE INDEX IF NOT EXISTS user_game_progress_app_idx ON user_game_progress(app_id);

-- Sync cooldown tracking (24h for these — less volatile than owned-games).
ALTER TABLE steam_links ADD COLUMN IF NOT EXISTS groups_synced_at       TIMESTAMPTZ;
ALTER TABLE steam_links ADD COLUMN IF NOT EXISTS achievements_synced_at TIMESTAMPTZ;
