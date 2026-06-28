import { db } from "../../db/client.js";

// Process-lifetime running tally of estimated AI spend. Providers call
// `recordAiCost` after every billable API call; callers (e.g. the recurate
// job) snapshot via `getAiCostTotalUsd()` before/after to compute a per-run
// cost without any external bookkeeping.
//
// Estimates use published per-million-token list prices and don't account for
// invoiced overhead (e.g. trial credit drift, monthly minimums). Treat as a
// signal, not a ground-truth invoice.
//
// In addition to the in-memory total, every call upserts the cost into the
// `ai_cost_ledger` row for CURRENT_DATE so the admin dashboard can show
// today's total across API restarts (the in-memory counter resets each boot).

let totalUsd = 0;

export function recordAiCost(_provider: string, _model: string, usd: number): void {
  if (!Number.isFinite(usd) || usd <= 0) return;
  totalUsd += usd;
  // Fire-and-forget DB persistence. A DB outage must NEVER break an AI call,
  // so swallow errors here and log them as warnings only.
  db.query(
    `INSERT INTO ai_cost_ledger (date, cost_usd, call_count, updated_at)
     VALUES (CURRENT_DATE, $1, 1, NOW())
     ON CONFLICT (date) DO UPDATE
       SET cost_usd   = ai_cost_ledger.cost_usd + EXCLUDED.cost_usd,
           call_count = ai_cost_ledger.call_count + 1,
           updated_at = NOW()`,
    [usd]
  ).catch((err: unknown) => {
    console.warn("[ai:tally] ledger upsert failed:", err instanceof Error ? err.message : err);
  });
}

export function getAiCostTotalUsd(): number {
  return totalUsd;
}

/** Today's persisted spend + call count, read from the DB ledger. */
export async function getTodayCostUsd(): Promise<{ usd: number; calls: number }> {
  try {
    const r = await db.query<{ cost_usd: string; call_count: string }>(
      `SELECT cost_usd::text, call_count::text
         FROM ai_cost_ledger
        WHERE date = CURRENT_DATE`
    );
    return {
      usd: parseFloat(r.rows[0]?.cost_usd ?? "0"),
      calls: parseInt(r.rows[0]?.call_count ?? "0", 10)
    };
  } catch (err) {
    console.warn("[ai:tally] getTodayCostUsd failed:", err instanceof Error ? err.message : err);
    return { usd: 0, calls: 0 };
  }
}

/**
 * Month-to-date AI spend from the ledger.
 *
 * Fails OPEN (returns 0) on any DB error so a transient hiccup never blocks
 * curation. The Cloudflare gateway spend limit is the real hard backstop.
 */
export async function getMonthToDateCostUsd(): Promise<number> {
  try {
    const r = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(cost_usd), 0)::text AS total
         FROM ai_cost_ledger
        WHERE date >= date_trunc('month', CURRENT_DATE)`
    );
    return parseFloat(r.rows[0]?.total ?? "0");
  } catch (err) {
    console.warn("[ai:tally] getMonthToDateCostUsd failed:", err instanceof Error ? err.message : err);
    return 0;
  }
}
