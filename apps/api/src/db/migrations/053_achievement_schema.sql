-- Achievement schema + global rarity, and a tracked historical-low price.
--
-- game_achievements caches Steam's per-achievement metadata (GetSchemaForGame:
-- display name, description, icons, hidden flag) plus global unlock rarity
-- (GetGameAchievementStats). Both are free, static-ish, and keyed by app — so we
-- sync per game (lazily, on game-detail view) and cache forever, refreshing
-- rarity occasionally. This lets the UI show real achievement icons + "unlocked
-- by 2.3% of players" instead of bare numeric counts.
CREATE TABLE IF NOT EXISTS game_achievements (
  app_id            INTEGER NOT NULL,
  api_name          TEXT NOT NULL,
  display_name      TEXT,
  description       TEXT,
  icon_url          TEXT,
  icon_gray_url     TEXT,
  hidden            BOOLEAN NOT NULL DEFAULT FALSE,
  global_unlock_pct REAL,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (app_id, api_name)
);

CREATE INDEX IF NOT EXISTS idx_game_achievements_rarity
  ON game_achievements (app_id, global_unlock_pct);

-- Lowest price we've ever observed for a game (self-accumulated via LEAST on
-- each price sync — zero extra API calls). Powers "lowest ever $X" on wishlist.
ALTER TABLE games ADD COLUMN IF NOT EXISTS historical_low_cents INTEGER;
