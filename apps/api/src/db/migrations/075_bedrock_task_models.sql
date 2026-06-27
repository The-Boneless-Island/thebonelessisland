-- Per-task Bedrock model routing (curation vs chat vs light repair/blurbs).

INSERT INTO server_settings (key, value, label, description, is_secret) VALUES
  (
    'bedrock_model_curation',
    '',
    'Bedrock curation model',
    'Bedrock model id for news curation (long structured JSON). When blank and ai_provider is bedrock, defaults to Claude Haiku — recommended for 300–500 word summaries.',
    FALSE
  ),
  (
    'bedrock_model_chat',
    '',
    'Bedrock chat model',
    'Bedrock model id for Nuggie AI chat. When blank, falls back to ai_model, then Nova Lite.',
    FALSE
  ),
  (
    'bedrock_model_light',
    '',
    'Bedrock light tasks model',
    'Bedrock model id for validation repair, taglines, and blurbs. When blank, defaults to Nova Lite.',
    FALSE
  )
ON CONFLICT (key) DO NOTHING;
