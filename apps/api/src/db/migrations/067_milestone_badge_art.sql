-- Milestone rank badge art — point the 8 tier badges at their coin images.
--
-- The web `NuggieBadge`/`ItemGlyph` now renders `item_data->>'image'` when set,
-- falling back to the emoji otherwise. This lights up the milestone coins on
-- equipped badges + inventory/shop without touching any other item. Paths match
-- the web `RANK_TIERS[].art` slugs (apps/web/public/art/milestones/<slug>.svg).
--
-- Keyed off stable item_key (never changes), per the 033/066 rename pattern.
-- COALESCE guards rows where item_data is NULL so jsonb_set can seed the key.

UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/vault-dweller.svg"')     WHERE item_key = 'milestone_rank_01';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/silver.svg"')            WHERE item_key = 'milestone_rank_02';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/regular.svg"')           WHERE item_key = 'milestone_rank_03';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/divine.svg"')            WHERE item_key = 'milestone_rank_04';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/got-gud.svg"')           WHERE item_key = 'milestone_rank_05';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/king-of-the-hill.svg"')  WHERE item_key = 'milestone_rank_06';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/big-boss.svg"')          WHERE item_key = 'milestone_rank_07';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/kappa.svg"')             WHERE item_key = 'milestone_rank_08';
