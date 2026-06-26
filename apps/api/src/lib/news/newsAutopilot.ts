import { db } from "../../db/client.js";
import { getAiCostTotalUsd } from "../ai/usageTally.js";
import {
  curateUncuratedGeneralNews,
  ingestAndCurateGeneralNews
} from "../generalNewsIngestion.js";
import { backfillEmbeddings, countMissingEmbeddings } from "./embeddings.js";
import { CURATION_WINDOW_DAYS, retireStaleUncuratedBacklog } from "./newsBacklog.js";
import {
  getNewsPipelineHealth,
  snapshotPipelineCounts,
  type NewsPipelineHealth
} from "./newsCurationHealth.js";
import { isNewsCurationAlertConfigured, sendNewsCurationAlert } from "./newsCurationAlert.js";
import { loadPipelineJob, savePipelineJob } from "./newsPipelineJobs.js";
import { getAISetting } from "../serverSettings.js";
import { isFeedStale } from "./newsRetention.js";
import { log } from "../structuredLog.js";

export type AutopilotStepLog = {
  retireStale?: number;
  ingest?: { fetched: number; curated: number; embedded: number };
  curateBatches?: number;
  curatedTotal?: number;
  embedRows?: number;
  embedRemaining?: number;
};

export type AutopilotResult = {
  ran: boolean;
  skippedReason?: string;
  steps: AutopilotStepLog;
  costUsd: number;
  healthBefore: Pick<NewsPipelineHealth, "status" | "liveCards" | "validationFailures" | "uncuratedBacklog" | "embeddingsMissing">;
  healthAfter: Pick<NewsPipelineHealth, "status" | "liveCards" | "validationFailures" | "uncuratedBacklog" | "embeddingsMissing">;
  escalated: boolean;
  finishedAt: string;
};

function intSetting(key: string, fallback: number): number {
  const raw = getAISetting(key);
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function autopilotEnabled(): boolean {
  return (
    getAISetting("news_general_enabled") !== "false" &&
    getAISetting("ai_enabled") === "true" &&
    getAISetting("news_autopilot_enabled") !== "false"
  );
}

async function countUncuratedOutsideWindow(): Promise<number> {
  const r = await db.query<{ c: string }>(
    `
      SELECT COUNT(*)::text AS c
        FROM general_news
       WHERE ai_curated_at IS NULL
         AND published_at <= NOW() - ($1::text || ' days')::interval
    `,
    [String(CURATION_WINDOW_DAYS)]
  );
  return parseInt(r.rows[0]?.c ?? "0", 10);
}

async function countUncuratedWithinWindow(): Promise<number> {
  const r = await db.query<{ c: string }>(
    `
      SELECT COUNT(*)::text AS c
        FROM general_news
       WHERE ai_curated_at IS NULL
         AND published_at > NOW() - ($1::text || ' days')::interval
    `,
    [String(CURATION_WINDOW_DAYS)]
  );
  return parseInt(r.rows[0]?.c ?? "0", 10);
}

async function isManualJobRunning(): Promise<boolean> {
  const r = await db.query<{ job_kind: string }>(
    `SELECT job_kind FROM news_pipeline_jobs WHERE state = 'running' AND job_kind IN ('recurate', 'embed_backfill')`
  );
  return r.rows.length > 0;
}

async function sendAutopilotEscalation(
  result: AutopilotResult,
  health: NewsPipelineHealth
): Promise<void> {
  const lines: string[] = [
    `Autopilot ran but pipeline is still **${health.status}**.`,
    `Live cards: **${health.liveCards}** · Uncurated: **${health.uncuratedBacklog.toLocaleString()}** · Validation failures: **${health.validationFailures}**`
  ];
  if (result.steps.retireStale) {
    lines.push(`Retired stale: **${result.steps.retireStale.toLocaleString()}**`);
  }
  if (result.steps.ingest) {
    lines.push(
      `Ingest: fetched **${result.steps.ingest.fetched}**, curated **${result.steps.ingest.curated}**`
    );
  }
  if (result.steps.curateBatches) {
    lines.push(
      `Curate: **${result.steps.curateBatches}** batch(es), **${result.steps.curatedTotal ?? 0}** new cards`
    );
  }
  if (result.steps.embedRows) {
    lines.push(`Embed: **${result.steps.embedRows}** rows (~${result.steps.embedRemaining ?? 0} remaining)`);
  }
  if (result.costUsd > 0) {
    lines.push(`Est. AI spend this pass: **$${result.costUsd.toFixed(3)}**`);
  }
  lines.push("Check Admin → News → Validation. Use Archive → Scrub only if autopilot keeps failing.");

  if (!isNewsCurationAlertConfigured()) {
    log.warn("generalNews", "autopilot_escalated_no_webhook", { health, steps: result.steps });
    return;
  }

  await sendNewsCurationAlert({
    title: "News autopilot could not restore the feed",
    description: lines.join("\n"),
    color: health.status === "critical" ? 0xef4444 : 0xfbbf77,
    dedupeKey: `autopilot-escalate:${health.status}`,
    cooldownMs: 12 * 60 * 60 * 1000
  });
}

/**
 * Bounded self-healing pass: retire stale backlog → ingest if needed → curate → embed.
 * Safe to run on a schedule; skips when disabled, manual jobs are running, or autopilot is already active.
 */
export async function runNewsAutopilot(opts: { force?: boolean } = {}): Promise<AutopilotResult> {
  const finishedAt = new Date().toISOString();
  const emptySteps: AutopilotStepLog = {};

  const healthBeforeFull = await getNewsPipelineHealth();
  const healthBefore = {
    status: healthBeforeFull.status,
    liveCards: healthBeforeFull.liveCards,
    validationFailures: healthBeforeFull.validationFailures,
    uncuratedBacklog: healthBeforeFull.uncuratedBacklog,
    embeddingsMissing: healthBeforeFull.embeddingsMissing
  };

  if (!autopilotEnabled()) {
    return {
      ran: false,
      skippedReason: "Autopilot disabled or AI/news off",
      steps: emptySteps,
      costUsd: 0,
      healthBefore,
      healthAfter: healthBefore,
      escalated: false,
      finishedAt
    };
  }

  if (healthBeforeFull.status === "healthy" && !opts.force) {
    return {
      ran: false,
      skippedReason: "Pipeline healthy",
      steps: emptySteps,
      costUsd: 0,
      healthBefore,
      healthAfter: healthBefore,
      escalated: false,
      finishedAt
    };
  }

  const existing = await loadPipelineJob<AutopilotStepLog>("autopilot");
  if (existing?.state === "running") {
    return {
      ran: false,
      skippedReason: "Autopilot already running",
      steps: emptySteps,
      costUsd: 0,
      healthBefore,
      healthAfter: healthBefore,
      escalated: false,
      finishedAt
    };
  }

  if (await isManualJobRunning()) {
    return {
      ran: false,
      skippedReason: "Manual recurate or embed job running",
      steps: emptySteps,
      costUsd: 0,
      healthBefore,
      healthAfter: healthBefore,
      escalated: false,
      finishedAt
    };
  }

  const costAtStart = getAiCostTotalUsd();
  const steps: AutopilotStepLog = {};
  const maxCurateBatches = intSetting("news_autopilot_max_curate_batches", 10);
  const maxEmbedRows = intSetting("news_autopilot_max_embed_rows", 200);
  const retireThreshold = intSetting("news_autopilot_retire_threshold", 100);

  await savePipelineJob("autopilot", "running", {}, { startedAt: new Date(), finishedAt: null, error: null });

  try {
    const outside = await countUncuratedOutsideWindow();
    if (outside >= retireThreshold) {
      steps.retireStale = await retireStaleUncuratedBacklog();
    }

    const counts = await snapshotPipelineCounts();
    const feedStale = await isFeedStale();
    const shouldIngest = feedStale || counts.liveCards === 0 || counts.uncuratedBacklog > 0;
    if (shouldIngest) {
      steps.ingest = await ingestAndCurateGeneralNews(true);
    }

    let curatedTotal = 0;
    let curateBatches = 0;
    let noProgress = 0;
    while (curateBatches < maxCurateBatches) {
      const remaining = await countUncuratedWithinWindow();
      if (remaining === 0) break;

      const n = await curateUncuratedGeneralNews({ reportRun: false });
      curateBatches++;
      curatedTotal += n;
      if (n === 0) {
        noProgress++;
        if (noProgress >= 2) break;
      } else {
        noProgress = 0;
      }
    }
    if (curateBatches > 0) {
      steps.curateBatches = curateBatches;
      steps.curatedTotal = curatedTotal;
    }

    let embedRows = 0;
    let remainingEmbeds = await countMissingEmbeddings();
    while (embedRows < maxEmbedRows && remainingEmbeds > 50) {
      const batch = Math.min(40, maxEmbedRows - embedRows);
      const { embedded, skipped } = await backfillEmbeddings(batch);
      embedRows += embedded + skipped;
      const next = await countMissingEmbeddings();
      if (next >= remainingEmbeds) break;
      remainingEmbeds = next;
    }
    if (embedRows > 0) {
      steps.embedRows = embedRows;
      steps.embedRemaining = remainingEmbeds;
    }

    const costUsd = Math.max(0, getAiCostTotalUsd() - costAtStart);
    const healthAfterFull = await getNewsPipelineHealth();
    const healthAfter = {
      status: healthAfterFull.status,
      liveCards: healthAfterFull.liveCards,
      validationFailures: healthAfterFull.validationFailures,
      uncuratedBacklog: healthAfterFull.uncuratedBacklog,
      embeddingsMissing: healthAfterFull.embeddingsMissing
    };

    const escalated =
      healthAfter.status !== "healthy" &&
      healthAfter.status !== "off" &&
      (healthAfter.liveCards === 0 || healthAfter.uncuratedBacklog > 200);

    const result: AutopilotResult = {
      ran: true,
      steps,
      costUsd,
      healthBefore,
      healthAfter,
      escalated,
      finishedAt: new Date().toISOString()
    };

    await savePipelineJob(
      "autopilot",
      escalated ? "degraded" : "idle",
      { ...steps, costUsd, healthBefore, healthAfter, escalated, finishedAt: result.finishedAt },
      {
        error: escalated ? "Pipeline still degraded after autopilot pass" : null,
        finishedAt: new Date()
      }
    );

    if (escalated) {
      await sendAutopilotEscalation(result, healthAfterFull);
    } else if (result.ran && healthBefore.status !== healthAfter.status) {
      log.info("generalNews", "autopilot_recovered", { steps, healthBefore, healthAfter, costUsd });
    }

    console.log("[news-autopilot] pass complete:", { steps, costUsd, healthAfter, escalated });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[news-autopilot] pass failed:", err);
    await savePipelineJob(
      "autopilot",
      "error",
      { ...steps, error: message },
      { error: message, finishedAt: new Date() }
    );
    throw err;
  }
}

export async function getAutopilotStatus(): Promise<{
  enabled: boolean;
  job: { state: string; progress: Record<string, unknown>; error: string | null } | null;
  settings: {
    maxCurateBatches: number;
    maxEmbedRows: number;
    retireThreshold: number;
  };
}> {
  const job = await loadPipelineJob<Record<string, unknown>>("autopilot");
  return {
    enabled: autopilotEnabled(),
    job: job
      ? { state: job.state, progress: job.progress, error: job.error }
      : null,
    settings: {
      maxCurateBatches: intSetting("news_autopilot_max_curate_batches", 10),
      maxEmbedRows: intSetting("news_autopilot_max_embed_rows", 200),
      retireThreshold: intSetting("news_autopilot_retire_threshold", 100)
    }
  };
}
