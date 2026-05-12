import { Router } from "express";
import { db } from "../db/client.js";
import { requireParentRole, requireSession } from "../lib/auth.js";
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
    const result = await db.query<GeneralNewsRow>(
      `
        SELECT
          gn.id,
          gn.source_type,
          gn.source_name,
          gn.external_id,
          gn.title,
          gn.url,
          gn.contents,
          gn.author,
          gn.image_url,
          gn.published_at,
          gn.matched_tags,
          gn.ai_relevance_score,
          gn.ai_summary,
          gn.ai_subtitle,
          gn.ai_tags,
          gn.ai_why_recommended,
          gn.ai_label,
          gn.ai_spoiler_warning,
          gn.ai_game_title,
          gn.ai_title,
          gn.ai_sources
        FROM general_news gn
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) FILTER (WHERE rating = 1)::int  AS upvotes,
            COUNT(*) FILTER (WHERE rating = -1)::int AS downvotes
          FROM general_news_feedback
          WHERE news_id = gn.id
        ) fb ON true
        WHERE COALESCE(gn.ai_relevance_score, 1) > 0
          AND gn.ai_validation_failed = FALSE
        ORDER BY (COALESCE(gn.ai_relevance_score, 0.5) + (fb.upvotes - fb.downvotes * 0.5) * 0.08) DESC, gn.published_at DESC
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
generalNewsRouter.post("/general/ingest", async (_req, res) => {
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
generalNewsRouter.post("/general/curate", async (_req, res) => {
  try {
    const curated = await curateUncuratedGeneralNews();
    res.json({ ok: true, curated });
  } catch (err) {
    console.error("[generalNews] POST /news/general/curate error:", err);
    res.status(500).json({ ok: false, error: "Curation failed" });
  }
});

/**
 * GET /news/general/debug-tags
 * Temp debug endpoint — returns raw AI output for one article to diagnose tag issues.
 */
generalNewsRouter.get("/general/debug-tags", async (_req, res) => {
  try {
    const { debugCurateOne } = await import("../lib/generalNewsIngestion.js");
    const result = await debugCurateOne();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Recurate Job (background, polled by client) ───────────────────────────────

type RecurateJobState = "idle" | "running" | "done" | "error";

type RecurateJob = {
  state: RecurateJobState;
  startedAt: number | null;
  finishedAt: number | null;
  reset: number;     // rows reset (also = total to curate)
  curated: number;   // rows curated so far
  total: number;     // = reset, snapshot for display
  error: string | null;
};

let recurateJob: RecurateJob = {
  state: "idle",
  startedAt: null,
  finishedAt: null,
  reset: 0,
  curated: 0,
  total: 0,
  error: null
};

const RECURATE_MAX_PASSES = 50; // hard safety: 50 × 25 = 1250 articles cap
const RECURATE_BATCH_PAUSE_MS = 250;

async function runRecurateJob(): Promise<void> {
  recurateJob = {
    state: "running",
    startedAt: Date.now(),
    finishedAt: null,
    reset: 0,
    curated: 0,
    total: 0,
    error: null
  };
  try {
    const reset = await resetAllCuration();
    recurateJob.reset = reset;
    recurateJob.total = reset;

    for (let pass = 0; pass < RECURATE_MAX_PASSES; pass++) {
      const curated = await curateUncuratedGeneralNews();
      recurateJob.curated += curated;
      const { rows } = await db.query(
        `SELECT 1 FROM general_news WHERE ai_curated_at IS NULL LIMIT 1`
      );
      if (rows.length === 0) break;
      // Tiny breather so a stuck/empty batch can't tight-loop the AI provider
      if (curated === 0) break;
      await new Promise((resolve) => setTimeout(resolve, RECURATE_BATCH_PAUSE_MS));
    }
    recurateJob.state = "done";
    recurateJob.finishedAt = Date.now();
  } catch (err) {
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
generalNewsRouter.post("/general/recurate", (_req, res) => {
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
 * GET /news/general/recurate/status
 * Returns current/last recurate job snapshot for client polling.
 */
generalNewsRouter.get("/general/recurate/status", (_req, res) => {
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
