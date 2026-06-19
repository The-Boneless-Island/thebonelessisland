-- Steam store appdetails enrichment: persist real capability + price/release
-- data so the recommender stops relying on dead hardcoded session/player
-- defaults. Capability booleans are derived from Steam category ids; price and
-- release columns from price_overview / release_date. Existing min_players /
-- max_players / median_session_minutes columns are intentionally kept in place
-- (not dropped this release) — we just stop trusting them for honest data.

-- Capability flags (derived from Steam category ids).
ALTER TABLE games ADD COLUMN IF NOT EXISTS is_single_player     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE games ADD COLUMN IF NOT EXISTS is_online_coop       BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE games ADD COLUMN IF NOT EXISTS is_lan_coop          BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE games ADD COLUMN IF NOT EXISTS is_shared_split_coop BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE games ADD COLUMN IF NOT EXISTS is_online_pvp        BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE games ADD COLUMN IF NOT EXISTS is_mmo               BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE games ADD COLUMN IF NOT EXISTS mp_max_players_approx INTEGER;

-- Price / release snapshot (from store appdetails).
ALTER TABLE games ADD COLUMN IF NOT EXISTS price_currency           TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS price_initial_cents      INTEGER;
ALTER TABLE games ADD COLUMN IF NOT EXISTS price_final_cents        INTEGER;
ALTER TABLE games ADD COLUMN IF NOT EXISTS price_discount_pct       INTEGER;
ALTER TABLE games ADD COLUMN IF NOT EXISTS is_free                  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE games ADD COLUMN IF NOT EXISTS release_coming_soon      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE games ADD COLUMN IF NOT EXISTS release_date_text        TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS release_date_parsed      TIMESTAMPTZ;
ALTER TABLE games ADD COLUMN IF NOT EXISTS store_details_checked_at TIMESTAMPTZ;
ALTER TABLE games ADD COLUMN IF NOT EXISTS price_checked_at         TIMESTAMPTZ;
