-- Earned achievements tier (Phase 1, 5 titles).
-- Reuses nuggies_shop_items + nuggies_inventory by adding an `acquisition`
-- discriminator. Earned items are hidden from /shop, granted to inventory by
-- the achievements module after specific gameplay events. Same equip code
-- path as purchasable items.
--
-- Note: existing CHECK (price > 0) constrains us — earned items use price=1
-- as a sentinel. UI must hide price for `acquisition='earned'` rows.

ALTER TABLE nuggies_shop_items
  ADD COLUMN IF NOT EXISTS acquisition TEXT NOT NULL DEFAULT 'shop';

-- 'shop' | 'earned'

INSERT INTO nuggies_shop_items (name, description, price, item_type, item_data, acquisition, is_active) VALUES
  ('FIRST BLOOD',  'First daily claim. Welcome to the island.',                1, 'badge', '{"emoji":"🩸","color":"#ef4444"}',                              'earned', TRUE),
  ('POG MOMENT',   'Hit a natural 21 on a fresh deal.',                        1, 'badge', '{"emoji":"🎉","color":"#facc15"}',                              'earned', TRUE),
  ('CHEESE STRAT', 'Won blackjack with a double-down on a starting total ≤8.', 1, 'badge', '{"emoji":"🧀","color":"#fbbf24"}',                              'earned', TRUE),
  ('NERFED',       'Patched by the parents.',                                  1, 'badge', '{"emoji":"🔧","color":"#94a3b8"}',                              'earned', TRUE),
  ('THE GRIND',    'Lifetime ₦10,000 earned. The grindset works.',             1, 'title', '{"emoji":"⚙️","label":"THE GRIND","color":"#a3e635"}',         'earned', TRUE)
ON CONFLICT DO NOTHING;
