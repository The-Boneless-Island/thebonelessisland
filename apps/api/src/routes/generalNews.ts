import { Router } from "express";
import { db } from "../db/client.js";
import { requireParentRole, requireSession } from "../lib/auth.js";
import { getAiCostTotalUsd } from "../lib/ai/usageTally.js";
import {
  backfillEmbeddings,
  countMissingEmbeddings,
  isEmbeddingColumnAvailable
} from "../lib/news/embeddings.js";
import { ingestAndCurateGeneralNews, curateUncuratedGeneralNews, resetAllCuration, backfillMissingImages, maybeBackgroundIngest } from "../lib/generalNewsIngestion.js";
import { buildGeneralNewsFeedQuery } from "../lib/news/newsFeed.js";
import { savePipelineJob, reconcileInterruptedPipelineJobs } from "../lib/news/newsPipelineJobs.js";
import { findSimilarArticles, searchGeneralNews } from "../lib/news/newsSearch.js";
import { getNewsPipelineHealth, reportCurationPassOutcome } from "../lib/news/newsCurationHealth.js";
import {
  CORPUS_RESET_CONFIRM_PHRASE,
  resetGeneralNewsCorpus
} from "../lib/news/newsCorpusReset.js";
import { retireStaleUncuratedBacklog } from "../lib/news/newsBacklog.js";
import { getNewsPipelineDiagnostics } from "../lib/news/newsPipelineDiagnostics.js";
import { withNewsPipelineLock } from "../lib/news/newsPipelineLock.js";

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
  linked_app_id: number | null;
  upvotes: number;
  downvotes: number;
};

/**
 * GET /news/general
 * Returns curated general gaming news from external sources.
 * Triggers background ingestion to top-up the feed if needed.
 */
generalNewsRouter.get("/general", async (req, res) => {
  try {
    const userId = req.session?.userId as string | undefined;
    const { sql, params } = buildGeneralNewsFeedQuery(userId);
    const result = await db.query<GeneralNewsRow>(sql, params);

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
      linkedAppId: row.linked_app_id,
      upvotes: row.upvotes,
      downvotes: row.downvotes
    }));

    res.json({ news });

    maybeBackgroundIngest().catch((err) => {
      console.error("[generalNews] Background ingestion error:", err);
    });
  } catch (err) {
    console.error("[generalNews] GET /news/general error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /news/general/search?q=
 * Hybrid keyword + embedding search over hot/warm primaries.
 */
generalNewsRouter.get("/general/search", requireSession, async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) {
      res.status(400).json({ error: "Query must be at least 2 characters" });
      return;
    }
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
    const hits = await searchGeneralNews(q, limit);
    res.json({ ok: true, query: q, results: hits });
  } catch (err) {
    console.error("[generalNews] GET /news/general/search error:", err);
    res.status(500).json({ ok: false, error: "Search failed" });
  }
});

/**
 * GET /news/general/:id/similar
 * Embedding neighbors for "More like this".
 */
generalNewsRouter.get("/general/:id/similar", requireSession, async (req, res) => {
  try {
    const newsId = parseInt(req.params.id as string, 10);
    if (!Number.isFinite(newsId)) {
      res.status(400).json({ error: "Invalid article ID" });
      return;
    }
    const limit = Math.min(12, Math.max(1, parseInt(String(req.query.limit ?? "6"), 10) || 6));
    const similar = await findSimilarArticles(newsId, limit);
    res.json({ ok: true, similar });
  } catch (err) {
    console.error("[generalNews] GET /news/general/:id/similar error:", err);
    res.status(500).json({ ok: false, error: "Similar lookup failed" });
  }
});

/**
 * GET /news/general/mutes — list current member's feed mutes.
 */
generalNewsRouter.get("/general/mutes", requireSession, async (_req, res) => {
  try {
    const discordUserId = res.locals.userId as string;
    const r = await db.query<{ kind: string; value: string }>(
      `SELECT gnm.kind, gnm.value
         FROM general_news_mutes gnm
         INNER JOIN users u ON u.id = gnm.user_id
        WHERE u.discord_user_id = $1
        ORDER BY gnm.created_at DESC`,
      [discordUserId]
    );
    res.json({ ok: true, mutes: r.rows });
  } catch (err) {
    console.error("[generalNews] GET /news/general/mutes error:", err);
    res.status(500).json({ ok: false, error: "Failed to load mutes" });
  }
});

/**
 * POST /news/general/mutes — hide a source, tag, or game from the feed.
 */
generalNewsRouter.post("/general/mutes", requireSession, async (req, res) => {
  try {
    const discordUserId = res.locals.userId as string;
    const { kind, value } = req.body as { kind?: string; value?: string };
    if (kind !== "source" && kind !== "tag" && kind !== "game") {
      res.status(400).json({ error: "kind must be source, tag, or game" });
      return;
    }
    const normalized = (value ?? "").trim().toLowerCase();
    if (normalized.length < 1 || normalized.length > 120) {
      res.status(400).json({ error: "value required (1–120 chars)" });
      return;
    }
    await db.query(
      `INSERT INTO general_news_mutes (user_id, kind, value)
       SELECT u.id, $2, $3 FROM users u WHERE u.discord_user_id = $1
       ON CONFLICT (user_id, kind, value) DO NOTHING`,
      [discordUserId, kind, normalized]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[generalNews] POST /news/general/mutes error:", err);
    res.status(500).json({ ok: false, error: "Failed to save mute" });
  }
});

/**
 * DELETE /news/general/mutes — clear one mute or all mutes.
 */
generalNewsRouter.delete("/general/mutes", requireSession, async (req, res) => {
  try {
    const discordUserId = res.locals.userId as string;
    const { kind, value } = (req.body ?? {}) as { kind?: string; value?: string };
    if (kind && value) {
      await db.query(
        `DELETE FROM general_news_mutes gnm
          USING users u
         WHERE u.id = gnm.user_id
           AND u.discord_user_id = $1
           AND gnm.kind = $2
           AND gnm.value = $3`,
        [discordUserId, kind, value.trim().toLowerCase()]
      );
    } else {
      await db.query(
        `DELETE FROM general_news_mutes gnm
          USING users u
         WHERE u.id = gnm.user_id AND u.discord_user_id = $1`,
        [discordUserId]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[generalNews] DELETE /news/general/mutes error:", err);
    res.status(500).json({ ok: false, error: "Failed to remove mute" });
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
    const remainingRow = await db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM general_news WHERE ai_curated_at IS NULL`
    );
    const remainingBefore = parseInt(remainingRow.rows[0]?.c ?? "0", 10);
    const curated = await curateUncuratedGeneralNews({ bulk: remainingBefore > 200 });
    const remainingAfterRow = await db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM general_news WHERE ai_curated_at IS NULL`
    );
    const remainingAfter = parseInt(remainingAfterRow.rows[0]?.c ?? "0", 10);
    res.json({ ok: true, curated, remaining: remainingAfter });
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
    const { embedded } = await backfillEmbeddings(limit);
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

// ── Embed backfill job (background, polled by client) ─────────────────────────

type EmbedBackfillJobState = "idle" | "running" | "done" | "error";

type EmbedBackfillJob = {
  state: EmbedBackfillJobState;
  startedAt: number | null;
  finishedAt: number | null;
  total: number;
  embedded: number;
  skipped: number;
  remaining: number;
  batches: number;
  error: string | null;
};

const FRESH_EMBED_JOB: EmbedBackfillJob = {
  state: "idle",
  startedAt: null,
  finishedAt: null,
  total: 0,
  embedded: 0,
  skipped: 0,
  remaining: 0,
  batches: 0,
  error: null
};

let embedBackfillJob: EmbedBackfillJob = { ...FRESH_EMBED_JOB };
let embedBackfillCancelRequested = false;

function resetGeneralNewsJobState(): void {
  recurateCancelRequested = true;
  embedBackfillCancelRequested = true;
  recurateJob = { ...FRESH_JOB };
  embedBackfillJob = { ...FRESH_EMBED_JOB };
}

function isGeneralNewsBackgroundJobRunning(): boolean {
  return recurateJob.state === "running" || embedBackfillJob.state === "running";
}

const EMBED_BACKFILL_BATCH = 40;
const EMBED_BACKFILL_MAX_PASSES = 500;
const EMBED_BACKFILL_PAUSE_MS = 50;

async function runEmbedBackfillJob(): Promise<void> {
  embedBackfillCancelRequested = false;
  embedBackfillJob = {
    ...FRESH_EMBED_JOB,
    state: "running",
    startedAt: Date.now()
  };
  await savePipelineJob("embed_backfill", "running", { ...embedBackfillJob }, { startedAt: new Date(), finishedAt: null, error: null });

  try {
    if (!(await isEmbeddingColumnAvailable())) {
      embedBackfillJob.state = "error";
      embedBackfillJob.error =
        "pgvector / embedding column not available. Install pgvector and re-run migration 040.";
      embedBackfillJob.finishedAt = Date.now();
      return;
    }

    const initialRemaining = await countMissingEmbeddings();
    embedBackfillJob.total = initialRemaining;
    embedBackfillJob.remaining = initialRemaining;

    if (initialRemaining === 0) {
      embedBackfillJob.state = "done";
      embedBackfillJob.finishedAt = Date.now();
      return;
    }

    for (let pass = 0; pass < EMBED_BACKFILL_MAX_PASSES; pass++) {
      if (embedBackfillCancelRequested) {
        console.warn(`[generalNews] embed backfill cancelled by admin at batch ${pass}`);
        break;
      }

      const batch = await backfillEmbeddings(EMBED_BACKFILL_BATCH);
      embedBackfillJob.embedded += batch.embedded;
      embedBackfillJob.skipped += batch.skipped;
      embedBackfillJob.batches = pass + 1;
      embedBackfillJob.remaining = await countMissingEmbeddings();

      const handled = batch.embedded + batch.skipped;
      if (embedBackfillJob.remaining === 0 || handled === 0) break;

      await savePipelineJob("embed_backfill", "running", { ...embedBackfillJob });

      if (embedBackfillCancelRequested) break;
      await new Promise((resolve) => setTimeout(resolve, EMBED_BACKFILL_PAUSE_MS));
    }

    embedBackfillJob.state = embedBackfillJob.error ? "error" : "done";
    embedBackfillJob.finishedAt = Date.now();
    console.log(
      `[generalNews] embed backfill job finished: ${embedBackfillJob.embedded} embedded, ${embedBackfillJob.remaining} remaining`
    );
  } catch (err) {
    embedBackfillJob.state = "error";
    embedBackfillJob.error = err instanceof Error ? err.message : String(err);
    embedBackfillJob.finishedAt = Date.now();
    console.error("[generalNews] embed backfill job failed:", err);
  }
  await savePipelineJob("embed_backfill", embedBackfillJob.state, { ...embedBackfillJob }, {
    error: embedBackfillJob.error,
    finishedAt: embedBackfillJob.finishedAt ? new Date(embedBackfillJob.finishedAt) : new Date()
  });
}

/**
 * POST /news/general/embed-backfill/start
 * Kicks off a background job that embeds every row missing a vector.
 * Poll GET /news/general/embed-backfill/status for progress.
 */
generalNewsRouter.post(
  "/general/embed-backfill/start",
  requireSession,
  requireParentRole,
  (_req, res) => {
    if (embedBackfillJob.state === "running") {
      res.status(409).json({ ok: false, error: "Embed backfill already running", job: embedBackfillJob });
      return;
    }
    runEmbedBackfillJob().catch((err) => {
      console.error("[generalNews] runEmbedBackfillJob unhandled:", err);
    });
    res.status(202).json({ ok: true, job: embedBackfillJob });
  }
);

/**
 * POST /news/general/embed-backfill/cancel
 * Stops the job after the current batch completes.
 */
generalNewsRouter.post(
  "/general/embed-backfill/cancel",
  requireSession,
  requireParentRole,
  (_req, res) => {
    if (embedBackfillJob.state !== "running") {
      res.status(409).json({ ok: false, error: "No embed backfill job running" });
      return;
    }
    embedBackfillCancelRequested = true;
    res.json({ ok: true, message: "Cancel requested — job will stop after the current batch completes" });
  }
);

/**
 * GET /news/general/embed-backfill/status
 */
generalNewsRouter.get(
  "/general/embed-backfill/status",
  requireSession,
  requireParentRole,
  (_req, res) => {
    res.json({ ok: true, job: embedBackfillJob });
  }
);

/**
 * POST /news/general/image-backfill
 * Admin — scrape og:image covers for already-ingested rows that have none (the
 * ingest hook only touches freshly-inserted rows). Bounded per call (default
 * 50); poll until remaining returns 0. Image scraping is network-bound, so keep
 * the limit modest to avoid request timeouts.
 */
generalNewsRouter.post("/general/image-backfill", requireSession, requireParentRole, async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(String((req.body as { limit?: number } | undefined)?.limit ?? 50), 10)));
    const result = await backfillMissingImages(limit);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[generalNews] image-backfill error:", err);
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
  curated: number;     // live primary cards in corpus right now
  processed: number;   // rows touched so far this run
  remaining: number;   // rows still waiting for curation
  merged: number;
  duplicates: number;
  failed: number;
  total: number;       // = reset, snapshot for display
  costUsd: number;
  error: string | null;
};

const FRESH_JOB: RecurateJob = {
  state: "idle",
  startedAt: null,
  finishedAt: null,
  reset: 0,
  curated: 0,
  processed: 0,
  remaining: 0,
  merged: 0,
  duplicates: 0,
  failed: 0,
  total: 0,
  costUsd: 0,
  error: null
};

let recurateJob: RecurateJob = { ...FRESH_JOB };

const RECURATE_BATCH_PAUSE_MS = 250;
const RECURATE_NO_PROGRESS_LIMIT = 3;

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
  await savePipelineJob("recurate", "running", { ...recurateJob }, { startedAt: new Date(), finishedAt: null, error: null });
  try {
    const totalRow = await db.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM general_news`);
    const total = parseInt(totalRow.rows[0]?.c ?? "0", 10);
    if (total > 1500) {
      recurateJob.error =
        `Corpus has ${total.toLocaleString()} articles — use Archive → Scrub the archive instead of Regenerate All Summaries on a large backlog.`;
      recurateJob.state = "error";
      recurateJob.finishedAt = Date.now();
      await savePipelineJob("recurate", "error", { ...recurateJob }, {
        error: recurateJob.error,
        finishedAt: new Date()
      });
      return;
    }

    const reset = await resetAllCuration();
    recurateJob.reset = reset;
    recurateJob.total = reset;

    recurateJob.reset = reset;
    recurateJob.total = reset;
    recurateJob.remaining = reset;

    let noProgressStreak = 0;
    while (true) {
      if (recurateCancelRequested) {
        console.warn("[generalNews] recurate cancelled by admin");
        break;
      }

      const remainingBefore = await countUncurated();
      if (remainingBefore === 0) break;

      await curateUncuratedGeneralNews({ reportRun: false, bulk: true });

      const remainingAfter = await countUncurated();
      const breakdown = await snapshotBreakdown();
      recurateJob.processed = recurateJob.total - remainingAfter;
      recurateJob.remaining = remainingAfter;
      recurateJob.curated = breakdown.curated;
      recurateJob.merged = breakdown.merged;
      recurateJob.duplicates = breakdown.duplicates;
      recurateJob.failed = breakdown.failed;
      recurateJob.costUsd = Math.max(0, getAiCostTotalUsd() - costAtStart);

      await savePipelineJob("recurate", "running", { ...recurateJob });

      if (recurateCancelRequested) {
        console.warn("[generalNews] recurate cancelled by admin after pass");
        break;
      }
      if (remainingAfter === 0) break;

      if (remainingAfter >= remainingBefore) {
        noProgressStreak++;
        console.warn(
          `[generalNews] recurate no progress (${noProgressStreak}/${RECURATE_NO_PROGRESS_LIMIT}): ${remainingAfter} rows still uncurated`
        );
        if (noProgressStreak >= RECURATE_NO_PROGRESS_LIMIT) {
          recurateJob.error = `Stalled with ${remainingAfter.toLocaleString()} articles still uncurated — check AI settings and Validation tab`;
          break;
        }
      } else {
        noProgressStreak = 0;
      }

      await new Promise((resolve) => setTimeout(resolve, RECURATE_BATCH_PAUSE_MS));
    }

    recurateJob.costUsd = Math.max(0, getAiCostTotalUsd() - costAtStart);
    recurateJob.state = recurateJob.error ? "error" : "done";
    recurateJob.finishedAt = Date.now();
    void reportCurationPassOutcome({
      runKind: "recurate",
      fetched: 0,
      curated: recurateJob.curated,
      merged: recurateJob.merged,
      duplicates: recurateJob.duplicates,
      failed: recurateJob.failed,
      embedded: 0,
      costUsdStart: costAtStart
    });
  } catch (err) {
    recurateJob.costUsd = Math.max(0, getAiCostTotalUsd() - costAtStart);
    recurateJob.state = "error";
    recurateJob.finishedAt = Date.now();
    recurateJob.error = err instanceof Error ? err.message : String(err);
    console.error("[generalNews] recurate job error:", err);
    void reportCurationPassOutcome({
      runKind: "recurate",
      fetched: 0,
      curated: recurateJob.curated,
      failed: recurateJob.failed,
      embedded: 0,
      errorSummary: recurateJob.error,
      costUsdStart: costAtStart
    });
  }
  await savePipelineJob("recurate", recurateJob.state, { ...recurateJob }, {
    error: recurateJob.error,
    finishedAt: recurateJob.finishedAt ? new Date(recurateJob.finishedAt) : new Date()
  });
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
 * POST /news/general/reset-corpus
 * Admin — delete all ingested general news and pipeline history, then optionally re-fetch.
 */
generalNewsRouter.post("/general/reset-corpus", requireSession, requireParentRole, async (req, res) => {
  try {
    const body = req.body as { confirm?: unknown; ingestAfter?: unknown };
    if (body.confirm !== CORPUS_RESET_CONFIRM_PHRASE) {
      res.status(400).json({
        ok: false,
        error: `Type confirm exactly: ${CORPUS_RESET_CONFIRM_PHRASE}`
      });
      return;
    }

    if (isGeneralNewsBackgroundJobRunning()) {
      res.status(409).json({
        ok: false,
        error: "Cancel running embed backfill or recurate jobs before scrubbing the archive"
      });
      return;
    }

    const runningJobs = await db.query<{ job_kind: string }>(
      `SELECT job_kind FROM news_pipeline_jobs WHERE state = 'running'`
    );
    if (runningJobs.rows.length > 0) {
      res.status(409).json({
        ok: false,
        error: `Pipeline job still marked running: ${runningJobs.rows.map((r) => r.job_kind).join(", ")}`
      });
      return;
    }

    const locked = await withNewsPipelineLock(async () => resetGeneralNewsCorpus());
    if (!locked.ran) {
      res.status(409).json({
        ok: false,
        error: "Pipeline busy (ingest or curation in progress). Try again in a minute."
      });
      return;
    }

    resetGeneralNewsJobState();
    console.warn("[generalNews] corpus reset by admin:", locked.result);

    const ingestAfter = body.ingestAfter === true;
    if (ingestAfter) {
      void ingestAndCurateGeneralNews(true).catch((err) => {
        console.error("[generalNews] post-reset ingest failed:", err);
      });
    }

    res.json({ ok: true, ...locked.result, ingestStarted: ingestAfter });
  } catch (err) {
    console.error("[generalNews] POST /news/general/reset-corpus error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Corpus reset failed"
    });
  }
});

/**
 * GET /news/general/diagnostics
 * Admin — breakdown of backlog age, validation, and suggested next step.
 */
generalNewsRouter.get("/general/diagnostics", requireSession, requireParentRole, async (_req, res) => {
  try {
    const diagnostics = await getNewsPipelineDiagnostics();
    res.json({ ok: true, diagnostics });
  } catch (err) {
    console.error("[generalNews] GET /news/general/diagnostics error:", err);
    res.status(500).json({ ok: false, error: "Diagnostics failed" });
  }
});

/**
 * POST /news/general/retire-stale-backlog
 * Admin — mark uncurated rows outside the 14-day window as handled (no AI cost).
 */
generalNewsRouter.post("/general/retire-stale-backlog", requireSession, requireParentRole, async (_req, res) => {
  try {
    if (isGeneralNewsBackgroundJobRunning()) {
      res.status(409).json({ ok: false, error: "Cancel running embed/recurate jobs first" });
      return;
    }
    const locked = await withNewsPipelineLock(async () => retireStaleUncuratedBacklog());
    if (!locked.ran) {
      res.status(409).json({ ok: false, error: "Pipeline busy — try again in a minute" });
      return;
    }
    const remainingRow = await db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM general_news WHERE ai_curated_at IS NULL`
    );
    res.json({
      ok: true,
      retired: locked.result,
      remainingUncurated: parseInt(remainingRow.rows[0]?.c ?? "0", 10)
    });
  } catch (err) {
    console.error("[generalNews] POST /news/general/retire-stale-backlog error:", err);
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "Retire failed" });
  }
});

/**
 * GET /news/general/health
 * Admin — pipeline health snapshot (cards, failures, embeddings, last run).
 */
generalNewsRouter.get("/general/health", requireSession, requireParentRole, async (_req, res) => {
  try {
    const health = await getNewsPipelineHealth();
    res.json({ ok: true, health });
  } catch (err) {
    console.error("[generalNews] GET /news/general/health error:", err);
    res.status(500).json({ ok: false, error: "Health check failed" });
  }
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
    url: string;
    contents: string | null;
    ai_last_validation_errors: string[] | null;
    ai_retry_count: number;
    ai_curated_at: string;
    pre_filter_reason: string | null;
  }>(
    `
      SELECT id, title, source_name, url, contents,
             ai_last_validation_errors, ai_retry_count, ai_curated_at, pre_filter_reason
      FROM general_news
      WHERE ai_validation_failed = TRUE
      ORDER BY ai_curated_at DESC NULLS LAST
      LIMIT 50
    `
  );
  res.json({
    count: parseInt(countRow.rows[0]?.count ?? "0", 10),
    recent: recentRows.rows.map((r) => ({
      id: r.id,
      title: r.title,
      sourceName: r.source_name,
      url: r.url,
      excerpt: (r.contents ?? "").slice(0, 280),
      errors: r.ai_last_validation_errors ?? [],
      retryCount: r.ai_retry_count,
      curatedAt: r.ai_curated_at,
      preFilterReason: r.pre_filter_reason
    }))
  });
});

/**
 * POST /news/general/:id/feedback
 * Record a member's upvote/downvote on a story. This is a CONTENT vote that
 * surfaces or sinks the story in the feed ranking — not a rating of AI summary
 * quality. One vote per member per story (rating 1 / -1; 0 clears the vote).
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
