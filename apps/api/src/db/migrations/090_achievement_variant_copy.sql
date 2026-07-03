-- Copy polish for achievement_message_variants (seeded in migration 044).
--
-- The bot dispatcher (apps/bot/src/index.ts, processAchievementUnlocked) now
-- ALWAYS prepends a composed "{emoji} **{name}** unlocked — " prefix in
-- front of whatever flavor text is picked here, so achievement-name
-- mentions inside the seed text are now redundant with the prefix, and any
-- variant that reads as a standalone sentence (no name context) needs to
-- flow naturally after that prefix.
--
-- The `nerfed` set is the must-fix: one variant ("{{user}} took an L. ice
-- cream and respawn.") produced the incoherent, nameless real-world
-- announcement that prompted this fix. Rewritten below to read cleanly once
-- the dispatcher's "🍗 **NERFED** unlocked — " prefix lands in front.
--
-- achievement_message_variants has a UNIQUE (achievement_key, variant_text)
-- constraint, so we DELETE the targeted rows and re-INSERT fresh text
-- rather than UPDATE, which risks a unique collision against another row.

DELETE FROM achievement_message_variants WHERE achievement_key = 'nerfed';

INSERT INTO achievement_message_variants (achievement_key, variant_text) VALUES
  ('nerfed', '{{user}} caught a rough one. skill issue. get back in there.'),
  ('nerfed', 'shake it off, {{user}}. house always finds a way.'),
  ('nerfed', '{{user}} took an L. ice cream and a respawn, on the house.'),
  ('nerfed', 'house ate {{user}}''s lunch this round. patch notes incoming.'),
  ('nerfed', 'now {{user}} knows why this achievement exists.'),
  ('nerfed', 'painful round for {{user}}. honestly kind of impressive.')
ON CONFLICT (achievement_key, variant_text) DO NOTHING;

-- Polish: a handful of other variants hard-code the achievement name inline
-- (now redundant with the dispatcher's prefix). Rewrite just those rows so
-- they don't repeat the name twice in the same message.

DELETE FROM achievement_message_variants
WHERE achievement_key = 'house_special'
  AND variant_text IN (
    '{{user}} bagged 10 blackjack wins ♠️ HOUSE SPECIAL',
    '{{user}} hit the HOUSE SPECIAL — ten BJ wins deep.'
  );

INSERT INTO achievement_message_variants (achievement_key, variant_text) VALUES
  ('house_special', '{{user}} bagged 10 blackjack wins ♠️ dealer''s on a first-name basis now'),
  ('house_special', '{{user}} is ten BJ wins deep. the table remembers.')
ON CONFLICT (achievement_key, variant_text) DO NOTHING;

DELETE FROM achievement_message_variants
WHERE achievement_key = 'whale'
  AND variant_text IN (
    '{{user}} crossed ₦10k cumulative bet 🐋 WHALE status',
    '{{user}} unlocked WHALE. island depth charts updated.'
  );

INSERT INTO achievement_message_variants (achievement_key, variant_text) VALUES
  ('whale', '{{user}} crossed ₦10k cumulative bet 🐋 deep water now'),
  ('whale', 'island depth charts just got updated because of {{user}}.')
ON CONFLICT (achievement_key, variant_text) DO NOTHING;
