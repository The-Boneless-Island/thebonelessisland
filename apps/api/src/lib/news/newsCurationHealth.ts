import { db } from "../../db/client.js";
import { getAiCostTotalUsd } from "../ai/usageTally.js";
import { Sentry } from "../sentry.js";
import { log } from "../structuredLog.js";
import { getAISetting } from "../serverSettings.js";
import { countMissingEmbeddings, resolveEmbeddingBackend } from "./embeddings.js";
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
  embeddingBackend: string;
  embeddingsMissing: number;
  liveCards: number;
  validationFailures: number;
  uncuratedBacklog: number;
  lastRun: {
    at: string;
    kind: string;
    fetched: number;
    curated: number;
    failed: number;
    embedded: number;
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
  const [counts, embeddingsMissing, lastRunRow] = await Promise.all([
    snapshotPipelineCounts(),
    countMissingEmbeddings(),
    db.query<{
      started_at: string;
      run_kind: string;
      fetched: number;
      curated: number;
      failed: number;
      embedded: number;
      provider: string | null;
      error_summary: string | null;
    }>(
      `SELECT started_at, run_kind, fetched, curated, failed, embedded, provider, error_summary
         FROM news_curation_runs
        ORDER BY started_at DESC
        LIMIT 1`
    )
  ]);

  const lr = lastRunRow.rows[0];
  let status: NewsPipelineHealth["status"] = "healthy";
  if (!newsEnabled || !aiEnabled) {
    status = "off";
  } else if (counts.liveCards === 0 && counts.uncuratedBacklog > 50) {
    status = "critical";
  } else if (
    counts.liveCards === 0 &&
    counts.uncuratedBacklog > 0 &&
    (lr?.run_kind === "recurate" || lastBatchDiagnostics?.parsedCount === 0)
  ) {
    status = "critical";
  } else if (counts.validationFailures > 100 && counts.liveCards < counts.validationFailures * 0.1) {
    // Large historical failure corpus — usually fixed by Regenerate All Summaries.
    status = "degraded";
  } else if (lr?.error_summary) {
    status = "critical";
  } else if (counts.validationFailures > 10) {
    status = "degraded";
  } else if (embeddingsMissing > 500) {
    status = "degraded";
  } else if (lr?.curated === 0 && (lr?.fetched ?? 0) > 0) {
    status = "degraded";
  }

  return {
    status,
    embeddingBackend: resolveEmbeddingBackend(),
    embeddingsMissing,
    liveCards: counts.liveCards,
    validationFailures: counts.validationFailures,
    uncuratedBacklog: counts.uncuratedBacklog,
    lastRun: lr
      ? {
          at: lr.started_at,
          kind: lr.run_kind,
          fetched: lr.fetched,
          curated: lr.curated,
          failed: lr.failed,
          embedded: lr.embedded,
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

  const zeroCurateWithFetch = input.fetched > 0 && input.curated === 0;
  const highFailureRate =
    counts.validationFailures > 50 &&
    counts.liveCards < Math.max(5, counts.validationFailures * 0.05);

  if (zeroCurateWithFetch || highFailureRate || input.errorSummary) {
    const level = highFailureRate ? "error" : "warning";
    if (process.env.SENTRY_DSN) {
      Sentry.captureMessage("news curation pipeline degraded", {
        level,
        extra: {
          runKind: input.runKind,
          fetched: input.fetched,
          curated: input.curated,
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

  if (zeroCurateWithFetch) {
    void sendNewsCurationAlert({
      title: "News curation produced zero cards",
      description:
        `Fetched **${input.fetched}** new article(s) but curated **0** primary cards.\n` +
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
  if (health.lastRun?.curated === 0 && (health.lastRun.fetched ?? 0) > 0) {
    lines.push(
      `Last ingest curated **0** of **${health.lastRun.fetched}** fetched (${new Date(health.lastRun.at).toLocaleString()})`
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
