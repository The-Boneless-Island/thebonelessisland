-- Bust cached coin-era milestone SVGs on equipped shop badges (067 used unversioned paths).
-- Must stay in sync with web RANK_ART_VERSION in apps/web/src/data/rankTiers.ts.

UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/vault-dweller.svg?v=badge-v2"')     WHERE item_key = 'milestone_rank_01';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/silver.svg?v=badge-v2"')            WHERE item_key = 'milestone_rank_02';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/regular.svg?v=badge-v2"')           WHERE item_key = 'milestone_rank_03';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/divine.svg?v=badge-v2"')            WHERE item_key = 'milestone_rank_04';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/got-gud.svg?v=badge-v2"')           WHERE item_key = 'milestone_rank_05';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/king-of-the-hill.svg?v=badge-v2"')  WHERE item_key = 'milestone_rank_06';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/big-boss.svg?v=badge-v2"')          WHERE item_key = 'milestone_rank_07';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/kappa.svg?v=badge-v2"')             WHERE item_key = 'milestone_rank_08';
