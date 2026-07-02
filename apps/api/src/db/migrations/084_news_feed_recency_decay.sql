-- News feed recency-decay half-life setting (in hours).
--
-- The Gaming News feed ranks cards by a signal score (AI relevance + story
-- coverage + net votes) multiplied by a recency decay: 0.5^(ageHours / halfLife).
-- This keeps the hero (top card) reserved for the freshest BIG stories and
-- rotating instead of pinning to one card. Default 8 hours -> the hero turns
-- over roughly 3x/day. Lower = faster rotation; raise it to let big stories
-- hold the top slot longer. Safe to re-run -- ON CONFLICT DO NOTHING.

INSERT INTO server_settings (key, value, label, description, is_secret) VALUES
  (
    'news_feed_decay_half_life_hours',
    '8',
    'News feed recency half-life (hours)',
    'How fast a Gaming News card''s ranking weight fades with age. The feed score (AI relevance + coverage + net votes) is multiplied by 0.5^(ageHours / this value), so weight halves every N hours and the hero card rotates to fresher big stories (default 8h ~= 3x/day turnover). Lower tightens rotation; raise it to let big stories stay on top longer. Default 8.',
    FALSE
  )
ON CONFLICT (key) DO NOTHING;
