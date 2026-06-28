-- Cloudflare AI Gateway config + provider-agnostic task model routing.
--
-- Gateway keys wire provider clients through the CF AI Gateway edge (cost
-- visibility, caching, spend limits) without touching Unified Billing.
-- Task routing keys let any provider (gemini, openai, anthropic, bedrock)
-- use different models per workload; bedrock_model_* keys remain for back-compat.
--
-- All keys use ON CONFLICT DO NOTHING — safe to re-run.

INSERT INTO server_settings (key, value, label, description, is_secret) VALUES

  -- ── Cloudflare AI Gateway ─────────────────────────────────────────────────

  (
    'ai_gateway_enabled',
    'false',
    'AI Gateway enabled',
    'When true, all AI provider clients (OpenAI, Gemini, Anthropic) route through the Cloudflare AI Gateway base URL instead of calling the provider directly. Strictly additive — set false to use providers directly.',
    FALSE
  ),
  (
    'ai_gateway_account_id',
    '3764b4b090876b4293200d6b5d5e3e8c',
    'AI Gateway account ID',
    'Cloudflare account ID for the AI Gateway. Used to build the gateway base URL: https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/{slug}.',
    FALSE
  ),
  (
    'ai_gateway_id',
    'boneless-news',
    'AI Gateway ID',
    'Cloudflare AI Gateway name (slug) within the account. Default: boneless-news.',
    FALSE
  ),
  (
    'ai_gateway_token',
    '',
    'AI Gateway auth token',
    'Token sent as cf-aig-authorization: Bearer <token> on every provider request when the gateway is enabled. Required for authenticated gateways. Leave blank if the gateway is unauthenticated.',
    TRUE
  ),

  -- ── Provider-agnostic task model routing ─────────────────────────────────
  -- These override the active provider''s default model for specific workloads.
  -- Works for any ai_provider value (gemini, openai, anthropic, bedrock).
  -- New preferred alternative to the bedrock_model_* keys (which remain for
  -- back-compat when ai_provider = bedrock and these keys are blank).

  (
    'ai_model_curation',
    '',
    'Model — news curation',
    'Model id used for news curation (long structured JSON batches). When blank: Gemini uses gemini-2.5-flash; Bedrock falls back to bedrock_model_curation then Claude Haiku; others use ai_model.',
    FALSE
  ),
  (
    'ai_model_chat',
    '',
    'Model — AI chat (Nuggie)',
    'Model id used for Nuggie AI chat responses. When blank: Gemini uses gemini-2.5-flash-lite; Bedrock falls back to bedrock_model_chat then Nova Lite; others use ai_model.',
    FALSE
  ),
  (
    'ai_model_light',
    '',
    'Model — light tasks',
    'Model id used for fast/cheap tasks: validation repair, taglines, blurbs. When blank: Gemini uses gemini-2.5-flash-lite; Bedrock falls back to bedrock_model_light then Nova Lite; others use ai_model.',
    FALSE
  )

ON CONFLICT (key) DO NOTHING;
