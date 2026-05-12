-- ── Nuggies Economy System ────────────────────────────────────────────────────

-- Balance cache (derived from ledger, maintained atomically)
CREATE TABLE IF NOT EXISTS nuggies_balances (
  user_id   BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance   BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Immutable transaction ledger
CREATE TABLE IF NOT EXISTS nuggies_transactions (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount              BIGINT NOT NULL,
  type                TEXT   NOT NULL,
  -- earn | spend | trade_in | trade_out | loan_in | loan_out
  -- | loan_repay | loan_forfeit_in | loan_forfeit_out
  -- | market_buy | market_sell | market_fee
  -- | admin_grant | admin_deduct | attendance | first_link | daily
  reason              TEXT   NOT NULL,
  reference_id        TEXT,
  created_by_user_id  BIGINT REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS nuggies_tx_user_id_idx   ON nuggies_transactions(user_id);
CREATE INDEX IF NOT EXISTS nuggies_tx_created_at_idx ON nuggies_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS nuggies_tx_type_user_idx  ON nuggies_transactions(user_id, type, created_at DESC);

-- Shop catalogue
CREATE TABLE IF NOT EXISTS nuggies_shop_items (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL,
  price       BIGINT  NOT NULL CHECK (price > 0),
  item_type   TEXT    NOT NULL, -- title | flair | badge
  item_data   JSONB   NOT NULL DEFAULT '{}', -- {emoji, label?, color}
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- User inventory
CREATE TABLE IF NOT EXISTS nuggies_inventory (
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id      BIGINT NOT NULL REFERENCES nuggies_shop_items(id),
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  equipped     BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX IF NOT EXISTS nuggies_inventory_user_idx ON nuggies_inventory(user_id);

-- Loan system
CREATE TABLE IF NOT EXISTS nuggies_loans (
  id               BIGSERIAL PRIMARY KEY,
  lender_user_id   BIGINT NOT NULL REFERENCES users(id),
  borrower_user_id BIGINT NOT NULL REFERENCES users(id),
  principal        BIGINT NOT NULL CHECK (principal > 0),
  interest_rate    NUMERIC(5,4) NOT NULL,  -- 0.1000 = 10%
  amount_due       BIGINT NOT NULL,         -- principal + interest, rounded up
  collateral       BIGINT NOT NULL DEFAULT 0,
  due_at           TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  -- pending | active | repaid | defaulted | cancelled
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS nuggies_loans_lender_idx   ON nuggies_loans(lender_user_id);
CREATE INDEX IF NOT EXISTS nuggies_loans_borrower_idx ON nuggies_loans(borrower_user_id);
CREATE INDEX IF NOT EXISTS nuggies_loans_status_idx   ON nuggies_loans(status, due_at);

-- Marketplace (secondary market: users sell owned items to each other)
CREATE TABLE IF NOT EXISTS nuggies_market_listings (
  id              BIGSERIAL PRIMARY KEY,
  seller_user_id  BIGINT NOT NULL REFERENCES users(id),
  item_id         BIGINT NOT NULL REFERENCES nuggies_shop_items(id),
  price           BIGINT NOT NULL CHECK (price > 0),
  status          TEXT NOT NULL DEFAULT 'active', -- active | sold | cancelled
  buyer_user_id   BIGINT REFERENCES users(id),
  listed_at       TIMESTAMPTZ DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS nuggies_market_seller_idx ON nuggies_market_listings(seller_user_id);
CREATE INDEX IF NOT EXISTS nuggies_market_status_idx ON nuggies_market_listings(status, listed_at DESC);
-- Prevent duplicate active listings for same user+item
CREATE UNIQUE INDEX IF NOT EXISTS nuggies_market_active_unique
  ON nuggies_market_listings(seller_user_id, item_id)
  WHERE status = 'active';

-- Opt-out flag on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS nuggies_opted_out BOOLEAN NOT NULL DEFAULT FALSE;

-- Dedup flag on attendees (prevent double-awarding)
ALTER TABLE game_night_attendees ADD COLUMN IF NOT EXISTS nuggies_awarded BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Server Settings ───────────────────────────────────────────────────────────

INSERT INTO server_settings (key, value, label, description, is_secret) VALUES
  ('nuggies_enabled',            'true',  'Nuggies: enabled',               'Master on/off switch for all Nuggies features',          false),
  ('nuggies_daily_amount',       '75',    'Nuggies: daily claim',            'Nuggies awarded per /daily claim',                       false),
  ('nuggies_daily_cap',          '600',   'Nuggies: daily earn cap',         'Max earnable per CST calendar day (all sources)',        false),
  ('nuggies_game_cooldown_secs', '3',     'Nuggies: game cooldown (s)',      'Min seconds between gambling commands per user',         false),
  ('nuggies_max_bet',            '500',   'Nuggies: max bet',                'Max bet in any gambling game',                          false),
  ('nuggies_attendance_amount',  '200',   'Nuggies: attendance reward',      'Awarded per finalized game night (admin-triggered)',     false),
  ('nuggies_first_link_amount',  '150',   'Nuggies: first Steam link bonus', 'One-time bonus for linking Steam account',              false),
  ('nuggies_trade_fee_pct',      '5',     'Nuggies: trade fee %',            'Platform cut on direct /give trades (Nuggies sink)',    false),
  ('nuggies_market_fee_pct',     '3',     'Nuggies: market fee %',           'Platform cut on marketplace sales (Nuggies sink)',      false),
  ('nuggies_loan_max_days',      '7',     'Nuggies: max loan duration (d)',  'Maximum days allowed for loan repayment',               false),
  ('nuggies_loan_default_rate',  '10',    'Nuggies: default loan rate %',    'Default interest rate offered on /loan offer',          false),
  ('nuggies_give_min',           '1',     'Nuggies: trade min amount',       'Minimum amount for /give command',                      false),
  ('nuggies_give_max',           '1000',  'Nuggies: trade max amount',       'Maximum amount for /give command',                      false)
ON CONFLICT (key) DO NOTHING;

-- ── Shop Seed: 20 Items ────────────────────────────────────────────────────────

INSERT INTO nuggies_shop_items (name, description, price, item_type, item_data) VALUES
  -- Titles (10)
  ('Landlocked',        'Ironic, given the island.',                                 300,  'title', '{"emoji":"🔒","label":"Landlocked","color":"#94a3b8"}'),
  ('Crispy',            'A little extra heat never hurt anyone.',                    350,  'title', '{"emoji":"🔥","label":"Crispy","color":"#f97316"}'),
  ('Saltwater',         'You''ve been in the ocean too long.',                       400,  'title', '{"emoji":"🧂","label":"Saltwater","color":"#38bdf8"}'),
  ('Palm Reader',       'You know things. Coconut things.',                          600,  'title', '{"emoji":"🤚","label":"Palm Reader","color":"#86efac"}'),
  ('Deep Fried',        'A title bestowed only upon the crispiest islanders.',       500,  'title', '{"emoji":"🍗","label":"Deep Fried","color":"#f59e0b"}'),
  ('Shore Patrol',      'Someone''s gotta watch the shoreline.',                    750,  'title', '{"emoji":"🏖️","label":"Shore Patrol","color":"#fbbf24"}'),
  ('Tide Turner',       'Shifting the current since day one.',                      800,  'title', '{"emoji":"🌊","label":"Tide Turner","color":"#22d3ee"}'),
  ('Island Elder',      'Seniority has its perks.',                                1000,  'title', '{"emoji":"🌴","label":"Island Elder","color":"#4ade80"}'),
  ('The Boneless One',  'Fully boneless. Completely committed.',                   2500,  'title', '{"emoji":"🦴","label":"The Boneless One","color":"#e879f9"}'),
  ('Nuggie Millionaire','You have too many Nuggies and we respect it.',            5000,  'title', '{"emoji":"💰","label":"Nuggie Millionaire","color":"#facc15"}'),
  -- Flairs (5)
  ('AFK',               'Technically present.',                                     150,  'flair', '{"emoji":"💤","color":"#94a3b8"}'),
  ('Shore Gang',        'Ride the waves. Collect the crumbs.',                     250,  'flair', '{"emoji":"🏄","color":"#38bdf8"}'),
  ('Night Owl',         'Still online at 3am? Relatable.',                         300,  'flair', '{"emoji":"🦉","color":"#818cf8"}'),
  ('Loot Goblin',       'If it drops, it''s mine.',                               350,  'flair', '{"emoji":"👺","color":"#22c55e"}'),
  ('Strategist',        'Three moves ahead. At least.',                            400,  'flair', '{"emoji":"♟️","color":"#f59e0b"}'),
  -- Badges (5)
  ('Coconut',           'Round, white inside, impossible to open.',                500,  'badge', '{"emoji":"🥥","color":"#d4a574"}'),
  ('Boneless Badge',    'No bones about it.',                                      750,  'badge', '{"emoji":"🦴","color":"#fbbf24"}'),
  ('Shark',             'Apex predator of the island waters.',                    1000,  'badge', '{"emoji":"🦈","color":"#0ea5e9"}'),
  ('Golden Nugget',     'Rare. Coveted. Delicious.',                             1500,  'badge', '{"emoji":"⭐","color":"#f59e0b"}'),
  ('OG Islander',       'Been here since the beginning.',                        2000,  'badge', '{"emoji":"🏝️","color":"#4ade80"}')
ON CONFLICT DO NOTHING;

-- ── Retroactive First Steam Link Bonus ────────────────────────────────────────

DO $$
DECLARE
  rec    RECORD;
  bonus  BIGINT;
BEGIN
  SELECT CAST(value AS BIGINT) INTO bonus
    FROM server_settings WHERE key = 'nuggies_first_link_amount';
  bonus := COALESCE(bonus, 150);

  FOR rec IN
    SELECT u.id
    FROM users u
    INNER JOIN steam_links sl ON sl.user_id = u.id
    WHERE u.nuggies_opted_out = FALSE
      AND NOT EXISTS (
        SELECT 1 FROM nuggies_transactions t
        WHERE t.user_id = u.id AND t.reference_id = 'first_steam_link'
      )
  LOOP
    INSERT INTO nuggies_balances (user_id, balance)
      VALUES (rec.id, bonus)
      ON CONFLICT (user_id)
      DO UPDATE SET balance = nuggies_balances.balance + bonus, updated_at = NOW();

    INSERT INTO nuggies_transactions (user_id, amount, type, reason, reference_id)
      VALUES (rec.id, bonus, 'first_link', 'First Steam account link bonus', 'first_steam_link');
  END LOOP;
END $$;
