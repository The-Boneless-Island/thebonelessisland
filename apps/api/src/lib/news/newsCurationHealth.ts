import { db } from "../../db/client.js";
import { getAiCostTotalUsd } from "../ai/usageTally.js";
import { Sentry } from "../sentry.js";
import { log } from "../structuredLog.js";
import { getAISetting } from "../serverSettings.js";
import { countMissingEmbeddings, resolveEmbeddingBackend } from "./embeddings.js";
import { countLiveCardsMissingImages, countLiveCardsOnFallbackArt } from "./newsImageResolver.js";
import { isNewsCurationAlertConfigured, sendNewsCurationAlert } from "./newsCurationAlert.js";

export type BatchDiagnostics = {
  at: string;
  batchSize: number;
  parsedCount: number;
  matchCounts: Record<string, number>;
  failedCount: number;
  provider: string;
  model: string;
};

export type CurationRunInput = {
  runKind: "ingest" | "curate" | "recurate";
  fetched?: number;
  curated?: number;
  merged?: number;
  duplicates?: number;
  failed?: number;
  embedded?: number;
  errorSummary?: string | null;
  costUsdStart?: number;
};

export type NewsPipelineHealth = {
  status: "healthy" | "degraded" | "critical" | "off";
  /** Plain-English explanation of the current status — always set. */
  reason: string;
  embeddingBackend: string;
  embeddingsMissing: number;
  liveCards: number;
  validationFailures: number;
  uncuratedBacklog: number;
  liveCardsMissingImages: number;
  /** Cards that resolved all the way to island fallback art — fine, just informational. */
  liveCardsOnFallbackArt: number;
  queuePending: number;
  queueRunning: number;
  queueOldestPendingAt: string | null;
  lastRun: {
    at: string;
    kind: string;
    fetched: number;
    curated: number;
    failed: number;
    embedded: number;
    duplicates: number;
    merged: number;
    provider: string | null;
    errorSummary: string | null;
  } | null;
  lastBatch: BatchDiagnostics | null;
};

let lastBatchDiagnostics: BatchDiagnostics | null = null;

export function setLastBatchDiagnostics(diag: Omit<BatchDiagnostics, "at">): void {
  lastBatchDiagnostics = { at: new Date().toISOString(), ...diag };
}

export function getLastBatchDiagnostics(): BatchDiagnostics | null {
  return lastBatchDiagnostics;
}

export async function snapshotPipelineCounts(): Promise<{
  liveCards: number;
  validationFailures: number;
  uncuratedBacklog: number;
  merged: number;
  duplicates: number;
}> {
  const r = await db.query<{
    live: string;
    failed: string;
    uncurated: string;
    merged: string;
    duplicates: string;
  }>(
    `
      SELECT
        COUNT(*) FILTER (
          WHERE ai_curated_at IS NOT NULL
            AND ai_relevance_score > 0
            AND ai_validation_failed = FALSE
        )::text AS live,
        COUNT(*) FILTER (WHERE ai_validation_failed = TRUE)::text AS failed,
        COUNT(*) FILTER (WHERE ai_curated_at IS NULL)::text AS uncurated,
        COUNT(*) FILTER (
          WHERE ai_curated_at IS NOT NULL
            AND ai_relevance_score = 0
            AND ai_summary IS NULL
        )::text AS merged,
        COUNT(*) FILTER (
          WHERE ai_curated_at IS NOT NULL
            AND ai_relevance_score = 0
            AND ai_summary IS NOT NULL
        )::text AS duplicates
      FROM general_news
    `
  );
  const row = r.rows[0];
  return {
    liveCards: parseInt(row?.live ?? "0", 10),
    validationFailures: parseInt(row?.failed ?? "0", 10),
    uncuratedBacklog: parseInt(row?.uncurated ?? "0", 10),
    merged: parseInt(row?.merged ?? "0", 10),
    duplicates: parseInt(row?.duplicates ?? "0", 10)
  };
}

export async function getNewsPipelineHealth(): Promise<NewsPipelineHealth> {
  const newsEnabled = getAISetting("news_general_enabled") !== "false";
  const aiEnabled = getAISetting("ai_enabled") === "true";
  const { getPipelineQueueCounts, isPipelineQueueEnabled } = await import("./newsPipelineQueue.js");
  const queueCounts = isPipelineQueueEnabled()
    ? await getPipelineQueueCounts()
    : { pending: 0, running: 0, oldestPendingAt: null as string | null };

  const [counts, embeddingsMissing, liveCardsMissingImages, liveCardsOnFallbackArt, lastRunRow] = await Promise.all([
    snapshotPipelineCounts(),
    countMissingEmbeddings(),
    countLiveCardsMissingImages(),
    countLiveCardsOnFallbackArt(),
    db.query<{
      started_at: string;
      run_kind: string;
      fetched: number;
      curated: number;
      failed: number;
      embedded: number;
      duplicates: number;
      merged: number;
      provider: string | null;
      error_summary: string | null;
    }>(
      `SELECT started_at, run_kind, fetched, curated, failed, embedded,
              COALESCE(duplicates, 0) AS duplicates, COALESCE(merged, 0) AS merged,
              provider, error_summary
         FROM news_curation_runs
        ORDER BY started_at DESC
        LIMIT 1`
    )
  ]);

  const lr = lastRunRow.rows[0];
  let status: NewsPipelineHealth["status"] = "healthy";
  let reason = "";
  const queueStaleMs =
    queueCounts.oldestPendingAt !== null
      ? Date.now() - new Date(queueCounts.oldestPendingAt).getTime()
      : 0;
  const queueBacklogged =
    queueCounts.pending >= 5 ||
    (queueCounts.pending > 0 && queueStaleMs > 30 * 60 * 1000);

  if (!newsEnabled || !aiEnabled) {
    status = "off";
    reason = !aiEnabled ? "AI is disabled — news curation paused" : "News feed is disabled";
  } else if (counts.liveCards === 0 && counts.uncuratedBacklog > 50) {
    status = "critical";
    reason = `No live cards with ${counts.uncuratedBacklog.toLocaleString()} uncurated rows — pipeline stalled`;
  } else if (
    counts.liveCards === 0 &&
    counts.uncuratedBacklog > 0 &&
    (lr?.run_kind === "recurate" || lastBatchDiagnostics?.parsedCount === 0)
  ) {
    status = "critical";
    reason = `No live cards after re-curation pass — AI may have returned empty results`;
  } else if (lr?.error_summary) {
    status = "critical";
    reason = `Last run errored: ${lr.error_summary}`;
  } else if (counts.uncuratedBacklog > 200 && counts.liveCards < counts.uncuratedBacklog * 0.15) {
    status = "degraded";
    reason = `${counts.uncuratedBacklog.toLocaleString()} uncurated rows within the window with only ${counts.liveCards.toLocaleString()} live cards`;
  } else if (counts.validationFailures > 100 && counts.liveCards < counts.validationFailures * 0.1) {
    // Large historical failure corpus — usually fixed by Regenerate All Summaries.
    status = "degraded";
    reason = `${counts.validationFailures.toLocaleString()} articles failed AI validation (vs ${counts.liveCards.toLocaleString()} live cards) — run Regenerate All Summaries`;
  } else if (queueBacklogged && counts.uncuratedBacklog > 100) {
    status = "degraded";
    reason = `Pipeline queue backlogged with ${counts.uncuratedBacklog.toLocaleString()} uncurated articles waiting`;
  } else if (counts.validationFailures > 25) {
    status = "degraded";
    reason = `${counts.validationFailures.toLocaleString()} articles failed AI validation — check Validation tab`;
  } else if (embeddingsMissing > 500) {
    status = "degraded";
    reason = `${embeddingsMissing.toLocaleString()} live cards missing embeddings — run Embed All Missing`;
  } else if (liveCardsMissingImages > 5) {
    // Truly missing — null URL or never resolved. Normally 0 since the ladder always
    // sets at least the island default. liveCardsOnFallbackArt never triggers degraded.
    status = "degraded";
    reason = `${liveCardsMissingImages.toLocaleString()} live cards have no cover at all — run Cover Image Backfill`;
  } else {
    // Healthy — a quiet run (0 new due to dedup/Reddit-park) is NOT degraded
    const n = counts.liveCards;
    reason = `Pipeline healthy — ${n.toLocaleString()} live card${n === 1 ? "" : "s"}`;
  }

  return {
    status,
    reason,
    embeddingBackend: resolveEmbeddingBackend(),
    embeddingsMissing,
    liveCards: counts.liveCards,
    validationFailures: counts.validationFailures,
    uncuratedBacklog: counts.uncuratedBacklog,
    liveCardsMissingImages,
    liveCardsOnFallbackArt,
    queuePending: queueCounts.pending,
    queueRunning: queueCounts.running,
    queueOldestPendingAt: queueCounts.oldestPendingAt,
    lastRun: lr
      ? {
          at: lr.started_at,
          kind: lr.run_kind,
          fetched: lr.fetched,
          curated: lr.curated,
          failed: lr.failed,
          embedded: lr.embedded,
          duplicates: lr.duplicates,
          merged: lr.merged,
          provider: lr.provider,
          errorSummary: lr.error_summary
        }
      : null,
    lastBatch: lastBatchDiagnostics
  };
}

export async function persistCurationRun(input: CurationRunInput): Promise<void> {
  const costUsd =
    input.costUsdStart !== undefined
      ? Math.max(0, getAiCostTotalUsd() - input.costUsdStart)
      : null;
  try {
    await db.query(
      `INSERT INTO news_curation_runs
         (finished_at, run_kind, fetched, curated, merged, duplicates, failed, embedded,
          provider, model, error_summary, cost_usd)
       VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        input.runKind,
        input.fetched ?? 0,
        input.curated ?? 0,
        input.merged ?? 0,
        input.duplicates ?? 0,
        input.failed ?? 0,
        input.embedded ?? 0,
        getAISetting("ai_provider"),
        getAISetting("ai_model"),
        input.errorSummary ?? null,
        costUsd
      ]
    );
  } catch (err) {
    console.warn("[generalNews] failed to persist curation run:", err);
  }
}

export async function reportCurationPassOutcome(input: {
  runKind: CurationRunInput["runKind"];
  fetched: number;
  curated: number;
  embedded?: number;
  merged?: number;
  duplicates?: number;
  failed?: number;
  batchFailed?: number;
  errorSummary?: string | null;
  costUsdStart?: number;
}): Promise<void> {
  const counts = await snapshotPipelineCounts();
  const provider = getAISetting("ai_provider") ?? "unknown";
  const model = getAISetting("ai_model") ?? "default";
  const embedded = input.embedded ?? 0;

  log.info("generalNews", "curation_pass_complete", {
    runKind: input.runKind,
    fetched: input.fetched,
    curated: input.curated,
    embedded,
    validationFailures: counts.validationFailures,
    liveCards: counts.liveCards,
    provider,
    model,
    lastBatch: lastBatchDiagnostics
  });

  await persistCurationRun({
    runKind: input.runKind,
    fetched: input.fetched,
    curated: input.curated,
    merged: input.merged,
    duplicates: input.duplicates,
    failed: input.failed ?? input.batchFailed,
    embedded: input.embedded,
    errorSummary: input.errorSummary ?? null,
    costUsdStart: input.costUsdStart
  });

  // A run that fetched N but curated 0 new is normal when articles were deduped or Reddit-parked.
  // Only treat zero-curated as a real signal when validation failures are actually climbing OR
  // there was an error — not when the fetched articles simply already existed in the corpus.
  const dedupExplained =
    (input.duplicates ?? 0) > 0 || (input.merged ?? 0) > 0 || (input.failed ?? input.batchFailed ?? 0) === 0;
  const zeroCurateUnexplained =
    input.fetched > 0 &&
    input.curated === 0 &&
    !dedupExplained &&
    counts.validationFailures > 10;
  const highFailureRate =
    counts.validationFailures > 50 &&
    counts.liveCards < Math.max(5, counts.validationFailures * 0.05);

  if (zeroCurateUnexplained || highFailureRate || input.errorSummary) {
    const level = highFailureRate ? "error" : "warning";
    if (process.env.SENTRY_DSN) {
      Sentry.captureMessage("news curation pipeline degraded", {
        level,
        extra: {
          runKind: input.runKind,
          fetched: input.fetched,
          curated: input.curated,
          duplicates: input.duplicates,
          merged: input.merged,
          validationFailures: counts.validationFailures,
          liveCards: counts.liveCards,
          errorSummary: input.errorSummary,
          lastBatch: lastBatchDiagnostics
        }
      });
    }
  }

  if (input.errorSummary) {
    void sendNewsCurationAlert({
      title: "News curation run errored",
      description:
        `Run kind: \`${input.runKind}\` · Error: ${input.errorSummary}\n` +
        `Live cards: **${counts.liveCards}** · Validation failures: **${counts.validationFailures}**`,
      color: 0xef4444,
      dedupeKey: `run-error:${input.errorSummary.slice(0, 120)}`
    });
  }

  if (zeroCurateUnexplained) {
    void sendNewsCurationAlert({
      title: "News curation produced zero cards",
      description:
        `Fetched **${input.fetched}** article(s) but curated **0** new cards — not explained by dedup.\n` +
        `Validation failures in corpus: **${counts.validationFailures}** · Live cards: **${counts.liveCards}**\n` +
        `Provider: \`${provider}\` · Check Admin → News → Validation.`,
      color: 0xef4444,
      dedupeKey: "zero-curate-ingest"
    });
  } else if (highFailureRate) {
    void sendNewsCurationAlert({
      title: "News validation failures elevated",
      description:
        `**${counts.validationFailures}** articles failed AI validation · **${counts.liveCards}** live cards.\n` +
        `Run **Regenerate All Summaries** in Admin → News → Triggers after verifying AI settings.`,
      color: 0xfbbf77,
      dedupeKey: "validation-failures-high",
      cooldownMs: 24 * 60 * 60 * 1000
    });
  }
}

/** Periodic sweep — runs bounded autopilot recovery, then alerts if still degraded. */
export async function runNewsPipelineHealthSweep(): Promise<void> {
  const newsEnabled = getAISetting("news_general_enabled") !== "false";
  const aiEnabled = getAISetting("ai_enabled") === "true";
  if (!newsEnabled || !aiEnabled) return;

  const healthBefore = await getNewsPipelineHealth();
  if (healthBefore.status === "healthy" || healthBefore.status === "off") return;

  let autopilotEscalated = false;
  let autopilotSkipped: string | undefined;
  try {
    const { runNewsAutopilot } = await import("./newsAutopilot.js");
    const { isPipelineQueueEnabled, enqueueOrRunCurate } = await import("./newsPipelineQueue.js");
    if (healthBefore.uncuratedBacklog > 200 && isPipelineQueueEnabled()) {
      await enqueueOrRunCurate({ priority: 5, reportRun: false });
    }
    const autopilot = await runNewsAutopilot();
    autopilotEscalated = autopilot.escalated;
    autopilotSkipped = autopilot.skippedReason;
  } catch (err) {
    log.error("generalNews", "autopilot_sweep_failed", {
      err: err instanceof Error ? err.message : String(err)
    });
  }

  const health = await getNewsPipelineHealth();
  if (health.status === "healthy" || health.status === "off") return;
  if (autopilotEscalated) return;
  if (health.queuePending > 0 || health.queueRunning > 0) {
    log.info("generalNews", "pipeline_degraded_queue_in_flight", {
      status: health.status,
      queuePending: health.queuePending,
      queueRunning: health.queueRunning,
      autopilotSkipped
    });
    return;
  }

  if (!isNewsCurationAlertConfigured()) {
    log.warn("generalNews", "pipeline_degraded_no_webhook", {
      status: health.status,
      validationFailures: health.validationFailures,
      embeddingsMissing: health.embeddingsMissing,
      uncuratedBacklog: health.uncuratedBacklog
    });
    if (process.env.SENTRY_DSN) {
      Sentry.captureMessage("news pipeline degraded (no Discord webhook configured)", {
        level: "warning",
        extra: {
          status: health.status,
          validationFailures: health.validationFailures,
          embeddingsMissing: health.embeddingsMissing,
          uncuratedBacklog: health.uncuratedBacklog
        }
      });
    }
    return;
  }

  const lines: string[] = [`Status: **${health.status}**`];
  if (health.embeddingsMissing > 500) {
    lines.push(`Embeddings missing: **${health.embeddingsMissing.toLocaleString()}** (auto-backfill runs each ingest)`);
  }
  if (health.validationFailures > 50) {
    lines.push(`Validation failures: **${health.validationFailures.toLocaleString()}**`);
  }
  if (health.uncuratedBacklog > 500) {
    lines.push(`Uncurated backlog: **${health.uncuratedBacklog.toLocaleString()}**`);
  }
  if (health.lastRun?.curated === 0 && (health.lastRun.fetched ?? 0) > 0 && health.lastRun.errorSummary) {
    lines.push(
      `Last ingest curated **0** of **${health.lastRun.fetched}** fetched with error (${new Date(health.lastRun.at).toLocaleString()})`
    );
  }
  if (autopilotSkipped) {
    lines.push(`Autopilot skipped: **${autopilotSkipped}**`);
  } else {
    lines.push("Autopilot ran but the feed is still degraded — check Validation tab for last pass details.");
  }
  lines.push("Admin → News → Archive (Retire stale) · Triggers → Fetch & Curate · Scrub only as last resort.");

  void sendNewsCurationAlert({
    title: "News pipeline needs attention",
    description: lines.join("\n"),
    color: health.status === "critical" ? 0xef4444 : 0xfbbf77,
    dedupeKey: `health-sweep:${health.status}`,
    cooldownMs: 12 * 60 * 60 * 1000
  });
}
