-- Admin alert channel for bot operational visibility.
--
-- The bot_announcements outbox can fail invisibly today: a config-gated drop
-- (announcements toggle OFF / milestone_channel_id unset) marks the row
-- processed with no trace anywhere an admin looks, and a dead-lettered row
-- (5 failed delivery attempts — bad channel id, missing permissions) leaves
-- last_error in the DB "for admin visibility" that no surface actually shows.
--
-- When this channel id is set, the bot posts a short ops note there whenever
-- an announcement is dropped by config or dead-lettered by delivery failure.
-- Blank (default) = alerts off, matching the opt-in pattern of every other
-- channel bridge setting.

INSERT INTO server_settings (key, value, label, description, is_secret) VALUES
  (
    'admin_alert_channel_id',
    '',
    'Admin alerts channel ID',
    'Discord channel ID where the bot posts operational alerts: announcements dropped because a toggle is off or a channel is unset, and deliveries that failed permanently after retries. Blank = no alerts.',
    FALSE
  )
ON CONFLICT (key) DO NOTHING;
