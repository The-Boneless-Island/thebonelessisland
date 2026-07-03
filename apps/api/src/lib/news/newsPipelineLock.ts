import { db } from "../../db/client.js";

/** Single-flight lock for ingest / curation / embed backfill on one API instance. */
export const NEWS_PIPELINE_LOCK_ID = 737001;

/**
 * Runs `fn` while holding the news-pipeline advisory lock, single-flighting
 * ingest/curation/embed-backfill work across concurrent callers.
 *
 * pg_advisory_lock is session-scoped: the lock lives on whichever connection
 * took it, and only that same connection can release it. Acquiring/releasing
 * via `db.query()` (the shared pool) checks out an arbitrary connection each
 * call, so the unlock almost never runs on the same session that locked —
 * it's a silent no-op, the lock never actually releases until that
 * connection is recycled, and single-flight is broken in both directions
 * (a busy lock can look free, and a released lock can look busy). Checking
 * out one dedicated client for the whole call and holding it for the
 * duration of `fn` keeps lock and unlock on the same session, matching how
 * `pg_advisory_lock` is meant to be used.
 */
export async function withNewsPipelineLock<T>(
  fn: () => Promise<T>
): Promise<{ ran: true; result: T } | { ran: false; result: null }> {
  const client = await db.connect();
  try {
    const acquired = await client.query<{ ok: boolean }>(
      `SELECT pg_try_advisory_lock($1::bigint) AS ok`,
      [NEWS_PIPELINE_LOCK_ID]
    );
    if (acquired.rows[0]?.ok !== true) {
      return { ran: false, result: null };
    }
    try {
      return { ran: true, result: await fn() };
    } finally {
      // Swallow unlock failures: they only happen when the connection itself
      // died, which releases the session lock anyway — and a throw here would
      // mask fn()'s real error.
      await client
        .query(`SELECT pg_advisory_unlock($1::bigint)`, [NEWS_PIPELINE_LOCK_ID])
        .catch(() => {});
    }
  } finally {
    client.release();
  }
}
