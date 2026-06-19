import { Router } from "express";
import { db } from "../db/client.js";
import { requireParentRole, requireSession } from "../lib/auth.js";
import { getAiCostTotalUsd } from "../lib/ai/usageTally.js";
import { backfillEmbeddings, isEmbeddingColumnAvailable } from "../lib/news/embeddings.js";
import { ingestAndCurateGeneralNews, curateUncuratedGeneralNews, resetAllCuration } from "../lib/generalNewsIngestion.js";

export const generalNewsRouter = Router();

type GeneralNewsRow = {
  id: number;
  source_type: string;
  source_name: string;
  external_id: string;
  title: string;
  url: string;
  contents: string | null;
  author: string | null;
  image_url: string | null;
  published_at: string;
  matched_tags: string[];
  ai_relevance_score: number | null;
  ai_summary: string | null;
  ai_subtitle: string | null;
  ai_tags: string[];
  ai_why_recommended: string | null;
  ai_label: string | null;
  ai_spoiler_warning: boolean;
  ai_game_title: string | null;
  ai_title: string | null;
  ai_sources: string[] | null;
  upvotes: number;
  downvotes: number;
};

/**
 * GET /news/general
 * Returns curated general gaming news from external sources.
 * Triggers background ingestion to top-up the feed if needed.
 */
generalNewsRouter.get("/general", async (_req, res) => {
  try {
    // Display-time fingerprint collapse — defensive layer beneath curation-time
    // merge. Collapses cards into a single primary along TWO axes:
    //  1. Exact-fingerprint match (within any date).
    //  2. Same fingerprint ENTITY (left of the ":") within the same calendar
    //     week. Handles the common failure mode where AI emits drifting
    //     event-topic handles for the same news cycle ("cadence-shift" vs
    //     "update-cadence" vs "six-month-cadence" — all entity=arc-raiders).
    // Rows without a fingerprint partition by their unique external_id so
    // they never accidentally merge with anything.
    //
    // Cluster_key construction:
    //   if fp present: lower(entity) || '::' || week_bucket  →  group by entity/week
    //   else:          external_id                            →  always rk=1
    const result = await db.query<GeneralNewsRow>(
      `
        WITH ranked AS (
          SELECT
            gn.*,
            CASE
              WHEN gn.ai_story_fingerprint IS NOT NULL
                AND gn.ai_story_fingerprint <> ''
                AND POSITION(':' IN gn.ai_story_fingerprint) > 1
                THEN LOWER(split_part(gn.ai_story_fingerprint, ':', 1))
                  || '::'
                  || to_char(DATE_TRUNC('week', gn.published_at), 'YYYY-MM-DD')
              ELSE gn.external_id
            END AS cluster_key,
            ROW_NUMBER() OVER (
              PARTITION BY
                CASE
                  WHEN gn.ai_story_fingerprint IS NOT NULL AND gn.ai_story_fingerprint <> ''
                    THEN LOWER(split_part(gn.ai_story_fingerprint, ':', 1))
                      || '::'
                      || to_char(DATE_TRUNC('week', gn.published_at), 'YYYY-MM-DD')
                  ELSE gn.external_id
                END
              ORDER BY gn.ai_relevance_score DESC NULLS LAST, gn.published_at DESC
            ) AS rk
          FROM general_news gn
          WHERE COALESCE(gn.ai_relevance_score, 1) > 0
            AND gn.ai_validation_failed = FALSE
        ),
        cluster_urls AS (
          SELECT
            cluster_key,
            array_agg(DISTINCT url) AS sibling_urls
          FROM ranked
          WHERE ai_story_fingerprint IS NOT NULL AND ai_story_fingerprint <> ''
          GROUP BY cluster_key
          HAVING COUNT(*) > 1
        )
        SELECT
          r.id,
          r.source_type,
          r.source_name,
          r.external_id,
          r.title,
          r.url,
          r.contents,
          r.author,
          r.image_url,
          r.published_at,
          r.matched_tags,
          r.ai_relevance_score,
          r.ai_summary,
          r.ai_subtitle,
          r.ai_tags,
          r.ai_why_recommended,
          r.ai_label,
          r.ai_spoiler_warning,
          r.ai_game_title,
          r.ai_title,
          CASE
            WHEN cu.sibling_urls IS NOT NULL THEN (
              SELECT array_agg(DISTINCT u)
              FROM unnest(COALESCE(r.ai_sources, '{}'::text[]) || cu.sibling_urls) AS u
            )
            ELSE r.ai_sources
          END AS ai_sources,
          fb.upvotes,
          fb.downvotes
        FROM ranked r
        LEFT JOIN cluster_urls cu ON cu.cluster_key = r.cluster_key
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) FILTER (WHERE rating = 1)::int  AS upvotes,
            COUNT(*) FILTER (WHERE rating = -1)::int AS downvotes
          FROM general_news_feedback
          WHERE news_id = r.id
        ) fb ON true
        WHERE r.rk = 1
        ORDER BY (COALESCE(r.ai_relevance_score, 0.5) + (fb.upvotes - fb.downvotes * 0.5) * 0.08) DESC, r.published_at DESC
        LIMIT 50
      `
    );

    const news = result.rows.map((row) => ({
      id: row.id,
      sourceType: row.source_type,
      sourceName: row.source_name,
      externalId: row.external_id,
      title: row.title,
      url: row.url,
      contents: row.contents,
      author: row.author,
      imageUrl: row.image_url,
      publishedAt: row.published_at,
      matchedTags: row.matched_tags,
      aiRelevanceScore: row.ai_relevance_score,
      aiSummary: row.ai_summary,
      aiSubtitle: row.ai_subtitle,
      aiTags: row.ai_tags ?? [],
      aiWhyRecommended: row.ai_why_recommended,
      aiLabel: row.ai_label as "top_news" | "community" | "personal" | null,
      aiSpoilerWarning: row.ai_spoiler_warning,
      aiGameTitle: row.ai_game_title,
      aiTitle: row.ai_title,
      aiSources: row.ai_sources,
      upvotes: row.upvotes,
      downvotes: row.downvotes
    }));

    res.json({ news });

    // Background: top-up the feed without blocking the response
    ingestAndCurateGeneralNews().catch((err) => {
      console.error("[generalNews] Background ingestion error:", err);
    });
  } catch (err) {
    console.error("[generalNews] GET /news/general error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /news/general/ingest
 * Admin endpoint — manually trigger ingestion + curation.
 */
generalNewsRouter.post("/general/ingest", requireSession, requireParentRole, async (_req, res) => {
  try {
    const result = await ingestAndCurateGeneralNews(true); // force bypasses 1-hour cooldown
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[generalNews] POST /news/general/ingest error:", err);
    res.status(500).json({ ok: false, error: "Ingestion failed" });
  }
});

/**
 * POST /news/general/curate
 * Admin endpoint — curate any un-curated rows without re-fetching.
 */
generalNewsRouter.post("/general/curate", requireSession, requireParentRole, async (_req, res) => {
  try {
    const curated = await curateUncuratedGeneralNews();
    res.json({ ok: true, curated });
  } catch (err) {
    console.error("[generalNews] POST /news/general/curate error:", err);
    res.status(500).json({ ok: false, error: "Curation failed" });
  }
});

/**
 * POST /news/general/embed-backfill
 * Admin endpoint — populate embeddings for rows missing them. Processes up to
 * `limit` rows (default 200) per call so the request stays bounded; the admin
 * UI can poll repeatedly until count returns 0.
 */
generalNewsRouter.post("/general/embed-backfill", requireSession, requireParentRole, async (req, res) => {
  try {
    if (!(await isEmbeddingColumnAvailable())) {
      res.status(400).json({
        ok: false,
        error: "pgvector / embedding column not available. Install pgvector and re-run migration 040."
      });
      return;
    }
    const limit = Math.min(500, Math.max(1, parseInt(String((req.body as { limit?: number } | undefined)?.limit ?? 200), 10)));
    const embedded = await backfillEmbeddings(limit);
    const remainingResult = await db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM general_news WHERE embedding IS NULL`
    );
    const remaining = parseInt(remainingResult.rows[0]?.c ?? "0", 10);
    res.json({ ok: true, embedded, remaining });
  } catch (err) {
    console.error("[generalNews] embed-backfill error:", err);
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "Backfill failed" });
  }
});

// ── Recurate Job (background, polled by client) ───────────────────────────────

type RecurateJobState = "idle" | "running" | "done" | "error";

type RecurateJob = {
  state: RecurateJobState;
  startedAt: number | null;
  finishedAt: number | null;
  reset: number;       // rows reset (also = total to curate)
  curated: number;     // primary cards emitted (no dupes / merges)
  processed: number;   // every row touched: primary + merged + duplicate + failed
  merged: number;      // rows absorbed into an existing primary
  duplicates: number;  // rows the AI flagged as in-batch duplicates of another article
  failed: number;      // rows where validation never reached threshold (stored anyway)
  total: number;       // = reset, snapshot for display
  costUsd: number;     // estimated USD spent on AI calls during this run
  error: string | null;
};

const FRESH_JOB: RecurateJob = {
  state: "idle",
  startedAt: null,
  finishedAt: null,
  reset: 0,
  curated: 0,
  processed: 0,
  merged: 0,
  duplicates: 0,
  failed: 0,
  total: 0,
  costUsd: 0,
  error: null
};

let recurateJob: RecurateJob = { ...FRESH_JOB };

const RECURATE_MAX_PASSES = 50; // hard safety: 50 × 25 = 1250 articles cap
const RECURATE_BATCH_PAUSE_MS = 250;

// Cooperative cancel flag. Recurate loop checks between passes and exits early.
let recurateCancelRequested = false;

async function countUncurated(): Promise<number> {
  const r = await db.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM general_news WHERE ai_curated_at IS NULL`
  );
  return parseInt(r.rows[0]?.c ?? "0", 10);
}

async function snapshotBreakdown(): Promise<{
  curated: number;
  merged: number;
  duplicates: number;
  failed: number;
}> {
  // Primary cards: curated, non-failed, score > 0.
  // Merged/duplicate absorbed: curated, score = 0, summary NULL (merge child) OR
  //   score = 0 with non-null summary (regular dup).
  // Failed: ai_validation_failed = TRUE.
  const r = await db.query<{
    curated: string;
    score_zero_no_summary: string;
    score_zero_with_summary: string;
    failed: string;
  }>(
    `
      SELECT
        COUNT(*) FILTER (WHERE ai_curated_at IS NOT NULL AND ai_relevance_score > 0 AND ai_validation_failed = FALSE)::text AS curated,
        COUNT(*) FILTER (WHERE ai_curated_at IS NOT NULL AND ai_relevance_score = 0 AND ai_summary IS NULL)::text AS score_zero_no_summary,
        COUNT(*) FILTER (WHERE ai_curated_at IS NOT NULL AND ai_relevance_score = 0 AND ai_summary IS NOT NULL)::text AS score_zero_with_summary,
        COUNT(*) FILTER (WHERE ai_validation_failed = TRUE)::text AS failed
      FROM general_news
    `
  );
  const row = r.rows[0];
  return {
    curated: parseInt(row?.curated ?? "0", 10),
    merged: parseInt(row?.score_zero_no_summary ?? "0", 10),
    duplicates: parseInt(row?.score_zero_with_summary ?? "0", 10),
    failed: parseInt(row?.failed ?? "0", 10)
  };
}

async function runRecurateJob(): Promise<void> {
  const costAtStart = getAiCostTotalUsd();
  recurateCancelRequested = false;
  recurateJob = {
    ...FRESH_JOB,
    state: "running",
    startedAt: Date.now()
  };
  try {
    const reset = await resetAllCuration();
    recurateJob.reset = reset;
    recurateJob.total = reset;

    let remainingBefore = await countUncurated();
    for (let pass = 0; pass < RECURATE_MAX_PASSES; pass++) {
      if (recurateCancelRequested) {
        console.warn(`[generalNews] recurate cancelled by admin at pass ${pass}`);
        break;
      }
      await curateUncuratedGeneralNews();

      const remainingAfter = await countUncurated();
      const breakdown = await snapshotBreakdown();
      recurateJob.processed = recurateJob.total - remainingAfter;
      recurateJob.curated = breakdown.curated;
      recurateJob.merged = breakdown.merged;
      recurateJob.duplicates = breakdown.duplicates;
      recurateJob.failed = breakdown.failed;
      recurateJob.costUsd = Math.max(0, getAiCostTotalUsd() - costAtStart);

      if (recurateCancelRequested) {
        console.warn(`[generalNews] recurate cancelled by admin after pass ${pass}`);
        break;
      }
      if (remainingAfter === 0) break;
      // No-progress guard: if a pass didn't advance the uncurated count at all,
      // we're stuck (AI errors, empty batch, etc.) — bail rather than tight-loop.
      if (remainingAfter >= remainingBefore) {
        console.warn(
          `[generalNews] recurate stalled at pass ${pass}: ${remainingAfter} rows still uncurated (no progress)`
        );
        break;
      }
      remainingBefore = remainingAfter;
      await new Promise((resolve) => setTimeout(resolve, RECURATE_BATCH_PAUSE_MS));
    }
    recurateJob.costUsd = Math.max(0, getAiCostTotalUsd() - costAtStart);
    recurateJob.state = "done";
    recurateJob.finishedAt = Date.now();
  } catch (err) {
    recurateJob.costUsd = Math.max(0, getAiCostTotalUsd() - costAtStart);
    recurateJob.state = "error";
    recurateJob.finishedAt = Date.now();
    recurateJob.error = err instanceof Error ? err.message : String(err);
    console.error("[generalNews] recurate job error:", err);
  }
}

/**
 * POST /news/general/recurate
 * Admin endpoint — kicks off background re-curation. Returns 202 immediately.
 * Poll /news/general/recurate/status for progress.
 */
generalNewsRouter.post("/general/recurate", requireSession, requireParentRole, (_req, res) => {
  if (recurateJob.state === "running") {
    res.status(409).json({ ok: false, error: "Recurate already running", job: recurateJob });
    return;
  }
  // Fire and forget — runner updates module-level job state
  runRecurateJob().catch((err) => {
    console.error("[generalNews] runRecurateJob unhandled:", err);
  });
  res.status(202).json({ ok: true, job: recurateJob });
});

/**
 * POST /news/general/recurate/cancel
 * Sets the cooperative cancel flag. Loop will exit at its next breakpoint
 * (after the in-flight curate pass completes, so we don't waste a paid AI
 * call mid-flight).
 */
generalNewsRouter.post("/general/recurate/cancel", requireSession, requireParentRole, (_req, res) => {
  if (recurateJob.state !== "running") {
    res.status(409).json({ ok: false, error: "No recurate job running" });
    return;
  }
  recurateCancelRequested = true;
  res.json({ ok: true, message: "Cancel requested — job will stop after the current pass completes" });
});

/**
 * GET /news/general/recurate/status
 * Returns current/last recurate job snapshot for client polling.
 */
generalNewsRouter.get("/general/recurate/status", requireSession, requireParentRole, (_req, res) => {
  res.json({ ok: true, job: recurateJob });
});

/**
 * GET /news/general/validation-failures
 * Admin — counts + recent failures from the AI curation pipeline.
 */
generalNewsRouter.get("/general/validation-failures", requireSession, requireParentRole, async (_req, res) => {
  const countRow = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM general_news WHERE ai_validation_failed = TRUE`
  );
  const recentRows = await db.query<{
    id: number;
    title: string;
    source_name: string;
    ai_last_validation_errors: string[] | null;
    ai_retry_count: number;
    ai_curated_at: string;
  }>(
    `
      SELECT id, title, source_name, ai_last_validation_errors, ai_retry_count, ai_curated_at
      FROM general_news
      WHERE ai_validation_failed = TRUE
      ORDER BY ai_curated_at DESC NULLS LAST
      LIMIT 20
    `
  );
  res.json({
    count: parseInt(countRow.rows[0]?.count ?? "0", 10),
    recent: recentRows.rows.map((r) => ({
      id: r.id,
      title: r.title,
      sourceName: r.source_name,
      errors: r.ai_last_validation_errors ?? [],
      retryCount: r.ai_retry_count,
      curatedAt: r.ai_curated_at
    }))
  });
});

/**
 * POST /news/general/:id/feedback
 * Record a user's thumbs up/down on AI summarization quality for an article.
 * Rates the summary quality, not the story itself.
 */
generalNewsRouter.post("/general/:id/feedback", requireSession, async (req, res) => {
  try {
    const discordUserId = res.locals.userId as string;
    const newsId = parseInt(req.params.id as string, 10);
    if (!Number.isFinite(newsId)) {
      res.status(400).json({ error: "Invalid article ID" });
      return;
    }
    const { rating } = req.body as { rating: unknown };
    if (rating !== 1 && rating !== -1 && rating !== 0) {
      res.status(400).json({ error: "rating must be 1, -1, or 0" });
      return;
    }
    if (rating === 0) {
      await db.query(
        `DELETE FROM general_news_feedback
         WHERE user_id = (SELECT id FROM users WHERE discord_user_id = $1)
           AND news_id = $2`,
        [discordUserId, newsId]
      );
    } else {
      await db.query(
        `INSERT INTO general_news_feedback (user_id, news_id, rating)
         SELECT u.id, $2, $3 FROM users u WHERE u.discord_user_id = $1
         ON CONFLICT (user_id, news_id) DO UPDATE SET rating = EXCLUDED.rating, created_at = NOW()`,
        [discordUserId, newsId, rating]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[generalNews] POST /news/general/:id/feedback error:", err);
    res.status(500).json({ ok: false, error: "Failed to record feedback" });
  }
});
