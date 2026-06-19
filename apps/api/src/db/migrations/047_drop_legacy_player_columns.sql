-- Drop the legacy games player/session columns. These were hardcoded defaults
-- (min_players=1, max_players=8, median_session_minutes=60) that NOTHING ever
-- wrote — the recommender, blurb, featured passthrough, crew-games/wishlist
-- queries, game-nights, and Library were all migrated onto the real migration-045
-- capability signal (is_*_coop / is_online_pvp / is_mmo / mp_max_players_approx),
-- so these three columns now have zero readers. Verified: no SELECT/WHERE/UPDATE
-- references remain in apps/api or packages/shared (only this drop + comments).
--
-- IRREVERSIBLE: this physically removes the columns. The fallback branch /
-- backup tag taken before this release is the rollback path if needed.
ALTER TABLE games DROP COLUMN IF EXISTS min_players;
ALTER TABLE games DROP COLUMN IF EXISTS max_players;
ALTER TABLE games DROP COLUMN IF EXISTS median_session_minutes;
