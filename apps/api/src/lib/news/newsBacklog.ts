import { db } from "../../db/client.js";

export const CURATION_WINDOW_DAYS = 14;

/** Mark never-curated rows outside the auto-curation window as handled (no AI spend). */
export async function retireStaleUncuratedBacklog(
  windowDays: number = CURATION_WINDOW_DAYS
): Promise<number> {
  const r = await db.query(
    `
      UPDATE general_news
         SET ai_curated_at = NOW(),
             ai_relevance_score = 0,
             ai_summary = NULL,
             ai_validation_failed = FALSE,
             ai_last_validation_errors = NULL,
             pre_filter_reason = 'outside_curation_window'
       WHERE ai_curated_at IS NULL
         AND published_at < NOW() - ($1::text || ' days')::interval
    `,
    [String(windowDays)]
  );
  const n = r.rowCount ?? 0;
  if (n > 0) {
    console.log(`[generalNews] retired ${n} stale uncurated row(s) outside ${windowDays}-day window`);
  }
  return n;
}

export async function countGeneralNewsArticles(): Promise<number> {
  const r = await db.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM general_news`);
  return parseInt(r.rows[0]?.c ?? "0", 10);
}

/** Fresh corpus = small enough to curate without the 14-day window filter. */
export async function isFreshCorpusMode(): Promise<boolean> {
  const total = await countGeneralNewsArticles();
  return total <= 1500;
}
