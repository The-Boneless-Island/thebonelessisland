-- Append meme-inflected esports taglines to splash rotation.
-- Stores as JSON array in single setting; uses jsonb concat to merge.
-- Idempotent: if any of these taglines already exist, the merge appends
-- duplicates only on first run. The weekly auto-rotator picks at random,
-- so duplicates only mildly bias the distribution if rerun by hand.

UPDATE server_settings
SET value = (
  value::jsonb || '[
    "Hardstuck Iron since launch.",
    "Patch notes when?",
    "Nerf the loot goblin.",
    "Buff the boneless.",
    "LAN energy, online execution.",
    "We coach for free.",
    "Cheese strat enjoyer.",
    "Galaxy brain take incoming.",
    "He''s just HIM.",
    "Touched grass once. Didn''t take.",
    "Malding peacefully.",
    "We''re so back. (Again.)",
    "POG and hopium only."
  ]'::jsonb
)::text
WHERE key = 'splash_taglines';
