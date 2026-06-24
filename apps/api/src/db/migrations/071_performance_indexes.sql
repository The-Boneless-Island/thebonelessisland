-- Performance indexes for high-frequency query patterns.

CREATE INDEX IF NOT EXISTS idx_guild_members_guild_in_guild
  ON guild_members (guild_id, in_guild)
  WHERE in_guild = TRUE;

CREATE INDEX IF NOT EXISTS idx_guild_members_guild_in_voice
  ON guild_members (guild_id, in_voice)
  WHERE in_voice = TRUE;

CREATE INDEX IF NOT EXISTS idx_nuggies_inventory_user_equipped
  ON nuggies_inventory (user_id)
  WHERE equipped = TRUE;

CREATE INDEX IF NOT EXISTS idx_nuggies_tx_user_positive
  ON nuggies_transactions (user_id)
  WHERE amount > 0;

CREATE INDEX IF NOT EXISTS idx_activity_events_created_id
  ON activity_events (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_actor_created
  ON activity_events (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_steam_links_last_synced
  ON steam_links (last_synced_at);

CREATE INDEX IF NOT EXISTS idx_users_steam_visibility_public
  ON users (steam_visibility)
  WHERE steam_visibility <> 'private';

CREATE INDEX IF NOT EXISTS idx_game_night_attendees_award
  ON game_night_attendees (game_night_id, nuggies_awarded);

-- Denormalize lifetime earned onto balance row to avoid correlated SUM on /profile/me.
ALTER TABLE nuggies_balances
  ADD COLUMN IF NOT EXISTS lifetime_earned BIGINT NOT NULL DEFAULT 0;

UPDATE nuggies_balances nb
SET lifetime_earned = COALESCE((
  SELECT SUM(amount)::bigint
  FROM nuggies_transactions t
  WHERE t.user_id = nb.user_id AND t.amount > 0
), 0);
