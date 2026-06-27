import { ingestNewsForApps } from "./gameNewsIngestion.js";

export type GameIngestOptions = {
  staleAfterMs?: number;
  maxApps?: number;
};

type PendingGameIngest = {
  appIds: Set<number>;
  staleAfterMs: number;
  maxApps: number;
};

let workerRunning = false;
let pending: PendingGameIngest | null = null;
let lastRunAt: string | null = null;
let lastRunError: string | null = null;
let lastRunResult: { ingestedApps: number; ingestedItems: number } | null = null;

function mergePending(appIds: number[], options: GameIngestOptions): PendingGameIngest {
  const staleAfterMs = options.staleAfterMs ?? 6 * 60 * 60 * 1000;
  const maxApps = options.maxApps ?? 8;
  if (!pending) {
    pending = { appIds: new Set(appIds), staleAfterMs, maxApps };
    return pending;
  }
  for (const id of appIds) pending.appIds.add(id);
  pending.staleAfterMs = Math.min(pending.staleAfterMs, staleAfterMs);
  pending.maxApps = Math.max(pending.maxApps, maxApps);
  return pending;
}

function kickWorker(): void {
  if (workerRunning) return;
  void drainGameNewsIngestQueue();
}

async function drainGameNewsIngestQueue(): Promise<void> {
  if (workerRunning) return;
  workerRunning = true;
  try {
    while (pending) {
      const job = pending;
      pending = null;
      const appIds = [...job.appIds];
      try {
        lastRunResult = await ingestNewsForApps(appIds, {
          staleAfterMs: job.staleAfterMs,
          maxApps: job.maxApps
        });
        lastRunAt = new Date().toISOString();
        lastRunError = null;
      } catch (err) {
        lastRunError = err instanceof Error ? err.message : String(err);
        console.error("[gameNews] ingest queue job failed:", err);
      }
    }
  } finally {
    workerRunning = false;
    if (pending) kickWorker();
  }
}

/** Coalesce concurrent game-news ingest callers into one serial worker. */
export function enqueueGameNewsIngest(
  appIds: number[],
  options: GameIngestOptions = {}
): { queued: boolean; pendingApps: number; running: boolean } {
  if (appIds.length === 0) {
    return { queued: false, pendingApps: 0, running: workerRunning };
  }
  mergePending(appIds, options);
  kickWorker();
  return {
    queued: true,
    pendingApps: pending?.appIds.size ?? appIds.length,
    running: workerRunning
  };
}

export function getGameNewsIngestQueueStatus(): {
  running: boolean;
  pendingApps: number;
  lastRunAt: string | null;
  lastRunError: string | null;
  lastRunResult: { ingestedApps: number; ingestedItems: number } | null;
} {
  return {
    running: workerRunning,
    pendingApps: pending?.appIds.size ?? 0,
    lastRunAt,
    lastRunError,
    lastRunResult
  };
}
