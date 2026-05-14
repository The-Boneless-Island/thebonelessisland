-- Per-provider API key rows. Lets the admin configure multiple providers in
-- parallel (e.g. Anthropic for curation, OpenAI for embeddings, Gemini for
-- taglines) without juggling a single `ai_api_key` slot.
--
-- The legacy `ai_api_key` row remains as a fallback so existing installs keep
-- working until the admin migrates their key into the per-provider slot.

INSERT INTO server_settings (key, value, label, description, is_secret) VALUES
  (
    'anthropic_api_key',
    '',
    'Anthropic API key',
    'Stored encrypted; never displayed after saving. Used whenever AI features run against an Anthropic (Claude) model. Falls back to the legacy ai_api_key row or ANTHROPIC_API_KEY env var when blank.',
    TRUE
  ),
  (
    'openai_api_key',
    '',
    'OpenAI API key',
    'Stored encrypted; never displayed after saving. Used for OpenAI (GPT) chat models AND for OpenAI text-embedding-3-small clustering. Falls back to the legacy ai_api_key row or OPENAI_API_KEY env var when blank.',
    TRUE
  ),
  (
    'gemini_api_key',
    '',
    'Google Gemini API key',
    'Stored encrypted; never displayed after saving. Used whenever AI features run against a Google Gemini model. Falls back to the legacy ai_api_key row or GEMINI_API_KEY env var when blank.',
    TRUE
  )
ON CONFLICT (key) DO NOTHING;
