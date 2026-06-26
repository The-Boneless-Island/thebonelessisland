import { db } from "../../db/client.js";
import { getAISetting } from "../serverSettings.js";

function intSetting(key: string, fallback: number): number {
  const raw = getAISetting(key);
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getFeedFreshnessDays(): number {
  return intSetting("news_feed_freshness_days", 45);
}

export function getHotRetentionDays(): number {
  return intSetting("news_retention_hot_days", 90);
}

export function getWarmRetentionDays(): number {
  return intSetting("news_retention_warm_days", 365);
}

export async function isFeedStale(): Promise<boolean> {
  const hours = intSetting("news_stale_ingest_hours", 6);
  const r = await db.query<{ latest: string | null }>(
    `SELECT MAX(ai_curated_at)::text AS latest
       FROM general_news
      WHERE ai_relevance_score > 0
        AND ai_validation_failed = FALSE`
  );
  const latest = r.rows[0]?.latest;
  if (!latest) return true;
  return Date.now() - new Date(latest).getTime() > hours * 60 * 60 * 1000;
}

export async function shouldTriggerBackgroundIngest(): Promise<boolean> {
  if (getAISetting("news_ingest_on_page_load") === "true") return true;
  return isFeedStale();
}

/** Rebuild tsvector for searchable primaries. */
async function refreshSearchVectors(): Promise<number> {
  const r = await db.query(
    `
      UPDATE general_news gn
         SET search_vector =
           setweight(to_tsvector('english', COALESCE(gn.ai_title, gn.title, '')), 'A') ||
           setweight(to_tsvector('english', COALESCE(gn.ai_summary, '')), 'B') ||
           setweight(to_tsvector('english', COALESCE(array_to_string(gn.ai_tags, ' '), '')), 'C')
       WHERE gn.retention_tier IN ('hot', 'warm')
         AND COALESCE(gn.ai_relevance_score, 0) > 0
         AND gn.ai_validation_failed = FALSE
         AND gn.ai_summary IS NOT NULL
    `
  );
  return r.rowCount ?? 0;
}

export type RetentionSweepResult = {
  tiersUpdated: number;
  warmed: number;
  searchVectors: number;
  deletedValidation: number;
  deletedUncurated: number;
  deletedExpiredWarm: number;
};

/**
 * Nightly retention pass: assign tiers, strip warm-tier bulk, prune dead rows.
 * Safe to run fire-and-forget.
 */
export async function runNewsRetentionSweep(): Promise<RetentionSweepResult> {
  const hotDays = getHotRetentionDays();
  const warmDays = getWarmRetentionDays();
  const pruneValidationDays = intSetting("news_retention_prune_validation_days", 45);
  const pruneUncuratedDays = intSetting("news_retention_prune_uncurated_days", 45);

  const tierResult = await db.query(
    `
      UPDATE general_news
         SET retention_tier = CASE
           WHEN published_at > NOW() - ($1::text || ' days')::interval THEN 'hot'
           WHEN published_at > NOW() - ($2::text || ' days')::interval THEN 'warm'
           ELSE 'archived'
         END
       WHERE retention_tier IS DISTINCT FROM CASE
           WHEN published_at > NOW() - ($1::text || ' days')::interval THEN 'hot'
           WHEN published_at > NOW() - ($2::text || ' days')::interval THEN 'warm'
           ELSE 'archived'
         END
    `,
    [String(hotDays), String(warmDays)]
  );

  const warmResult = await db.query(
    `
      UPDATE general_news
         SET contents = NULL,
             embedding = NULL
       WHERE retention_tier IN ('warm', 'archived')
         AND (contents IS NOT NULL OR embedding IS NOT NULL)
    `
  );

  const delValidation = await db.query(
    `
      DELETE FROM general_news
       WHERE ai_validation_failed = TRUE
         AND COALESCE(ai_curated_at, fetched_at) < NOW() - ($1::text || ' days')::interval
    `,
    [String(pruneValidationDays)]
  );

  const delUncurated = await db.query(
    `
      DELETE FROM general_news
       WHERE ai_curated_at IS NULL
         AND fetched_at < NOW() - ($1::text || ' days')::interval
    `,
    [String(pruneUncuratedDays)]
  );

  const delWarm = await db.query(
    `
      DELETE FROM general_news
       WHERE retention_tier = 'archived'
         AND published_at < NOW() - ($1::text || ' days')::interval
    `,
    [String(warmDays)]
  );

  const searchVectors = await refreshSearchVectors();

  const result: RetentionSweepResult = {
    tiersUpdated: tierResult.rowCount ?? 0,
    warmed: warmResult.rowCount ?? 0,
    searchVectors,
    deletedValidation: delValidation.rowCount ?? 0,
    deletedUncurated: delUncurated.rowCount ?? 0,
    deletedExpiredWarm: delWarm.rowCount ?? 0
  };

  if (
    result.tiersUpdated > 0 ||
    result.warmed > 0 ||
    result.deletedValidation > 0 ||
    result.deletedUncurated > 0 ||
    result.deletedExpiredWarm > 0
  ) {
    console.log("[news-retention] sweep:", result);
  }

  return result;
}
