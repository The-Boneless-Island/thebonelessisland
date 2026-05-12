-- Lower default game cooldown from 120s to 3s.
-- Only updates rows that still hold the original default; preserves any
-- admin-tuned override.

UPDATE server_settings
SET value = '3'
WHERE key = 'nuggies_game_cooldown_secs'
  AND value = '120';
