-- Clear stale presence text. The members sync used to fabricate
-- "Offline or not in voice" for any user not in a voice channel, which the
-- UI then surfaced as a status. Strip those rows so only meaningful presence
-- text remains. Real voice users will be re-stamped on the next sync.

UPDATE guild_members
SET rich_presence_text = NULL
WHERE rich_presence_text = 'Offline or not in voice';
