import { db } from "../../db/client.js";

export type PipelineJobKind = "embed_backfill" | "recurate" | "autopilot";

export async function loadPipelineJob<T extends Record<string, unknown>>(
  kind: PipelineJobKind
): Promise<{ state: string; progress: T; error: string | null } | null> {
  const r = await db.query<{ state: string; progress: T; error: string | null }>(
    `SELECT state, progress, error FROM news_pipeline_jobs WHERE job_kind = $1`,
    [kind]
  );
  return r.rows[0] ?? null;
}

export async function savePipelineJob(
  kind: PipelineJobKind,
  state: string,
  progress: Record<string, unknown>,
  opts: { error?: string | null; startedAt?: Date | null; finishedAt?: Date | null } = {}
): Promise<void> {
  await db.query(
    `
      INSERT INTO news_pipeline_jobs (job_kind, state, progress, error, started_at, finished_at, updated_at)
      VALUES ($1, $2, $3::jsonb, $4, $5, $6, NOW())
      ON CONFLICT (job_kind) DO UPDATE SET
        state = EXCLUDED.state,
        progress = EXCLUDED.progress,
        error = EXCLUDED.error,
        started_at = COALESCE(EXCLUDED.started_at, news_pipeline_jobs.started_at),
        finished_at = EXCLUDED.finished_at,
        updated_at = NOW()
    `,
    [
      kind,
      state,
      JSON.stringify(progress),
      opts.error ?? null,
      opts.startedAt ?? null,
      opts.finishedAt ?? null
    ]
  );
}

/** Reset jobs left running across a deploy restart. */
export async function reconcileInterruptedPipelineJobs(): Promise<void> {
  await db.query(
    `
      UPDATE news_pipeline_jobs
         SET state = 'idle',
             error = COALESCE(error, 'Interrupted by server restart'),
             finished_at = COALESCE(finished_at, NOW()),
             updated_at = NOW()
       WHERE state = 'running'
    `
  );
}
