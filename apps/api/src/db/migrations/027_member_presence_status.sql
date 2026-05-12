-- Real Discord presence (online/idle/dnd/offline) pushed by the bot via
-- gateway PresenceUpdate events. Voice state stays in in_voice;
-- presence_status reflects the user's overall Discord status.

ALTER TABLE guild_members
  ADD COLUMN IF NOT EXISTS presence_status TEXT;

CREATE INDEX IF NOT EXISTS idx_guild_members_presence_status
  ON guild_members (presence_status);
