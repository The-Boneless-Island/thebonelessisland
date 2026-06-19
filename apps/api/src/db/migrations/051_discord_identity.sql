-- Discord identity enrichment.
--
-- discord_profiles holds the OAuth-derived identity for the logged-in user.
-- The /users/@me response (identify scope — NO extra scope needed) already
-- includes banner, accent_color, global_name, and premium_type; auth.ts kept
-- only id/username/avatar. profile_blurb is a site-native "about me" because
-- Discord does NOT expose the real bio through any API/scope.
ALTER TABLE discord_profiles ADD COLUMN IF NOT EXISTS banner_url    TEXT;
ALTER TABLE discord_profiles ADD COLUMN IF NOT EXISTS accent_color  INTEGER;     -- 0xRRGGBB int
ALTER TABLE discord_profiles ADD COLUMN IF NOT EXISTS global_name   TEXT;
ALTER TABLE discord_profiles ADD COLUMN IF NOT EXISTS premium_type  INTEGER;     -- 0 none, 1 classic, 2 nitro, 3 basic
ALTER TABLE discord_profiles ADD COLUMN IF NOT EXISTS profile_blurb TEXT;

-- guild_members is the synced roster (all members). The bulk member object
-- already carries joined_at, premium_since (boost date), the guild-specific
-- avatar hash, and global_name — all previously discarded. activity_name /
-- activity_type come from the bot's presence push (real "Playing X" instead of
-- the hardcoded "In a voice channel"). banner_url / accent_color require a
-- per-user GET /users/:id, fetched lazily on profile view (banner_checked_at
-- gates the refresh).
ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS joined_at_guild   TIMESTAMPTZ;
ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS premium_since     TIMESTAMPTZ;
ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS guild_avatar_url  TEXT;
ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS global_name       TEXT;
ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS activity_name     TEXT;
ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS activity_type     INTEGER;
ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS banner_url        TEXT;
ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS accent_color      INTEGER;
ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS banner_checked_at TIMESTAMPTZ;
