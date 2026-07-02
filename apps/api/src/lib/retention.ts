// General-purpose row-retention sweeps for tables that grow unbounded but
// have no other pruning path. Distinct from lib/news/newsRetention.ts, which
// owns the general_news-specific tiering/warm-stripping/prune logic; this
// module is for straightforward "delete rows past an age" cleanup.
//
// Deletes are batched (small LIMIT per statement, looped until 0 rows) so a
// large backlog — e.g. the first run after this sweep ships — doesn't hold
// one long-running DELETE that blocks other writers or blows the pool's
// statement_timeout.

import { db } from "../db/client.js";
import { log } from "./structuredLog.js";

const BATCH_SIZE = 5000;

const ACTIVITY_EVENTS_RETENTION_DAYS = 180;
const BOT_ANNOUNCEMENTS_RETENTION_DAYS = 30;
const GAME_NEWS_RETENTION_DAYS = 90;

/**
 * Deletes rows matching `wherePredicate` from `table` in batches of
 * `BATCH_SIZE`, looping until a batch deletes 0 rows. `wherePredicate` must
 * not reference `$1` — batching alone doesn't take any params here, every
 * predicate below is a fixed interval literal.
 */
async function batchedDelete(table: string, wherePredicate: string): Promise<number> {
  let totalDeleted = 0;
  for (;;) {
    const result = await db.query(
      `
        DELETE FROM ${table}
         WHERE ctid IN (
           SELECT ctid FROM ${table}
            WHERE ${wherePredicate}
            LIMIT ${BATCH_SIZE}
         )
      `
    );
    const deleted = result.rowCount ?? 0;
    totalDeleted += deleted;
    if (deleted < BATCH_SIZE) break;
  }
  return totalDeleted;
}

/**
 * activity_events older than 180 days, except achievement.unlocked and any
 * milestone.* event — those are the crew's permanent record (profile
 * showcase, milestone history) and are kept forever.
 */
async function sweepActivityEvents(): Promise<number> {
  return batchedDelete(
    "activity_events",
    `
      created_at < NOW() - INTERVAL '${ACTIVITY_EVENTS_RETENTION_DAYS} days'
      AND event_type <> 'achievement.unlocked'
      AND event_type NOT LIKE 'milestone.%'
    `
  );
}

/** bot_announcements the bot has already delivered, past the 30-day window. */
async function sweepBotAnnouncements(): Promise<number> {
  return batchedDelete(
    "bot_announcements",
    `
      processed_at IS NOT NULL
      AND processed_at < NOW() - INTERVAL '${BOT_ANNOUNCEMENTS_RETENTION_DAYS} days'
    `
  );
}

/** game_news (per-app Steam news) older than 90 days. */
async function sweepGameNews(): Promise<number> {
  return batchedDelete(
    "game_news",
    `published_at < NOW() - INTERVAL '${GAME_NEWS_RETENTION_DAYS} days'`
  );
}

export type RetentionSweepResult = {
  activityEventsDeleted: number;
  botAnnouncementsDeleted: number;
  gameNewsDeleted: number;
};

/** Nightly pass: prune activity_events, bot_announcements, game_news. */
export async function runRetentionSweep(): Promise<RetentionSweepResult> {
  const activityEventsDeleted = await sweepActivityEvents();
  const botAnnouncementsDeleted = await sweepBotAnnouncements();
  const gameNewsDeleted = await sweepGameNews();

  const result: RetentionSweepResult = {
    activityEventsDeleted,
    botAnnouncementsDeleted,
    gameNewsDeleted
  };

  log.info("retention", "sweep complete", { ...result });

  return result;
}
