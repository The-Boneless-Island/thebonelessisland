-- Point milestone shop item images at lightweight web PNGs (128px) instead of heavy SVGs.

UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/web/vault-dweller.png?v=badge-v3"')     WHERE item_key = 'milestone_rank_01';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/web/silver.png?v=badge-v3"')            WHERE item_key = 'milestone_rank_02';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/web/regular.png?v=badge-v3"')           WHERE item_key = 'milestone_rank_03';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/web/divine.png?v=badge-v3"')            WHERE item_key = 'milestone_rank_04';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/web/got-gud.png?v=badge-v3"')           WHERE item_key = 'milestone_rank_05';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/web/king-of-the-hill.png?v=badge-v3"')  WHERE item_key = 'milestone_rank_06';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/web/big-boss.png?v=badge-v3"')          WHERE item_key = 'milestone_rank_07';
UPDATE nuggies_shop_items SET item_data = jsonb_set(COALESCE(item_data, '{}'::jsonb), '{image}', '"/art/milestones/web/kappa.png?v=badge-v3"')             WHERE item_key = 'milestone_rank_08';
