-- Steam privacy trust check. Inserts throwaway fixtures, asserts the shareable_*
-- views and exclusion rules hide exactly what they must, then ROLLS BACK so the
-- database is untouched. Run post-deploy:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/src/db/checks/steam_privacy_check.sql
--
-- Any failed assertion RAISEs EXCEPTION and aborts with a non-zero exit. A clean
-- run prints "STEAM PRIVACY CHECK PASSED". Uses high synthetic ids to avoid
-- colliding with real data; everything is rolled back regardless.

BEGIN;

-- Fixtures: app 990001 (shared), 990002 (excluded by a sharer), 990003 (private user's).
INSERT INTO games (app_id, name) VALUES
  (990001, 'PRIVCHK Shared'),
  (990002, 'PRIVCHK Excluded'),
  (990003, 'PRIVCHK PrivateUser')
ON CONFLICT (app_id) DO NOTHING;

-- Users: sharer (members), private.
INSERT INTO users (id, discord_user_id, steam_visibility) VALUES
  (990000001, '990000000000000001', 'members'),
  (990000002, '990000000000000002', 'private')
ON CONFLICT (id) DO NOTHING;

-- Sharer owns 990001 (visible) and 990002 (will be excluded).
INSERT INTO user_games (user_id, app_id, playtime_minutes, playtime_2weeks) VALUES
  (990000001, 990001, 100, 10),
  (990000001, 990002, 100, 10)
ON CONFLICT (user_id, app_id) DO NOTHING;
-- Private user owns 990003 (must never surface).
INSERT INTO user_games (user_id, app_id, playtime_minutes, playtime_2weeks) VALUES
  (990000002, 990003, 100, 10)
ON CONFLICT (user_id, app_id) DO NOTHING;

INSERT INTO user_game_progress (user_id, app_id, achievements_unlocked, achievements_total, completion_pct) VALUES
  (990000001, 990002, 5, 10, 50),
  (990000002, 990003, 5, 10, 50)
ON CONFLICT (user_id, app_id) DO NOTHING;

INSERT INTO user_wishlists (user_id, app_id) VALUES
  (990000001, 990002),
  (990000002, 990003)
ON CONFLICT DO NOTHING;

-- Exclude 990002 for the sharer.
INSERT INTO steam_game_exclusions (user_id, app_id) VALUES (990000001, 990002)
ON CONFLICT DO NOTHING;

DO $$
DECLARE n INT;
BEGIN
  -- Sharer's non-excluded game IS shareable.
  SELECT COUNT(*) INTO n FROM shareable_user_games WHERE user_id = 990000001 AND app_id = 990001;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: sharer non-excluded game 990001 not shareable (got %)', n; END IF;

  -- Sharer's EXCLUDED game is NOT shareable (owned + progress + wishlist).
  SELECT COUNT(*) INTO n FROM shareable_user_games WHERE user_id = 990000001 AND app_id = 990002;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: excluded game 990002 leaked into shareable_user_games (got %)', n; END IF;
  SELECT COUNT(*) INTO n FROM shareable_user_game_progress WHERE user_id = 990000001 AND app_id = 990002;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: excluded game 990002 achievements leaked (got %)', n; END IF;
  SELECT COUNT(*) INTO n FROM shareable_user_wishlists WHERE user_id = 990000001 AND app_id = 990002;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: excluded game 990002 wishlist leaked (got %)', n; END IF;

  -- Private user's data NEVER surfaces (owned + progress + wishlist).
  SELECT COUNT(*) INTO n FROM shareable_user_games WHERE user_id = 990000002;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: private user library leaked into shareable_user_games (got %)', n; END IF;
  SELECT COUNT(*) INTO n FROM shareable_user_game_progress WHERE user_id = 990000002;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: private user achievements leaked (got %)', n; END IF;
  SELECT COUNT(*) INTO n FROM shareable_user_wishlists WHERE user_id = 990000002;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: private user wishlist leaked (got %)', n; END IF;

  RAISE NOTICE 'STEAM PRIVACY CHECK PASSED';
END $$;

ROLLBACK;
