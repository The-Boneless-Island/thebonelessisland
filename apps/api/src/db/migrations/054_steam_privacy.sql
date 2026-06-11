-- Steam library privacy: per-game exclusions + canonical "shareable" views.
--
-- A (member, game) is shareable when the member's library is not private AND the
-- game is not individually excluded. Encoding this once as views means every
-- crew-facing query reads the view; a consumer that forgets to filter is the
-- visible exception, not a silent leak. Achievements gate on the SAME rule
-- because they trivially reveal ownership. The owner's own surfaces keep reading
-- the raw tables (they see everything, including what they've hidden).
--
-- Tier model is collapsed to Private vs Crew-shared at the UI; any legacy
-- 'public' rows already behave as shared under (steam_visibility <> 'private'),
-- and we normalize them to 'members' so the stored value matches the 2-tier UI.

CREATE TABLE IF NOT EXISTS steam_game_exclusions (
  user_id    BIGINT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id     INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, app_id)
);

UPDATE users SET steam_visibility = 'members' WHERE steam_visibility = 'public';

CREATE OR REPLACE VIEW shareable_user_games AS
  SELECT ug.*
  FROM user_games ug
  JOIN users u ON u.id = ug.user_id
  WHERE u.steam_visibility <> 'private'
    AND NOT EXISTS (
      SELECT 1 FROM steam_game_exclusions e
      WHERE e.user_id = ug.user_id AND e.app_id = ug.app_id
    );

CREATE OR REPLACE VIEW shareable_user_game_progress AS
  SELECT p.*
  FROM user_game_progress p
  JOIN users u ON u.id = p.user_id
  WHERE u.steam_visibility <> 'private'
    AND NOT EXISTS (
      SELECT 1 FROM steam_game_exclusions e
      WHERE e.user_id = p.user_id AND e.app_id = p.app_id
    );

CREATE OR REPLACE VIEW shareable_user_wishlists AS
  SELECT w.*
  FROM user_wishlists w
  JOIN users u ON u.id = w.user_id
  WHERE u.steam_visibility <> 'private'
    AND NOT EXISTS (
      SELECT 1 FROM steam_game_exclusions e
      WHERE e.user_id = w.user_id AND e.app_id = w.app_id
    );
