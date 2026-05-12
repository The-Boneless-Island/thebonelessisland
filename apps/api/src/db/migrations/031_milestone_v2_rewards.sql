-- Milestone v2 — expanded ladder, tier rewards, Discord bridge, Phase 4 achievements.
--
-- 1. 8 tier-badge shop items (auto-granted on tier reach).
-- 2. 10 new earned-achievement shop items (Phase 4).
-- 3. 10 server_settings rows for Discord bridge config.
-- 4. bot_announcements outbox table for API → bot push.

-- ── 1. Tier badges (auto-grant on milestone reach) ────────────────────────────

INSERT INTO nuggies_shop_items (name, description, price, item_type, item_data, acquisition, is_active) VALUES
  ('DRIFTWOOD',     'Reached the DRIFTWOOD rank. Iron tier — washed up, but you''re here.',          1, 'badge', '{"emoji":"🪵","color":"#94a3b8"}',  'earned', TRUE),
  ('SHELLBACK',     'Reached the SHELLBACK rank. You''ve put in time.',                              1, 'badge', '{"emoji":"🐢","color":"#10b981"}',  'earned', TRUE),
  ('BRONZE CONCH',  'Reached the BRONZE CONCH rank. Decent shell game.',                             1, 'badge', '{"emoji":"🐚","color":"#d97706"}',  'earned', TRUE),
  ('SILVER TIDE',   'Reached the SILVER TIDE rank. Momentum building.',                              1, 'badge', '{"emoji":"🌊","color":"#cbd5e1"}',  'earned', TRUE),
  ('GOLD COAST',    'Reached the GOLD COAST rank. You''re actually good at this.',                   1, 'badge', '{"emoji":"🏖️","color":"#facc15"}',  'earned', TRUE),
  ('STORMRIDER',    'Reached the STORMRIDER rank. Six-figure earner — late-game flex.',              1, 'badge', '{"emoji":"⛈️","color":"#818cf8"}',  'earned', TRUE),
  ('KRAKENSLAYER',  'Reached the KRAKENSLAYER rank. Year-one veteran.',                              1, 'badge', '{"emoji":"🦑","color":"#f472b6"}',  'earned', TRUE),
  ('APEX TIDELORD', 'Reached the APEX TIDELORD rank. Lifer. Pure bragging rights.',                  1, 'badge', '{"emoji":"🔱","color":"#fbbf24"}',  'earned', TRUE)
ON CONFLICT DO NOTHING;

-- ── 2. Phase 4 achievements (10 new earned titles) ────────────────────────────

INSERT INTO nuggies_shop_items (name, description, price, item_type, item_data, acquisition, is_active) VALUES
  ('STREAK 7',           'Claim daily 7 days in a row.',                              1, 'badge', '{"emoji":"🔥","color":"#f97316"}',                                'earned', TRUE),
  ('STREAK 30',          'Claim daily 30 days in a row. Truly committed.',            1, 'title', '{"emoji":"🌋","label":"STREAK 30","color":"#ef4444"}',           'earned', TRUE),
  ('HIGH ROLLER',        'Single game net win of ₦400 or more.',                      1, 'badge', '{"emoji":"💎","color":"#22d3ee"}',                                'earned', TRUE),
  ('LUCKY STREAK',       '3 game wins in a row, any combination.',                    1, 'badge', '{"emoji":"🍀","color":"#22c55e"}',                                'earned', TRUE),
  ('HOUSE SPECIAL',      '10 lifetime blackjack wins. The dealer knows your name.',   1, 'badge', '{"emoji":"♠️","color":"#a855f7"}',                                'earned', TRUE),
  ('BANK RUN',           'Loan repaid before the due date.',                          1, 'badge', '{"emoji":"🏦","color":"#84cc16"}',                                'earned', TRUE),
  ('WHALE',              'Cumulative bet of ₦10,000+ across all games.',              1, 'title', '{"emoji":"🐋","label":"WHALE","color":"#3b82f6"}',               'earned', TRUE),
  ('GAME NIGHT REGULAR', 'Attended 5 game nights.',                                   1, 'badge', '{"emoji":"🎮","color":"#a3e635"}',                                'earned', TRUE),
  ('GAME NIGHT VETERAN', 'Attended 25 game nights. Crew anchor.',                     1, 'title', '{"emoji":"🎖️","label":"GAME NIGHT VETERAN","color":"#fbbf24"}', 'earned', TRUE),
  ('TOURNAMENT MASTER',  '100 lifetime game wins. Legend status.',                    1, 'title', '{"emoji":"🏆","label":"TOURNAMENT MASTER","color":"#fde047"}',   'earned', TRUE)
ON CONFLICT DO NOTHING;

-- ── 3. Discord bridge settings ────────────────────────────────────────────────

INSERT INTO server_settings (key, value, label, description, is_secret) VALUES
  ('milestone_announcements_enabled',
   'false',
   'Milestone Discord Announcements',
   'When ON, the bot posts a public message in the configured channel each time a member reaches a new tier. Requires milestone_channel_id. Default OFF — admin opts in after setup.',
   FALSE),
  ('milestone_channel_id',
   '',
   'Milestone Channel ID',
   'Discord channel ID for milestone announcements. Find via Settings → Advanced → Developer Mode, then right-click the channel → Copy ID.',
   FALSE),
  ('milestone_role_driftwood',
   '',
   'Discord Role · DRIFTWOOD',
   'Role ID auto-assigned when a member reaches DRIFTWOOD. Bot needs Manage Roles permission and must sit above this role in the hierarchy.',
   FALSE),
  ('milestone_role_shellback',
   '',
   'Discord Role · SHELLBACK',
   'Role ID auto-assigned when a member reaches SHELLBACK.',
   FALSE),
  ('milestone_role_bronze_conch',
   '',
   'Discord Role · BRONZE CONCH',
   'Role ID auto-assigned when a member reaches BRONZE CONCH.',
   FALSE),
  ('milestone_role_silver_tide',
   '',
   'Discord Role · SILVER TIDE',
   'Role ID auto-assigned when a member reaches SILVER TIDE.',
   FALSE),
  ('milestone_role_gold_coast',
   '',
   'Discord Role · GOLD COAST',
   'Role ID auto-assigned when a member reaches GOLD COAST.',
   FALSE),
  ('milestone_role_stormrider',
   '',
   'Discord Role · STORMRIDER',
   'Role ID auto-assigned when a member reaches STORMRIDER.',
   FALSE),
  ('milestone_role_krakenslayer',
   '',
   'Discord Role · KRAKENSLAYER',
   'Role ID auto-assigned when a member reaches KRAKENSLAYER.',
   FALSE),
  ('milestone_role_apex_tidelord',
   '',
   'Discord Role · APEX TIDELORD',
   'Role ID auto-assigned when a member reaches APEX TIDELORD.',
   FALSE)
ON CONFLICT (key) DO NOTHING;

-- ── 4. Outbox table (API writes; bot polls + processes) ───────────────────────

CREATE TABLE IF NOT EXISTS bot_announcements (
  id           BIGSERIAL PRIMARY KEY,
  kind         TEXT NOT NULL,
  payload      JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS bot_announcements_pending_idx
  ON bot_announcements (created_at)
  WHERE processed_at IS NULL;
