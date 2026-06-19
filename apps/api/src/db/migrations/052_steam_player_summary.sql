-- Steam player layer. Nothing called GetPlayerSummaries before — one request
-- covers up to 100 steamids, so the whole guild syncs in a single call. These
-- columns let the site show a Steam persona + avatar, account age, current
-- in-game status, and Steam level alongside the Discord identity. All gated on
-- users.steam_visibility at read time.
ALTER TABLE steam_links ADD COLUMN IF NOT EXISTS persona_name      TEXT;
ALTER TABLE steam_links ADD COLUMN IF NOT EXISTS steam_avatar_url  TEXT;
ALTER TABLE steam_links ADD COLUMN IF NOT EXISTS profile_url       TEXT;
ALTER TABLE steam_links ADD COLUMN IF NOT EXISTS persona_state     INTEGER;   -- 0 offline … 6 looking to trade/play
ALTER TABLE steam_links ADD COLUMN IF NOT EXISTS game_extra_info   TEXT;      -- current in-game title (when in-game)
ALTER TABLE steam_links ADD COLUMN IF NOT EXISTS game_app_id       INTEGER;   -- current in-game app id
ALTER TABLE steam_links ADD COLUMN IF NOT EXISTS time_created      TIMESTAMPTZ; -- account creation (age)
ALTER TABLE steam_links ADD COLUMN IF NOT EXISTS steam_level       INTEGER;
ALTER TABLE steam_links ADD COLUMN IF NOT EXISTS summary_synced_at TIMESTAMPTZ;
