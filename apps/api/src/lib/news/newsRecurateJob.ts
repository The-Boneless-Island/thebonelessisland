import { db } from "../../db/client.js";
import { getAiCostTotalUsd } from "../ai/usageTally.js";
import { curateUncuratedGeneralNews, resetAllCuration } from "../generalNewsIngestion.js";
import { getLastBatchDiagnostics, reportCurationPassOutcome } from "./newsCurationHealth.js";
import { savePipelineJob } from "./newsPipelineJobs.js";

export type RecurateJobState = "idle" | "running" | "done" | "error";

export type RecurateJob = {
  state: RecurateJobState;
  startedAt: number | null;
  finishedAt: number | null;
  reset: number;
  curated: number;
  processed: number;
  remaining: number;
  merged: number;
  duplicates: number;
  failed: number;
  total: number;
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
let recurateCancelRequested = false;

const RECURATE_BATCH_PAUSE_MS = 250;
const RECURATE_NO_PROGRESS_LIMIT = 3;

export function getRecurateJob(): RecurateJob {
  return recurateJob;
}

export function isRecurateJobRunning(): boolean {
  return recurateJob.state === "running";
}

export function requestRecurateCancel(): void {
  recurateCancelRequested = true;
}

export function resetRecurateJobState(): void {
  recurateCancelRequested = true;
  recurateJob = { ...FRESH_JOB };
}

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

export async function runRecurateJob(
  opts: { resetFirst?: boolean; skipLock?: boolean } = {}
): Promise<Record<string, unknown>> {
  const resetFirst = opts.resetFirst === true;
  const skipLock = opts.skipLock === true;
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
    if (resetFirst && total > 1500) {
      recurateJob.error =
        `Corpus has ${total.toLocaleString()} articles — use Archive → Scrub the archive instead of Regenerate All Summaries on a large backlog.`;
      recurateJob.state = "error";
      recurateJob.finishedAt = Date.now();
      await savePipelineJob("recurate", "error", { ...recurateJob }, {
        error: recurateJob.error,
        finishedAt: new Date()
      });
      return { ...recurateJob };
    }

    if (resetFirst) {
      const reset = await resetAllCuration();
      recurateJob.reset = reset;
      recurateJob.total = reset;
      recurateJob.remaining = reset;
    } else {
      const remaining = await countUncurated();
      recurateJob.reset = 0;
      recurateJob.total = remaining;
      recurateJob.remaining = remaining;
    }

    let noProgressStreak = 0;
    while (true) {
      if (recurateCancelRequested) {
        console.warn("[generalNews] recurate cancelled by admin");
        break;
      }

      const remainingBefore = await countUncurated();
      if (remainingBefore === 0) break;

      await curateUncuratedGeneralNews({ reportRun: false, bulk: true }, { skipLock });

      const lockBusy = (getLastBatchDiagnostics()?.matchCounts?.lock_busy ?? 0) > 0;
      if (lockBusy && !skipLock) {
        console.warn("[generalNews] recurate pass skipped lock busy — waiting for queued worker");
        await new Promise((resolve) => setTimeout(resolve, RECURATE_BATCH_PAUSE_MS * 6));
        continue;
      }

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
      errorSummary: recurateJob.error ?? null,
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
  return { ...recurateJob };
}
