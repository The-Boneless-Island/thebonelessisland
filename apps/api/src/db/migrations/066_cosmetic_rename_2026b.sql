-- Cosmetic rename + emoji refresh pass — gaming-reference tiers, 2026-06.
-- All renames key off item_key (stable, never changes). Follows the 033 pattern.

-- ── Tier badge renames (display name + description) ───────────────────────────
UPDATE nuggies_shop_items SET name = 'VAULT DWELLER',     description = 'Reached the VAULT DWELLER rank. You just stepped out of the vault.'        WHERE item_key = 'milestone_rank_01';
UPDATE nuggies_shop_items SET name = 'HARD STUCK SILVER', description = 'Reached the HARD STUCK SILVER rank. Stuck in the ranked trenches, but climbing.' WHERE item_key = 'milestone_rank_02';
UPDATE nuggies_shop_items SET name = 'DIVINE',            description = 'Reached the DIVINE rank. Worth a Divine Orb. The momentum is real.'         WHERE item_key = 'milestone_rank_04';
UPDATE nuggies_shop_items SET name = 'GOT GUD',           description = 'Reached the GOT GUD rank. You finally got good.'                            WHERE item_key = 'milestone_rank_05';
UPDATE nuggies_shop_items SET name = 'KAPPA',             description = 'Reached the KAPPA rank. The undisputed apex haul.'                           WHERE item_key = 'milestone_rank_08';

-- ── Emoji refresh on tier badges (item_data->>'emoji') ───────────────────────
-- COALESCE guards rows where item_data is NULL so jsonb_set can seed the key.
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{emoji}', '"☢️"') WHERE item_key = 'milestone_rank_01';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{emoji}', '"🥈"') WHERE item_key = 'milestone_rank_02';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{emoji}', '"🍺"') WHERE item_key = 'milestone_rank_03';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{emoji}', '"🔮"') WHERE item_key = 'milestone_rank_04';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{emoji}', '"🔥"') WHERE item_key = 'milestone_rank_05';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{emoji}', '"💀"') WHERE item_key = 'milestone_rank_06';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{emoji}', '"🪖"') WHERE item_key = 'milestone_rank_07';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{emoji}', '"🧰"') WHERE item_key = 'milestone_rank_08';

-- ── Rewrite historical milestone.reached feed labels (cosmetic) ──────────────
-- Idempotency keys off payload->>'key' (migration 032), so relabeling is safe.
UPDATE activity_events
SET payload = jsonb_set(payload, '{label}', to_jsonb(CASE payload->>'key'
  WHEN 'milestone_rank_01' THEN 'VAULT DWELLER'
  WHEN 'milestone_rank_02' THEN 'HARD STUCK SILVER'
  WHEN 'milestone_rank_04' THEN 'DIVINE'
  WHEN 'milestone_rank_05' THEN 'GOT GUD'
  WHEN 'milestone_rank_08' THEN 'KAPPA'
  ELSE payload->>'label'
END))
WHERE event_type = 'milestone.reached'
  AND payload->>'key' IN ('milestone_rank_01', 'milestone_rank_02', 'milestone_rank_04', 'milestone_rank_05', 'milestone_rank_08');
