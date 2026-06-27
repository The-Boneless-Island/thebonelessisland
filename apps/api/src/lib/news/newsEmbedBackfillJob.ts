import { getAiCostTotalUsd } from "../ai/usageTally.js";
import {
  backfillEmbeddings,
  countMissingEmbeddings,
  isEmbeddingColumnAvailable
} from "./embeddings.js";
import { savePipelineJob } from "./newsPipelineJobs.js";

export type EmbedBackfillJobState = "idle" | "running" | "done" | "error";

export type EmbedBackfillJob = {
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

const EMBED_BACKFILL_BATCH = 40;
const EMBED_BACKFILL_MAX_PASSES = 500;
const EMBED_BACKFILL_PAUSE_MS = 50;

export function getEmbedBackfillJob(): EmbedBackfillJob {
  return embedBackfillJob;
}

export function isEmbedBackfillJobRunning(): boolean {
  return embedBackfillJob.state === "running";
}

export function requestEmbedBackfillCancel(): void {
  embedBackfillCancelRequested = true;
}

export function resetEmbedBackfillJobState(): void {
  embedBackfillCancelRequested = true;
  embedBackfillJob = { ...FRESH_EMBED_JOB };
}

export async function runEmbedBackfillJob(): Promise<Record<string, unknown>> {
  embedBackfillCancelRequested = false;
  embedBackfillJob = {
    ...FRESH_EMBED_JOB,
    state: "running",
    startedAt: Date.now()
  };
  await savePipelineJob("embed_backfill", "running", { ...embedBackfillJob }, {
    startedAt: new Date(),
    finishedAt: null,
    error: null
  });

  try {
    if (!(await isEmbeddingColumnAvailable())) {
      embedBackfillJob.state = "error";
      embedBackfillJob.error =
        "pgvector / embedding column not available. Install pgvector and re-run migration 040.";
      embedBackfillJob.finishedAt = Date.now();
      return { ...embedBackfillJob };
    }

    const initialRemaining = await countMissingEmbeddings();
    embedBackfillJob.total = initialRemaining;
    embedBackfillJob.remaining = initialRemaining;

    if (initialRemaining === 0) {
      embedBackfillJob.state = "done";
      embedBackfillJob.finishedAt = Date.now();
      return { ...embedBackfillJob, costUsd: 0 };
    }

    const costAtStart = getAiCostTotalUsd();

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
    return {
      ...embedBackfillJob,
      costUsd: Math.max(0, getAiCostTotalUsd() - costAtStart)
    };
  } catch (err) {
    embedBackfillJob.state = "error";
    embedBackfillJob.error = err instanceof Error ? err.message : String(err);
    embedBackfillJob.finishedAt = Date.now();
    console.error("[generalNews] embed backfill job failed:", err);
    return { ...embedBackfillJob };
  } finally {
    await savePipelineJob("embed_backfill", embedBackfillJob.state, { ...embedBackfillJob }, {
      error: embedBackfillJob.error,
      finishedAt: embedBackfillJob.finishedAt ? new Date(embedBackfillJob.finishedAt) : new Date()
    });
  }
}
