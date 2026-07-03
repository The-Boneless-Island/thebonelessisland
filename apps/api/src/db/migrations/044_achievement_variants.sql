-- Small-unlock announcement variants. Bot picks one at random when a non-
-- milestone achievement fires (e.g. first_blood, pog_moment, the_grind).
-- Token `{{user}}` is replaced with the user's Discord mention at announce
-- time; the achievement name/emoji are prepended by the bot dispatcher
-- (processAchievementUnlocked), not embedded in this seed text. Milestone
-- tier crossings (milestone_rank_*) keep using the existing static-template
-- + rendered rank-card path in checkMilestones — they are NOT seeded here
-- and involve no LLM call.

CREATE TABLE IF NOT EXISTS achievement_message_variants (
  id              SERIAL PRIMARY KEY,
  achievement_key TEXT NOT NULL,
  variant_text    TEXT NOT NULL,
  weight          INT  NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (achievement_key, variant_text)
);

CREATE INDEX IF NOT EXISTS achievement_variants_key_idx
  ON achievement_message_variants(achievement_key);

-- Toggle so small-unlock chatter can be muted without disabling the
-- milestone announcer (which fires rarely and is high-signal).
INSERT INTO server_settings (key, value, label, description, is_secret) VALUES
  (
    'achievement_announcements_enabled',
    'false',
    'Small achievement Discord announcements',
    'When ON, the bot posts a one-liner in the milestone channel each time a non-milestone achievement unlocks (e.g. FIRST BLOOD, POG MOMENT). Reuses milestone_channel_id. Default OFF until you''ve seen the volume.',
    FALSE
  )
ON CONFLICT (key) DO NOTHING;

-- ── Seed variants (Nuggie voice, short, occasionally pun) ────────────────────

INSERT INTO achievement_message_variants (achievement_key, variant_text) VALUES
  -- first_blood: first daily claim
  ('first_blood',  '{{user}} drew first blood 🍗 hot start, keep cooking'),
  ('first_blood',  'first daily goes to {{user}}, welcome to the grind'),
  ('first_blood',  '{{user}} clocked in. nuggets to be earned.'),
  ('first_blood',  'look who showed up — {{user}}. tide''s rising.'),
  ('first_blood',  '{{user}} claimed first blood. easy money, kid.'),
  ('first_blood',  'fresh fryer dropping for {{user}}. day one done.'),

  -- pog_moment: blackjack natural 21
  ('pog_moment',   '{{user}} hit a natural 21 💀 dealer in shambles'),
  ('pog_moment',   'POG. {{user}} just got dealt the dream.'),
  ('pog_moment',   '{{user}} flipped blackjack on the deal. respect.'),
  ('pog_moment',   'card gods love {{user}} right now. natural 21.'),
  ('pog_moment',   '{{user}} said "deal me in" and pulled a natural. ridiculous.'),
  ('pog_moment',   'fryer''s hot — {{user}} just hit pog moment 🔥'),

  -- cheese_strat: double-down win from ≤8
  ('cheese_strat', '{{user}} doubled on 8 and WON. unhinged.'),
  ('cheese_strat', 'cheese strat works when you have {{user}}''s nerve. wow.'),
  ('cheese_strat', '{{user}} double-downed a soft hand and won 🥚 absolute degenerate'),
  ('cheese_strat', 'logic took the night off — {{user}} just doubled on garbage and cashed.'),
  ('cheese_strat', '{{user}} pulled a cheese strat. unsportsmanlike. love it.'),
  ('cheese_strat', 'the math says no. {{user}} said yes. {{user}} was right.'),

  -- nerfed: (catch-all for losing-style achievement)
  ('nerfed',       '{{user}} got nerfed 💀 skill issue. get back in there.'),
  ('nerfed',       'rough round for {{user}}. shake it off.'),
  ('nerfed',       '{{user}} took an L. ice cream and respawn.'),
  ('nerfed',       'house ate {{user}}''s lunch. patch notes incoming.'),
  ('nerfed',       '{{user}} discovered why we have a "nerfed" achievement.'),
  ('nerfed',       'painful round for {{user}}. honestly impressive.'),

  -- the_grind: lifetime positive ≥ 10k nuggies
  ('the_grind',    '{{user}} crossed ₦10k lifetime — THE GRIND unlocked 🪙'),
  ('the_grind',    'ten thousand nuggies through {{user}}''s hands. that''s a lot of fryer time.'),
  ('the_grind',    '{{user}} hit the grind milestone. you''re built different.'),
  ('the_grind',    'big number unlocked for {{user}}. ₦10k. respect the hustle.'),
  ('the_grind',    '{{user}} grinded their way to ₦10k. real ones notice.'),
  ('the_grind',    'casual reminder that {{user}} has earned ₦10k. casual.'),

  -- streak_7
  ('streak_7',     '{{user}} hit 7-day streak 🔥 commitment unlocked'),
  ('streak_7',     'seven straight for {{user}}. discipline is hot.'),
  ('streak_7',     '{{user}} just locked in 7 daily claims back to back.'),
  ('streak_7',     'one week of {{user}} not missing daily. ridiculous.'),
  ('streak_7',     '{{user}} showing up like rent''s due. 7-day streak.'),
  ('streak_7',     'a week of {{user}} clocking in. fryer never cold.'),

  -- streak_30
  ('streak_30',    '{{user}} hit THIRTY days 🌋 absolute lock-in'),
  ('streak_30',    'thirty straight daily claims for {{user}}. how is this possible.'),
  ('streak_30',    '{{user}} just unlocked STREAK 30. log off occasionally maybe.'),
  ('streak_30',    'a full month of {{user}} not missing a beat. legendary.'),
  ('streak_30',    '{{user}} got religion about daily claim. 30 days.'),
  ('streak_30',    'thirty-day streak for {{user}}. someone check on this person.'),

  -- high_roller: big single win
  ('high_roller',  '{{user}} hit HIGH ROLLER 💎 big-bet vibes'),
  ('high_roller',  'fat stack incoming — {{user}} just cashed a major round.'),
  ('high_roller',  '{{user}} bet huge and won huge. unbalanced behavior.'),
  ('high_roller',  'casino briefly fearing {{user}}. high roller unlocked.'),
  ('high_roller',  '{{user}} ate the house''s lunch. nice round.'),
  ('high_roller',  'big money, big swings. {{user}} just delivered.'),

  -- lucky_streak: 3 game wins in a row
  ('lucky_streak', '{{user}} on a hot streak 🍀 three straight'),
  ('lucky_streak', '{{user}} cannot lose right now. three wins.'),
  ('lucky_streak', '3-in-a-row for {{user}}. card gods, gambling gods, all gods.'),
  ('lucky_streak', '{{user}} is cooking. three games, three wins.'),
  ('lucky_streak', 'lucky streak — {{user}} found a vein. keep digging.'),
  ('lucky_streak', '{{user}} winning so much it''s suspicious. lucky streak unlocked.'),

  -- house_special: 10 lifetime blackjack wins
  ('house_special', '{{user}} bagged 10 blackjack wins ♠️ HOUSE SPECIAL'),
  ('house_special', 'the dealer knows {{user}} by name now.'),
  ('house_special', '{{user}} hit the HOUSE SPECIAL — ten BJ wins deep.'),
  ('house_special', 'ten blackjack victories for {{user}}. cards bow.'),
  ('house_special', '{{user}} is the table veteran. HOUSE SPECIAL unlocked.'),
  ('house_special', 'ten times {{user}} has dunked on the dealer. impressive.'),

  -- bank_run: loan repaid early
  ('bank_run',     '{{user}} paid the loan early 🏦 BANK RUN unlocked'),
  ('bank_run',     'fiscal responsibility detected — {{user}} paid early.'),
  ('bank_run',     '{{user}} returned the principal ahead of schedule. credit score: vibes.'),
  ('bank_run',     'banker''s smile lit up — {{user}} paid early.'),
  ('bank_run',     '{{user}} settled the loan before the due. respect the timing.'),
  ('bank_run',     'BANK RUN: {{user}} just made every other borrower look slow.'),

  -- whale: ₦10k+ cumulative bet
  ('whale',        '{{user}} crossed ₦10k cumulative bet 🐋 WHALE status'),
  ('whale',        'we got a whale — {{user}} just hit the threshold.'),
  ('whale',        '{{user}} swimming in deep water now. WHALE unlocked.'),
  ('whale',        '{{user}} has thrown 10k+ into the pot lifetime. wild.'),
  ('whale',        'tank big enough for {{user}}? WHALE achievement.'),
  ('whale',        '{{user}} unlocked WHALE. island depth charts updated.'),

  -- gn_regular: 5 game nights
  ('gn_regular',   '{{user}} hit 5 game nights 🎮 GAME NIGHT REGULAR'),
  ('gn_regular',   '{{user}} showed up to five — officially a regular.'),
  ('gn_regular',   'crew sees {{user}} every game night now. REGULAR unlocked.'),
  ('gn_regular',   '{{user}} just earned REGULAR status. consistent vibes.'),
  ('gn_regular',   'five game nights for {{user}}. solid attendance.'),
  ('gn_regular',   '{{user}} keeps showing up. crew''s noticed. REGULAR.'),

  -- gn_veteran: 25 game nights
  ('gn_veteran',   '{{user}} hit 25 game nights 🎖️ VETERAN status'),
  ('gn_veteran',   'twenty-five game nights for {{user}}. anchor of the crew.'),
  ('gn_veteran',   '{{user}} is GAME NIGHT VETERAN now. respect the longevity.'),
  ('gn_veteran',   'crew leans on {{user}} for a reason. 25 nights deep.'),
  ('gn_veteran',   '{{user}} unlocked GN VETERAN. island institution.'),
  ('gn_veteran',   'twenty-five attendances for {{user}}. unhinged dedication.'),

  -- tournament_master: 100 lifetime wins
  ('tournament_master', '{{user}} got 100 lifetime wins 🏆 TOURNAMENT MASTER'),
  ('tournament_master', 'centennial for {{user}}. one hundred game wins.'),
  ('tournament_master', '{{user}} unlocked TOURNAMENT MASTER. legend status.'),
  ('tournament_master', '100 wins for {{user}}. island history book updating.'),
  ('tournament_master', '{{user}} is officially a closer. 100 wins.'),
  ('tournament_master', 'tournament god confirmed — {{user}} hit triple digits.')
ON CONFLICT (achievement_key, variant_text) DO NOTHING;
