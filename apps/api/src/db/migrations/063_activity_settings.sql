-- Activity-feed tuning knobs, surfaced in the admin Settings page.
--   activity_casino_min_net    — a casino win posts to the feed only when the
--                                net gain (payout − bet) is at or above this.
--   forums_reaction_milestone  — a post posts to the feed once its reaction
--                                count first reaches this number.
INSERT INTO server_settings (key, value, label, description, is_secret) VALUES
  ('activity_casino_min_net',   '250', 'Activity: casino big-win threshold', 'Minimum net win (payout minus bet) for a casino win to appear in the activity feed', false),
  ('forums_reaction_milestone', '5',   'Activity: forum reaction milestone', 'A forum post appears in the activity feed when its reactions first reach this count', false)
ON CONFLICT (key) DO NOTHING;
