import { db } from "../../db/client.js";
import {
  curateUncuratedGeneralNews,
  ingestAndCurateGeneralNews
} from "../generalNewsIngestion.js";
import { backfillEmbeddings, countMissingEmbeddings } from "./embeddings.js";
import { retireStaleUncuratedBacklog } from "./newsBacklog.js";
import { executeAutopilotPass } from "./newsAutopilot.js";
import { runEmbedBackfillJob } from "./newsEmbedBackfillJob.js";
import { backfillMissingNewsImages } from "./newsImageResolver.js";
import { runRecurateJob } from "./newsRecurateJob.js";
import { withNewsPipelineLock } from "./newsPipelineLock.js";
import { getAISetting } from "../serverSettings.js";

export type PipelineQueueKind =
  | "ingest"
  | "curate"
  | "autopilot"
  | "retire_stale"
  | "recurate"
  | "embed_backfill"
  | "resolve_images";

export type PipelineQueueJob = {
  id: number;
  job_kind: PipelineQueueKind;
  payload: Record<string, unknown>;
  priority: number;
  state: string;
  dedupe_key: string | null;
  result: Record<string, unknown>;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type EnqueuePipelineResult = {
  jobId: number;
  position: number;
  alreadyPending: boolean;
};

function queueEnabled(): boolean {
  return getAISetting("news_pipeline_queue_enabled") !== "false";
}

export function isPipelineQueueEnabled(): boolean {
  return queueEnabled();
}

/** Reset jobs left running across deploy restart. */
export async function reconcileInterruptedQueueJobs(): Promise<void> {
  await db.query(
    `
      UPDATE news_pipeline_queue
         SET state = 'pending',
             started_at = NULL,
             error = COALESCE(error, 'Interrupted by server restart')
       WHERE state = 'running'
    `
  );
}

export async function enqueuePipelineJob(
  kind: PipelineQueueKind,
  payload: Record<string, unknown> = {},
  opts: { priority?: number; dedupeKey?: string } = {}
): Promise<EnqueuePipelineResult> {
  const priority = opts.priority ?? 0;
  const dedupeKey = opts.dedupeKey ?? null;

  if (dedupeKey) {
    const existing = await db.query<{ id: string; position: string }>(
      `
        WITH pending AS (
          SELECT id,
                 ROW_NUMBER() OVER (ORDER BY priority DESC, created_at ASC) AS pos
            FROM news_pipeline_queue
           WHERE state = 'pending'
        )
        SELECT p.id::text AS id, p.pos::text AS position
          FROM news_pipeline_queue q
          JOIN pending p ON p.id = q.id
         WHERE q.dedupe_key = $1
           AND q.state = 'pending'
         LIMIT 1
      `,
      [dedupeKey]
    );
    if (existing.rows[0]) {
      return {
        jobId: parseInt(existing.rows[0].id, 10),
        position: parseInt(existing.rows[0].position, 10),
        alreadyPending: true
      };
    }
  }

  const inserted = await db.query<{ id: string }>(
    `
      INSERT INTO news_pipeline_queue (job_kind, payload, priority, dedupe_key)
      VALUES ($1, $2::jsonb, $3, $4)
      RETURNING id::text AS id
    `,
    [kind, JSON.stringify(payload), priority, dedupeKey]
  );
  const jobId = parseInt(inserted.rows[0]?.id ?? "0", 10);

  const posRow = await db.query<{ position: string }>(
    `
      SELECT COUNT(*)::text AS position
        FROM news_pipeline_queue
       WHERE state = 'pending'
         AND (priority > $1 OR (priority = $1 AND created_at <= (SELECT created_at FROM news_pipeline_queue WHERE id = $2)))
    `,
    [priority, jobId]
  );

  void kickPipelineQueueWorker();

  return {
    jobId,
    position: parseInt(posRow.rows[0]?.position ?? "1", 10),
    alreadyPending: false
  };
}

async function claimNextQueueJob(): Promise<PipelineQueueJob | null> {
  const r = await db.query<PipelineQueueJob>(
    `
      UPDATE news_pipeline_queue
         SET state = 'running',
             started_at = NOW(),
             finished_at = NULL,
             error = NULL
       WHERE id = (
         SELECT id
           FROM news_pipeline_queue
          WHERE state = 'pending'
          ORDER BY priority DESC, created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
       )
      RETURNING id, job_kind, payload, priority, state, dedupe_key, result, error,
                created_at::text, started_at::text, finished_at::text
    `
  );
  return r.rows[0] ?? null;
}

async function finishQueueJob(
  id: number,
  state: "done" | "failed",
  result: Record<string, unknown>,
  error: string | null
): Promise<void> {
  await db.query(
    `
      UPDATE news_pipeline_queue
         SET state = $2,
             result = $3::jsonb,
             error = $4,
             finished_at = NOW()
       WHERE id = $1
    `,
    [id, state, JSON.stringify(result), error]
  );
}

async function executeQueueJob(job: PipelineQueueJob): Promise<Record<string, unknown>> {
  switch (job.job_kind) {
    case "ingest": {
      const result = await ingestAndCurateGeneralNews(job.payload.force === true, { skipLock: true });
      return result as Record<string, unknown>;
    }
    case "curate": {
      const curated = await curateUncuratedGeneralNews(
        {
          bulk: job.payload.bulk === true,
          reportRun: job.payload.reportRun !== false
        },
        { skipLock: true }
      );
      return { curated };
    }
    case "autopilot":
      return (await executeAutopilotPass({
        force: job.payload.force === true,
        skipLock: true
      })) as unknown as Record<string, unknown>;
    case "retire_stale": {
      const retired = await retireStaleUncuratedBacklog();
      return { retired };
    }
    case "recurate":
      return await runRecurateJob({
        resetFirst: job.payload.resetFirst === true,
        skipLock: true
      });
    case "embed_backfill":
      return await runEmbedBackfillJob();
    case "resolve_images": {
      const limit = Math.min(200, Math.max(1, parseInt(String(job.payload.limit ?? 40), 10)));
      return await backfillMissingNewsImages(limit);
    }
    default:
      throw new Error(`Unknown queue job kind: ${job.job_kind}`);
  }
}

let workerRunning = false;
let workerKickScheduled = false;

export function kickPipelineQueueWorker(): void {
  if (workerKickScheduled) return;
  workerKickScheduled = true;
  setImmediate(() => {
    workerKickScheduled = false;
    void processPipelineQueue();
  });
}

/** Drain at most one job — call on interval and after enqueue. */
export async function processPipelineQueue(): Promise<void> {
  if (!queueEnabled()) return;
  if (workerRunning) return;

  const job = await claimNextQueueJob();
  if (!job) return;

  workerRunning = true;
  try {
    const locked = await withNewsPipelineLock(async () => executeQueueJob(job));
    if (!locked.ran) {
      await db.query(
        `
          UPDATE news_pipeline_queue
             SET state = 'pending',
                 started_at = NULL,
                 error = 'Pipeline lock busy — re-queued'
           WHERE id = $1
        `,
        [job.id]
      );
      console.warn(`[news-queue] job ${job.id} (${job.job_kind}) re-queued — lock busy`);
      return;
    }
    await finishQueueJob(job.id, "done", locked.result, null);
    console.log(`[news-queue] job ${job.id} (${job.job_kind}) done`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[news-queue] job ${job.id} (${job.job_kind}) failed:`, err);
    await finishQueueJob(job.id, "failed", {}, message);
  } finally {
    workerRunning = false;
    const pending = await db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM news_pipeline_queue WHERE state = 'pending'`
    );
    if (parseInt(pending.rows[0]?.c ?? "0", 10) > 0) {
      kickPipelineQueueWorker();
    }
  }
}

export async function getPipelineQueueStatus(): Promise<{
  enabled: boolean;
  pending: number;
  running: PipelineQueueJob | null;
  recent: PipelineQueueJob[];
}> {
  const [pendingRow, runningRow, recentRows] = await Promise.all([
    db.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM news_pipeline_queue WHERE state = 'pending'`),
    db.query<PipelineQueueJob>(
      `
        SELECT id, job_kind, payload, priority, state, dedupe_key, result, error,
               created_at::text, started_at::text, finished_at::text
          FROM news_pipeline_queue
         WHERE state = 'running'
         ORDER BY started_at DESC
         LIMIT 1
      `
    ),
    db.query<PipelineQueueJob>(
      `
        SELECT id, job_kind, payload, priority, state, dedupe_key, result, error,
               created_at::text, started_at::text, finished_at::text
          FROM news_pipeline_queue
         WHERE state IN ('done', 'failed')
         ORDER BY finished_at DESC NULLS LAST
         LIMIT 8
      `
    )
  ]);

  return {
    enabled: queueEnabled(),
    pending: parseInt(pendingRow.rows[0]?.c ?? "0", 10),
    running: runningRow.rows[0] ?? null,
    recent: recentRows.rows
  };
}

/** Enqueue ingest job (queue must be enabled). */
export async function enqueueOrRunIngest(force = false): Promise<EnqueuePipelineResult> {
  return enqueuePipelineJob("ingest", { force }, { priority: force ? 8 : 2, dedupeKey: "ingest:pipeline" });
}

export async function enqueueOrRunCurate(payload: {
  bulk?: boolean;
  reportRun?: boolean;
  priority?: number;
}): Promise<EnqueuePipelineResult> {
  return enqueuePipelineJob(
    "curate",
    { bulk: payload.bulk === true, reportRun: payload.reportRun !== false },
    { priority: payload.priority ?? 6, dedupeKey: "curate:pipeline" }
  );
}

export async function enqueueOrRunAutopilot(force = false): Promise<EnqueuePipelineResult> {
  return enqueuePipelineJob("autopilot", { force }, { priority: force ? 9 : 4, dedupeKey: "autopilot:pipeline" });
}

export async function enqueueOrRunRecurate(resetFirst = false): Promise<EnqueuePipelineResult> {
  return enqueuePipelineJob(
    "recurate",
    { resetFirst },
    { priority: resetFirst ? 10 : 7, dedupeKey: "recurate:pipeline" }
  );
}

export async function enqueueOrRunEmbedBackfill(): Promise<EnqueuePipelineResult> {
  return enqueuePipelineJob("embed_backfill", {}, { priority: 3, dedupeKey: "embed_backfill:pipeline" });
}

export async function enqueueOrRunResolveImages(limit = 40): Promise<EnqueuePipelineResult> {
  return enqueuePipelineJob(
    "resolve_images",
    { limit },
    { priority: 2, dedupeKey: "resolve_images:pipeline" }
  );
}

export async function getPipelineQueueCounts(): Promise<{
  pending: number;
  running: number;
  oldestPendingAt: string | null;
}> {
  const [pendingRow, runningRow, oldestRow] = await Promise.all([
    db.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM news_pipeline_queue WHERE state = 'pending'`),
    db.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM news_pipeline_queue WHERE state = 'running'`),
    db.query<{ at: string | null }>(
      `SELECT MIN(created_at)::text AS at FROM news_pipeline_queue WHERE state = 'pending'`
    )
  ]);
  return {
    pending: parseInt(pendingRow.rows[0]?.c ?? "0", 10),
    running: parseInt(runningRow.rows[0]?.c ?? "0", 10),
    oldestPendingAt: oldestRow.rows[0]?.at ?? null
  };
}

export function startPipelineQueueWorker(): void {
  if (!queueEnabled()) return;
  void reconcileInterruptedQueueJobs().then(() => {
    kickPipelineQueueWorker();
    setInterval(() => {
      void processPipelineQueue();
    }, 12_000);
  });
}
