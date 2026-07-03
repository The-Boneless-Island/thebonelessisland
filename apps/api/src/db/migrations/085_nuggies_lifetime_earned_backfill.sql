-- Re-sync nuggies_balances.lifetime_earned with the ledger.
--
-- Migration 071 denormalized lifetime_earned onto nuggies_balances and did a
-- one-shot backfill, but several balance-crediting code paths outside
-- applyTransaction (trade credit, loan accept/repay/default credits, market
-- sale credit) never incremented the column, so it has drifted from the
-- ledger since. This PR fixes those call sites going forward; this migration
-- recomputes every row once so existing balances catch up immediately.
--
-- Deterministic + idempotent -- safe to re-run any number of times, always
-- recomputes the same value from nuggies_transactions (the immutable ledger).

UPDATE nuggies_balances b
SET lifetime_earned = COALESCE((
  SELECT SUM(t.amount)::bigint
  FROM nuggies_transactions t
  WHERE t.user_id = b.user_id AND t.amount > 0
), 0);
