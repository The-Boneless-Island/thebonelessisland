-- Soft monthly AI spend cap setting (Phase 1c).
--
-- When month-to-date spend reaches this threshold the news curation LLM calls
-- are paused gracefully (ingest/embed/absorb still run). The Cloudflare gateway
-- spend limit is the real hard backstop; this is a defense-in-depth check at
-- the app layer so the feed doesn't churn after the gateway cuts off.
--
-- Default: $10 USD/month (aligns with the gateway spend-limit default).
-- Safe to re-run — ON CONFLICT DO NOTHING.

INSERT INTO server_settings (key, value, label, description, is_secret) VALUES
  (
    'ai_monthly_budget_usd',
    '10',
    'Monthly AI budget (USD)',
    'Soft monthly AI spend cap in USD. When month-to-date spend from ai_cost_ledger meets or exceeds this value, news curation LLM calls are paused gracefully until the next calendar month. Ingest, embedding, and Reddit absorb still run. Set to 0 to disable the check. The Cloudflare gateway spend limit is the hard backstop.',
    FALSE
  )
ON CONFLICT (key) DO NOTHING;
