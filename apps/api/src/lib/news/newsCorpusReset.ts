import { db } from "../../db/client.js";

export const CORPUS_RESET_CONFIRM_PHRASE = "SCRUB THE ARCHIVE";

export type CorpusResetResult = {
  deletedArticles: number;
  deletedFeedback: number;
  deletedReads: number;
  clearedRuns: number;
  resetSourceStats: number;
};

/** Wipe all ingested general news rows and pipeline history. Keeps source registry + member mutes. */
export async function resetGeneralNewsCorpus(): Promise<CorpusResetResult> {
  const counts = await db.query<{
    articles: string;
    feedback: string;
    reads: string;
    runs: string;
    sources: string;
  }>(
    `
      SELECT
        (SELECT COUNT(*)::text FROM general_news) AS articles,
        (SELECT COUNT(*)::text FROM general_news_feedback) AS feedback,
        (SELECT COUNT(*)::text FROM general_news_reads) AS reads,
        (SELECT COUNT(*)::text FROM news_curation_runs) AS runs,
        (SELECT COUNT(*)::text FROM news_source_registry) AS sources
    `
  );
  const before = counts.rows[0];

  await db.query("BEGIN");
  try {
    await db.query("TRUNCATE general_news RESTART IDENTITY CASCADE");

    const runs = await db.query("DELETE FROM news_curation_runs RETURNING id");

    await db.query(
      `
        UPDATE news_pipeline_jobs
           SET state = 'idle',
               progress = '{}'::jsonb,
               error = NULL,
               started_at = NULL,
               finished_at = NULL,
               updated_at = NOW()
      `
    );

    const sources = await db.query(
      `
        UPDATE news_source_registry
           SET last_success_at = NULL,
               fail_streak = 0,
               items_fetched_total = 0,
               items_curated_total = 0,
               validation_fail_total = 0
         RETURNING id
      `
    );

    await db.query("COMMIT");

    const verify = await db.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM general_news`);
    const remaining = parseInt(verify.rows[0]?.c ?? "0", 10);
    if (remaining > 0) {
      throw new Error(`Corpus reset incomplete — ${remaining} general_news row(s) still present`);
    }

    return {
      deletedArticles: parseInt(before?.articles ?? "0", 10),
      deletedFeedback: parseInt(before?.feedback ?? "0", 10),
      deletedReads: parseInt(before?.reads ?? "0", 10),
      clearedRuns: runs.rowCount ?? 0,
      resetSourceStats: sources.rowCount ?? 0
    };
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}
