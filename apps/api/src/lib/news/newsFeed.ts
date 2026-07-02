import { getFeedDecayHalfLifeHours, getFeedFreshnessDays } from "./newsRetention.js";

type FeedQueryParts = {
  sql: string;
  params: unknown[];
};

/** Shared feed SQL: fingerprint collapse, freshness window, optional member mutes. */
export function buildGeneralNewsFeedQuery(userId?: string): FeedQueryParts {
  const freshnessDays = getFeedFreshnessDays();
  const params: unknown[] = [];
  let muteClause = "";

  if (userId) {
    params.push(userId);
    muteClause = `
      AND NOT EXISTS (
        SELECT 1
          FROM general_news_mutes gnm
          INNER JOIN users u ON u.id = gnm.user_id
         WHERE u.discord_user_id = $${params.length}
           AND (
             (gnm.kind = 'source' AND LOWER(gn.source_name) = gnm.value)
             OR (gnm.kind = 'tag' AND gnm.value = ANY(gn.ai_tags))
             OR (gnm.kind = 'game' AND LOWER(COALESCE(gn.ai_game_title, '')) = gnm.value)
           )
      )`;
  }

  params.push(String(freshnessDays));
  const freshnessParam = `$${params.length}`;

  params.push(getFeedDecayHalfLifeHours());
  const halfLifeParam = `$${params.length}`;

  const sql = `
    WITH ranked AS (
      SELECT
        gn.*,
        CASE
          WHEN gn.ai_story_fingerprint IS NOT NULL
            AND gn.ai_story_fingerprint <> ''
            AND POSITION(':' IN gn.ai_story_fingerprint) > 1
            THEN LOWER(split_part(gn.ai_story_fingerprint, ':', 1))
              || '::'
              || to_char(DATE_TRUNC('week', gn.published_at), 'YYYY-MM-DD')
          ELSE gn.external_id
        END AS cluster_key,
        ROW_NUMBER() OVER (
          PARTITION BY
            CASE
              WHEN gn.ai_story_fingerprint IS NOT NULL AND gn.ai_story_fingerprint <> ''
                THEN LOWER(split_part(gn.ai_story_fingerprint, ':', 1))
                  || '::'
                  || to_char(DATE_TRUNC('week', gn.published_at), 'YYYY-MM-DD')
              ELSE gn.external_id
            END
          ORDER BY gn.ai_relevance_score DESC NULLS LAST, gn.published_at DESC
        ) AS rk,
        -- Coverage = how many feed-eligible articles cluster into this story.
        -- Lots of outlets covering it = a big story most members will click.
        COUNT(*) OVER (
          PARTITION BY
            CASE
              WHEN gn.ai_story_fingerprint IS NOT NULL AND gn.ai_story_fingerprint <> ''
                THEN LOWER(split_part(gn.ai_story_fingerprint, ':', 1))
                  || '::'
                  || to_char(DATE_TRUNC('week', gn.published_at), 'YYYY-MM-DD')
              ELSE gn.external_id
            END
        ) AS cluster_size
      FROM general_news gn
      WHERE gn.ai_curated_at IS NOT NULL
        AND gn.ai_relevance_score > 0
        AND gn.ai_validation_failed = FALSE
        AND gn.ai_summary IS NOT NULL
        AND LENGTH(TRIM(gn.ai_summary)) >= 250
        AND gn.retention_tier IN ('hot', 'warm')
        ${muteClause}
    ),
    cluster_urls AS (
      SELECT
        cluster_key,
        array_agg(DISTINCT url) AS sibling_urls
      FROM ranked
      WHERE ai_story_fingerprint IS NOT NULL AND ai_story_fingerprint <> ''
      GROUP BY cluster_key
      HAVING COUNT(*) > 1
    )
    SELECT
      r.id,
      r.source_type,
      r.source_name,
      r.external_id,
      r.title,
      r.url,
      r.contents,
      r.author,
      r.image_url,
      r.published_at,
      r.matched_tags,
      r.ai_relevance_score,
      r.ai_summary,
      r.ai_subtitle,
      r.ai_tags,
      r.ai_why_recommended,
      r.ai_label,
      r.ai_spoiler_warning,
      r.ai_game_title,
      r.ai_title,
      r.linked_app_id,
      CASE
        WHEN cu.sibling_urls IS NOT NULL THEN (
          SELECT array_agg(DISTINCT u)
          FROM unnest(COALESCE(r.ai_sources, '{}'::text[]) || cu.sibling_urls) AS u
        )
        ELSE r.ai_sources
      END AS ai_sources,
      fb.upvotes,
      fb.downvotes
    FROM ranked r
    LEFT JOIN cluster_urls cu ON cu.cluster_key = r.cluster_key
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE rating = 1)::int  AS upvotes,
        COUNT(*) FILTER (WHERE rating = -1)::int AS downvotes
      FROM general_news_feedback
      WHERE news_id = r.id
    ) fb ON true
    WHERE r.rk = 1
      AND (
        r.published_at > NOW() - (${freshnessParam}::text || ' days')::interval
        OR (
          COALESCE(r.ai_relevance_score, 0) >= 0.85
          AND r.published_at > NOW() - ((${freshnessParam}::int * 2)::text || ' days')::interval
        )
      )
    -- Recency-decayed signal rank. Base signal = AI relevance + coverage
    -- (how many outlets cover the story) + net member votes. That base is then
    -- halved every news_feed_decay_half_life_hours hours, so the hero (feed[0])
    -- rotates ~3x/day to the freshest BIG story and never camps on one card.
    -- A story that keeps gaining coverage/votes resists the decay; a stale one
    -- falls away.
    ORDER BY (
      (
        COALESCE(r.ai_relevance_score, 0.5)
        + LN(1 + r.cluster_size::double precision) * 0.35
        + (fb.upvotes - fb.downvotes) * 0.2
      )
      * POWER(
          0.5::double precision,
          GREATEST(EXTRACT(EPOCH FROM (NOW() - r.published_at)), 0)::double precision
            / (3600.0::double precision * ${halfLifeParam}::double precision)
        )
    ) DESC, r.published_at DESC
    LIMIT 50
  `;

  return { sql, params };
}
