-- Cosmetic rename pass — locked names from brainstorm 2026-05-10.
-- All renames key off item_key (stable, never changes), not name. Future
-- rename passes follow this exact pattern.

-- ── Tier badges ───────────────────────────────────────────────────────────────

UPDATE nuggies_shop_items SET name = 'TUTORIAL ISLAND',  description = 'Reached the TUTORIAL ISLAND rank. You just got here.'                  WHERE item_key = 'milestone_rank_01';
UPDATE nuggies_shop_items SET name = 'SIDEKICK',         description = 'Reached the SIDEKICK rank. Not the star yet, but in the ring.'        WHERE item_key = 'milestone_rank_02';
UPDATE nuggies_shop_items SET name = 'REGULAR',          description = 'Reached the REGULAR rank. Where everybody knows your name.'           WHERE item_key = 'milestone_rank_03';
UPDATE nuggies_shop_items SET name = 'RISING STAR',      description = 'Reached the RISING STAR rank. The momentum is real.'                  WHERE item_key = 'milestone_rank_04';
UPDATE nuggies_shop_items SET name = 'A-LISTER',         description = 'Reached the A-LISTER rank. Top billing.'                              WHERE item_key = 'milestone_rank_05';
UPDATE nuggies_shop_items SET name = 'KING OF THE HILL', description = 'Reached the KING OF THE HILL rank. Top of the local mountain.'        WHERE item_key = 'milestone_rank_06';
UPDATE nuggies_shop_items SET name = 'BIG BOSS',         description = 'Reached the BIG BOSS rank. Year-one veteran. Few stand here.'         WHERE item_key = 'milestone_rank_07';
UPDATE nuggies_shop_items SET name = 'MR. WORLDWIDE',    description = 'Reached the MR. WORLDWIDE rank. Lifer. The undisputed apex.'          WHERE item_key = 'milestone_rank_08';

-- ── Earned achievements ──────────────────────────────────────────────────────
-- Title-type rows also carry an `item_data->>'label'` for display — keep in
-- sync with the new name. Badge-type rows don't have a label in itemData.

UPDATE nuggies_shop_items
  SET name = 'NO DAYS OFF',
      description = 'Claim daily 7 days in a row. Grindset confirmed.'
  WHERE item_key = 'streak_7';

UPDATE nuggies_shop_items
  SET name = '30 FOR 30',
      description = 'Claim daily 30 days in a row. ESPN-tier commitment.',
      item_data = jsonb_set(item_data, '{label}', '"30 FOR 30"')
  WHERE item_key = 'streak_30';

UPDATE nuggies_shop_items
  SET name = 'THE USUAL',
      description = 'Attended 5 game nights. The bartender knows your order.'
  WHERE item_key = 'gn_regular';

UPDATE nuggies_shop_items
  SET name = 'OLD GUARD',
      description = 'Attended 25 game nights. Crew anchor.',
      item_data = jsonb_set(item_data, '{label}', '"OLD GUARD"')
  WHERE item_key = 'gn_veteran';

UPDATE nuggies_shop_items
  SET name = 'CENTURY CLUB',
      description = '100 lifetime game wins. Welcome to the club.',
      item_data = jsonb_set(item_data, '{label}', '"CENTURY CLUB"')
  WHERE item_key = 'tournament_master';

-- ── Purchasable cosmetic titles ──────────────────────────────────────────────

UPDATE nuggies_shop_items SET name = '200 IQ'          WHERE item_key = 'title_04';
UPDATE nuggies_shop_items SET name = 'FOUNDING MEMBER' WHERE item_key = 'title_08';

-- ── Rewrite historical milestone.reached labels ──────────────────────────────
-- Cosmetic — feed consistency over historical fidelity. Idempotency now keys
-- off payload->>'key' (migration 032), so this is safe.

UPDATE activity_events
SET payload = jsonb_set(payload, '{label}', to_jsonb(CASE payload->>'key'
  WHEN 'milestone_rank_01' THEN 'TUTORIAL ISLAND'
  WHEN 'milestone_rank_02' THEN 'SIDEKICK'
  WHEN 'milestone_rank_03' THEN 'REGULAR'
  WHEN 'milestone_rank_04' THEN 'RISING STAR'
  WHEN 'milestone_rank_05' THEN 'A-LISTER'
  WHEN 'milestone_rank_06' THEN 'KING OF THE HILL'
  WHEN 'milestone_rank_07' THEN 'BIG BOSS'
  WHEN 'milestone_rank_08' THEN 'MR. WORLDWIDE'
  ELSE payload->>'label'
END))
WHERE event_type = 'milestone.reached' AND payload->>'key' IS NOT NULL;
