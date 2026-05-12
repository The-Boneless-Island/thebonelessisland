-- Stable identifier scheme for nuggies_shop_items + milestone settings.
--
-- Decouples internal lookup keys from user-facing display labels so future
-- renames are mechanical (edit a label, no migration). Backfills the new
-- column on every existing row, then renames the milestone role-id settings
-- from name-coupled keys (milestone_role_driftwood) to ordinal keys
-- (milestone_role_rank_01).
--
-- Naming scheme:
--   Tier badges:        milestone_rank_01 … milestone_rank_08
--   Phase 4 earned:     concept-named (first_blood, streak_7, etc.) — unchanged
--   Purchasable items:  title_01-10, flair_01-05, badge_01-05 (matches 021's order)

-- ── 1. Add stable key column ──────────────────────────────────────────────────

ALTER TABLE nuggies_shop_items
  ADD COLUMN IF NOT EXISTS item_key TEXT;

-- ── 2. Backfill keys ──────────────────────────────────────────────────────────

-- Earned achievements — concept-based keys (already trigger-named).
UPDATE nuggies_shop_items SET item_key = 'first_blood'        WHERE acquisition = 'earned' AND name = 'FIRST BLOOD';
UPDATE nuggies_shop_items SET item_key = 'pog_moment'         WHERE acquisition = 'earned' AND name = 'POG MOMENT';
UPDATE nuggies_shop_items SET item_key = 'cheese_strat'       WHERE acquisition = 'earned' AND name = 'CHEESE STRAT';
UPDATE nuggies_shop_items SET item_key = 'nerfed'             WHERE acquisition = 'earned' AND name = 'NERFED';
UPDATE nuggies_shop_items SET item_key = 'the_grind'          WHERE acquisition = 'earned' AND name = 'THE GRIND';
UPDATE nuggies_shop_items SET item_key = 'streak_7'           WHERE acquisition = 'earned' AND name = 'STREAK 7';
UPDATE nuggies_shop_items SET item_key = 'streak_30'          WHERE acquisition = 'earned' AND name = 'STREAK 30';
UPDATE nuggies_shop_items SET item_key = 'high_roller'        WHERE acquisition = 'earned' AND name = 'HIGH ROLLER';
UPDATE nuggies_shop_items SET item_key = 'lucky_streak'       WHERE acquisition = 'earned' AND name = 'LUCKY STREAK';
UPDATE nuggies_shop_items SET item_key = 'house_special'      WHERE acquisition = 'earned' AND name = 'HOUSE SPECIAL';
UPDATE nuggies_shop_items SET item_key = 'bank_run'           WHERE acquisition = 'earned' AND name = 'BANK RUN';
UPDATE nuggies_shop_items SET item_key = 'whale'              WHERE acquisition = 'earned' AND name = 'WHALE';
UPDATE nuggies_shop_items SET item_key = 'gn_regular'         WHERE acquisition = 'earned' AND name = 'GAME NIGHT REGULAR';
UPDATE nuggies_shop_items SET item_key = 'gn_veteran'         WHERE acquisition = 'earned' AND name = 'GAME NIGHT VETERAN';
UPDATE nuggies_shop_items SET item_key = 'tournament_master'  WHERE acquisition = 'earned' AND name = 'TOURNAMENT MASTER';

-- Tier badges — context-free ordinal scheme.
UPDATE nuggies_shop_items SET item_key = 'milestone_rank_01'  WHERE acquisition = 'earned' AND name = 'DRIFTWOOD';
UPDATE nuggies_shop_items SET item_key = 'milestone_rank_02'  WHERE acquisition = 'earned' AND name = 'SHELLBACK';
UPDATE nuggies_shop_items SET item_key = 'milestone_rank_03'  WHERE acquisition = 'earned' AND name = 'BRONZE CONCH';
UPDATE nuggies_shop_items SET item_key = 'milestone_rank_04'  WHERE acquisition = 'earned' AND name = 'SILVER TIDE';
UPDATE nuggies_shop_items SET item_key = 'milestone_rank_05'  WHERE acquisition = 'earned' AND name = 'GOLD COAST';
UPDATE nuggies_shop_items SET item_key = 'milestone_rank_06'  WHERE acquisition = 'earned' AND name = 'STORMRIDER';
UPDATE nuggies_shop_items SET item_key = 'milestone_rank_07'  WHERE acquisition = 'earned' AND name = 'KRAKENSLAYER';
UPDATE nuggies_shop_items SET item_key = 'milestone_rank_08'  WHERE acquisition = 'earned' AND name = 'APEX TIDELORD';

-- Purchasable cosmetics — ordinals matching original migration 021 position.
UPDATE nuggies_shop_items SET item_key = 'title_01' WHERE acquisition = 'shop' AND item_type = 'title' AND name = 'HARDSTUCK';
UPDATE nuggies_shop_items SET item_key = 'title_02' WHERE acquisition = 'shop' AND item_type = 'title' AND name = 'SKILL ISSUE';
UPDATE nuggies_shop_items SET item_key = 'title_03' WHERE acquisition = 'shop' AND item_type = 'title' AND name = 'SALT MINER';
UPDATE nuggies_shop_items SET item_key = 'title_04' WHERE acquisition = 'shop' AND item_type = 'title' AND name = 'BIG BRAIN';
UPDATE nuggies_shop_items SET item_key = 'title_05' WHERE acquisition = 'shop' AND item_type = 'title' AND name = 'COOKED';
UPDATE nuggies_shop_items SET item_key = 'title_06' WHERE acquisition = 'shop' AND item_type = 'title' AND name = 'MAIN CHARACTER';
UPDATE nuggies_shop_items SET item_key = 'title_07' WHERE acquisition = 'shop' AND item_type = 'title' AND name = 'CLUTCH';
UPDATE nuggies_shop_items SET item_key = 'title_08' WHERE acquisition = 'shop' AND item_type = 'title' AND name = 'CERTIFIED OG';
UPDATE nuggies_shop_items SET item_key = 'title_09' WHERE acquisition = 'shop' AND item_type = 'title' AND name = 'GIGABONELESS';
UPDATE nuggies_shop_items SET item_key = 'title_10' WHERE acquisition = 'shop' AND item_type = 'title' AND name = 'WHALE PILLED';
UPDATE nuggies_shop_items SET item_key = 'flair_01' WHERE acquisition = 'shop' AND item_type = 'flair' AND name = 'MALDING';
UPDATE nuggies_shop_items SET item_key = 'flair_02' WHERE acquisition = 'shop' AND item_type = 'flair' AND name = 'WE''RE BACK';
UPDATE nuggies_shop_items SET item_key = 'flair_03' WHERE acquisition = 'shop' AND item_type = 'flair' AND name = 'NO SLEEP';
UPDATE nuggies_shop_items SET item_key = 'flair_04' WHERE acquisition = 'shop' AND item_type = 'flair' AND name = 'LOOT GOBLIN';
UPDATE nuggies_shop_items SET item_key = 'flair_05' WHERE acquisition = 'shop' AND item_type = 'flair' AND name = 'GALAXY BRAIN';
UPDATE nuggies_shop_items SET item_key = 'badge_01' WHERE acquisition = 'shop' AND item_type = 'badge' AND name = 'NPC';
UPDATE nuggies_shop_items SET item_key = 'badge_02' WHERE acquisition = 'shop' AND item_type = 'badge' AND name = 'GG BONELESS';
UPDATE nuggies_shop_items SET item_key = 'badge_03' WHERE acquisition = 'shop' AND item_type = 'badge' AND name = 'HIM';
UPDATE nuggies_shop_items SET item_key = 'badge_04' WHERE acquisition = 'shop' AND item_type = 'badge' AND name = 'WORLD RECORD';
UPDATE nuggies_shop_items SET item_key = 'badge_05' WHERE acquisition = 'shop' AND item_type = 'badge' AND name = 'DAY ONE';

-- Unique index — every populated key must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS nuggies_shop_items_key_uniq
  ON nuggies_shop_items (item_key) WHERE item_key IS NOT NULL;

-- ── 3. Backfill activity_events with stable key ───────────────────────────────

UPDATE activity_events
SET payload = payload || jsonb_build_object('key', CASE payload->>'label'
  WHEN 'DRIFTWOOD'     THEN 'milestone_rank_01'
  WHEN 'SHELLBACK'     THEN 'milestone_rank_02'
  WHEN 'BRONZE CONCH'  THEN 'milestone_rank_03'
  WHEN 'SILVER TIDE'   THEN 'milestone_rank_04'
  WHEN 'GOLD COAST'    THEN 'milestone_rank_05'
  WHEN 'STORMRIDER'    THEN 'milestone_rank_06'
  WHEN 'KRAKENSLAYER'  THEN 'milestone_rank_07'
  WHEN 'APEX TIDELORD' THEN 'milestone_rank_08'
  ELSE NULL
END)
WHERE event_type = 'milestone.reached' AND payload->>'key' IS NULL;

-- ── 4. Rename milestone role-id settings to ordinal scheme ────────────────────

INSERT INTO server_settings (key, value, label, description, is_secret) VALUES
  ('milestone_role_rank_01', '', 'Discord Role · Tier 1', 'Role auto-assigned at milestone tier 1. Display name decoupled from this key — rename the tier freely; this key stays.', FALSE),
  ('milestone_role_rank_02', '', 'Discord Role · Tier 2', 'Role auto-assigned at milestone tier 2.', FALSE),
  ('milestone_role_rank_03', '', 'Discord Role · Tier 3', 'Role auto-assigned at milestone tier 3.', FALSE),
  ('milestone_role_rank_04', '', 'Discord Role · Tier 4', 'Role auto-assigned at milestone tier 4.', FALSE),
  ('milestone_role_rank_05', '', 'Discord Role · Tier 5', 'Role auto-assigned at milestone tier 5.', FALSE),
  ('milestone_role_rank_06', '', 'Discord Role · Tier 6', 'Role auto-assigned at milestone tier 6.', FALSE),
  ('milestone_role_rank_07', '', 'Discord Role · Tier 7', 'Role auto-assigned at milestone tier 7.', FALSE),
  ('milestone_role_rank_08', '', 'Discord Role · Tier 8', 'Role auto-assigned at milestone tier 8.', FALSE)
ON CONFLICT (key) DO NOTHING;

-- Carry over any populated values from the legacy keys.
UPDATE server_settings SET value = COALESCE(NULLIF((SELECT value FROM server_settings WHERE key = 'milestone_role_driftwood'),     ''), value) WHERE key = 'milestone_role_rank_01';
UPDATE server_settings SET value = COALESCE(NULLIF((SELECT value FROM server_settings WHERE key = 'milestone_role_shellback'),     ''), value) WHERE key = 'milestone_role_rank_02';
UPDATE server_settings SET value = COALESCE(NULLIF((SELECT value FROM server_settings WHERE key = 'milestone_role_bronze_conch'),  ''), value) WHERE key = 'milestone_role_rank_03';
UPDATE server_settings SET value = COALESCE(NULLIF((SELECT value FROM server_settings WHERE key = 'milestone_role_silver_tide'),   ''), value) WHERE key = 'milestone_role_rank_04';
UPDATE server_settings SET value = COALESCE(NULLIF((SELECT value FROM server_settings WHERE key = 'milestone_role_gold_coast'),    ''), value) WHERE key = 'milestone_role_rank_05';
UPDATE server_settings SET value = COALESCE(NULLIF((SELECT value FROM server_settings WHERE key = 'milestone_role_stormrider'),    ''), value) WHERE key = 'milestone_role_rank_06';
UPDATE server_settings SET value = COALESCE(NULLIF((SELECT value FROM server_settings WHERE key = 'milestone_role_krakenslayer'),  ''), value) WHERE key = 'milestone_role_rank_07';
UPDATE server_settings SET value = COALESCE(NULLIF((SELECT value FROM server_settings WHERE key = 'milestone_role_apex_tidelord'), ''), value) WHERE key = 'milestone_role_rank_08';

-- Drop legacy name-coupled rows.
DELETE FROM server_settings WHERE key IN (
  'milestone_role_driftwood',
  'milestone_role_shellback',
  'milestone_role_bronze_conch',
  'milestone_role_silver_tide',
  'milestone_role_gold_coast',
  'milestone_role_stormrider',
  'milestone_role_krakenslayer',
  'milestone_role_apex_tidelord'
);
