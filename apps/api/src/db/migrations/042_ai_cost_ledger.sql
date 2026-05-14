-- Daily AI spend ledger. Every billable provider call upserts into the row
-- for CURRENT_DATE so the admin dashboard can surface today's total even
-- across API restarts. The in-memory tally in lib/ai/usageTally remains for
-- per-run deltas (e.g. the recurate job's own cost snapshot).

CREATE TABLE IF NOT EXISTS ai_cost_ledger (
  date        DATE PRIMARY KEY,
  cost_usd    NUMERIC(10,5) NOT NULL DEFAULT 0,
  call_count  INTEGER       NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Warn-only threshold. Banner appears in admin when today's spend crosses
-- this dollar amount. Does NOT block calls. Set to 0 to disable the banner.
INSERT INTO server_settings (key, value, label, description, is_secret) VALUES
  (
    'ai_daily_cost_warn_usd',
    '5.00',
    'AI daily cost warning threshold (USD)',
    'When estimated AI spend for today crosses this dollar amount, admin pages surface a warning banner. Warn-only — does not block AI calls. Set to 0 to disable the banner entirely.',
    FALSE
  )
ON CONFLICT (key) DO NOTHING;
