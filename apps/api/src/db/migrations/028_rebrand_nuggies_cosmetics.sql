-- Rebrand 2026-05-09 — hardcore gaming naming pass (meme-inflected).
-- Renames the 20 seeded shop items + their itemData.label fields. Pure
-- string change; IDs, prices, types, and FK relationships stay stable so
-- existing inventory rows and marketplace listings continue to resolve.
--
-- Mapping reference:
--   Titles
--    1: Landlocked        → HARDSTUCK
--    2: Crispy            → SKILL ISSUE
--    3: Saltwater         → SALT MINER
--    4: Palm Reader       → BIG BRAIN
--    5: Deep Fried        → COOKED
--    6: Shore Patrol      → MAIN CHARACTER
--    7: Tide Turner       → CLUTCH
--    8: Island Elder      → CERTIFIED OG
--    9: The Boneless One  → GIGABONELESS
--   10: Nuggie Millionaire→ WHALE PILLED
--   Flairs
--   11: AFK               → MALDING
--   12: Shore Gang        → WE'RE BACK
--   13: Night Owl         → NO SLEEP
--   14: Loot Goblin       → LOOT GOBLIN  (unchanged)
--   15: Strategist        → GALAXY BRAIN
--   Badges
--   16: Coconut           → NPC
--   17: Boneless Badge    → GG BONELESS
--   18: Shark             → HIM
--   19: Golden Nugget     → WORLD RECORD
--   20: OG Islander       → DAY ONE

-- ── Titles ────────────────────────────────────────────────────────────────────

UPDATE nuggies_shop_items
SET name = 'HARDSTUCK',
    description = 'Iron 3, since launch.',
    item_data = jsonb_set(item_data, '{label}', '"HARDSTUCK"')
WHERE item_type = 'title' AND name = 'Landlocked';

UPDATE nuggies_shop_items
SET name = 'SKILL ISSUE',
    description = 'Worn proudly. Tilted regardless.',
    item_data = jsonb_set(item_data, '{label}', '"SKILL ISSUE"')
WHERE item_type = 'title' AND name = 'Crispy';

UPDATE nuggies_shop_items
SET name = 'SALT MINER',
    description = 'Fresh out of the salt mines.',
    item_data = jsonb_set(item_data, '{label}', '"SALT MINER"')
WHERE item_type = 'title' AND name = 'Saltwater';

UPDATE nuggies_shop_items
SET name = 'BIG BRAIN',
    description = 'Three plays ahead. Two of them wrong.',
    item_data = jsonb_set(item_data, '{label}', '"BIG BRAIN"')
WHERE item_type = 'title' AND name = 'Palm Reader';

UPDATE nuggies_shop_items
SET name = 'COOKED',
    description = 'Brain off. Auto-pilot engaged.',
    item_data = jsonb_set(item_data, '{label}', '"COOKED"')
WHERE item_type = 'title' AND name = 'Deep Fried';

UPDATE nuggies_shop_items
SET name = 'MAIN CHARACTER',
    description = 'Plot armor included.',
    item_data = jsonb_set(item_data, '{label}', '"MAIN CHARACTER"')
WHERE item_type = 'title' AND name = 'Shore Patrol';

UPDATE nuggies_shop_items
SET name = 'CLUTCH',
    description = '1v3? Easy. 1v4? Don''t push it.',
    item_data = jsonb_set(item_data, '{label}', '"CLUTCH"')
WHERE item_type = 'title' AND name = 'Tide Turner';

UPDATE nuggies_shop_items
SET name = 'CERTIFIED OG',
    description = 'Receipts older than the patch notes.',
    item_data = jsonb_set(item_data, '{label}', '"CERTIFIED OG"')
WHERE item_type = 'title' AND name = 'Island Elder';

UPDATE nuggies_shop_items
SET name = 'GIGABONELESS',
    description = 'Maximum boneless. Zero bones.',
    item_data = jsonb_set(item_data, '{label}', '"GIGABONELESS"')
WHERE item_type = 'title' AND name = 'The Boneless One';

UPDATE nuggies_shop_items
SET name = 'WHALE PILLED',
    description = 'Whale-pilled and proud of it.',
    item_data = jsonb_set(item_data, '{label}', '"WHALE PILLED"')
WHERE item_type = 'title' AND name = 'Nuggie Millionaire';

-- ── Flairs ────────────────────────────────────────────────────────────────────

UPDATE nuggies_shop_items
SET name = 'MALDING',
    description = 'Mad and balding. In a good way.'
WHERE item_type = 'flair' AND name = 'AFK';

UPDATE nuggies_shop_items
SET name = 'WE''RE BACK',
    description = 'It was over. Now it''s not.'
WHERE item_type = 'flair' AND name = 'Shore Gang';

UPDATE nuggies_shop_items
SET name = 'NO SLEEP',
    description = 'Sleep is a stat debuff.'
WHERE item_type = 'flair' AND name = 'Night Owl';

-- Loot Goblin: name unchanged. Leave as seeded.

UPDATE nuggies_shop_items
SET name = 'GALAXY BRAIN',
    description = 'Take incoming. Brace.'
WHERE item_type = 'flair' AND name = 'Strategist';

-- ── Badges ────────────────────────────────────────────────────────────────────

UPDATE nuggies_shop_items
SET name = 'NPC',
    description = 'Round. Empty. Iconic.'
WHERE item_type = 'badge' AND name = 'Coconut';

UPDATE nuggies_shop_items
SET name = 'GG BONELESS',
    description = 'GG, no bones.'
WHERE item_type = 'badge' AND name = 'Boneless Badge';

UPDATE nuggies_shop_items
SET name = 'HIM',
    description = 'He''s HIM. That''s the badge.'
WHERE item_type = 'badge' AND name = 'Shark';

UPDATE nuggies_shop_items
SET name = 'WORLD RECORD',
    description = 'Sub-30 or it didn''t happen.'
WHERE item_type = 'badge' AND name = 'Golden Nugget';

UPDATE nuggies_shop_items
SET name = 'DAY ONE',
    description = 'Pre-release backer. Pre-vibes.'
WHERE item_type = 'badge' AND name = 'OG Islander';
