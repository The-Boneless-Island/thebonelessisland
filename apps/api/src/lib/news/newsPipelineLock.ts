import { db } from "../../db/client.js";

/** Single-flight lock for ingest / curation / embed backfill on one API instance. */
export const NEWS_PIPELINE_LOCK_ID = 737001;

export async function tryAcquireNewsPipelineLock(): Promise<boolean> {
  const r = await db.query<{ ok: boolean }>(
    `SELECT pg_try_advisory_lock($1::bigint) AS ok`,
    [NEWS_PIPELINE_LOCK_ID]
  );
  return r.rows[0]?.ok === true;
}

export async function releaseNewsPipelineLock(): Promise<void> {
  await db.query(`SELECT pg_advisory_unlock($1::bigint)`, [NEWS_PIPELINE_LOCK_ID]);
}

export async function withNewsPipelineLock<T>(
  fn: () => Promise<T>
): Promise<{ ran: true; result: T } | { ran: false; result: null }> {
  const locked = await tryAcquireNewsPipelineLock();
  if (!locked) return { ran: false, result: null };
  try {
    return { ran: true, result: await fn() };
  } finally {
    await releaseNewsPipelineLock();
  }
}
