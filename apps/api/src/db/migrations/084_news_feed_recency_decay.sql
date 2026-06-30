-- News feed recency-decay half-life setting.
--
-- The Gaming News feed ranks cards by (relevance + vote weight) multiplied by a
-- recency decay: 0.5^(ageDays / halfLife). This keeps the hero (top card)
-- rotating to fresh high-quality stories instead of pinning to one high-score
-- card indefinitely. Lower = faster rotation; higher = relevance/votes dominate
-- longer. Default 2 days. Set very high to effectively disable the decay.
-- Safe to re-run — ON CONFLICT DO NOTHING.

INSERT INTO server_settings (key, value, label, description, is_secret) VALUES
  (
    'news_feed_decay_half_life_days',
    '2',
    'News feed recency half-life (days)',
    'How fast a Gaming News card''s ranking weight fades with age. The feed score (relevance + net votes) is multiplied by 0.5^(ageDays / this value), so weight halves every N days and the hero card rotates to fresher stories. Lower tightens rotation; raise it if you want high-relevance stories to stay on top longer. Default 2.',
    FALSE
  )
ON CONFLICT (key) DO NOTHING;
