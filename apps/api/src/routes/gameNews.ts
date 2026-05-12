import express from "express";
import { db } from "../db/client.js";
import { requireParentRole, requireSession } from "../lib/auth.js";
import { ingestNewsForApps } from "../lib/gameNewsIngestion.js";
import { getAISetting, getGuildId } from "../lib/serverSettings.js";
import { curateUncuratedNews, forceCurateNews } from "../lib/newsCurator.js";

export const gameNewsRouter = express.Router();
gameNewsRouter.use(requireSession);

type ScopeRow = {
  app_id: number;
  is_library: boolean;
  is_wishlist: boolean;
  is_crew: boolean;
};

async function resolveScopeAppIds(discordUserId: string): Promise<{
  byAppId: Map<number, { isLibrary: boolean; isWishlist: boolean; isCrew: boolean }>;
  topAppIds: number[];
}> {
  if (!getGuildId()) {
    return { byAppId: new Map(), topAppIds: [] };
  }

  const result = await db.query<ScopeRow>(
    `
      WITH me AS (
        SELECT id FROM users WHERE discord_user_id = $1
      ),
      crew_owned AS (
        SELECT ug.app_id
        FROM user_games ug
        INNER JOIN users u ON u.id = ug.user_id
        INNER JOIN guild_members gm
          ON gm.discord_user_id = u.discord_user_id
         AND gm.guild_id = $2
         AND gm.in_guild = TRUE
        GROUP BY ug.app_id
      ),
      crew_wishlist AS (
        SELECT uw.app_id
        FROM user_wishlists uw
        INNER JOIN users u ON u.id = uw.user_id
        INNER JOIN guild_members gm
          ON gm.discord_user_id = u.discord_user_id
         AND gm.guild_id = $2
         AND gm.in_guild = TRUE
        GROUP BY uw.app_id
      ),
      my_owned AS (
        SELECT ug.app_id FROM user_games ug INNER JOIN me ON me.id = ug.user_id
      ),
      my_wishlist AS (
        SELECT uw.app_id FROM user_wishlists uw INNER JOIN me ON me.id = uw.user_id
      ),
      crew_owner_counts AS (
        SELECT ug.app_id, COUNT(DISTINCT u.id)::int AS owners
        FROM user_games ug
        INNER JOIN users u ON u.id = ug.user_id
        INNER JOIN guild_members gm
          ON gm.discord_user_id = u.discord_user_id
         AND gm.guild_id = $2
         AND gm.in_guild = TRUE
        GROUP BY ug.app_id
      )
      SELECT
        all_apps.app_id,
        EXISTS (SELECT 1 FROM my_owned mo WHERE mo.app_id = all_apps.app_id) AS is_library,
        EXISTS (SELECT 1 FROM my_wishlist mw WHERE mw.app_id = all_apps.app_id) AS is_wishlist,
        EXISTS (SELECT 1 FROM crew_owned co WHERE co.app_id = all_apps.app_id) AS is_crew
      FROM (
        SELECT app_id FROM crew_owned
        UNION
        SELECT app_id FROM crew_wishlist
      ) AS all_apps
      ORDER BY all_apps.app_id
      LIMIT 500
    `,
    [discordUserId, getGuildId()]
  );

  const byAppId = new Map<number, { isLibrary: boolean; isWishlist: boolean; isCrew: boolean }>();
  for (const row of result.rows) {
    byAppId.set(row.app_id, {
      isLibrary: row.is_library,
      isWishlist: row.is_wishlist,
      isCrew: row.is_crew
    });
  }

  // Rank by owner count but cap each developer at 2 games to prevent
  // dominant studios (e.g. Valve) from filling all ingestion slots.
  const devCapSetting = getAISetting("news_dev_cap");
  const devCap = Math.max(1, parseInt(devCapSetting ?? "5", 10) || 5);

  const ranked = await db.query<{ app_id: number }>(
    `
      WITH owner_counts AS (
        SELECT ug.app_id, COUNT(DISTINCT u.id)::int AS owners
        FROM user_games ug
        INNER JOIN users u ON u.id = ug.user_id
        INNER JOIN guild_members gm
          ON gm.discord_user_id = u.discord_user_id
         AND gm.guild_id = $2
         AND gm.in_guild = TRUE
        GROUP BY ug.app_id
      ),
      ranked AS (
        SELECT
          g.app_id,
          COALESCE(oc.owners, 0) AS owners,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(g.developers[1], 'unknown')
            ORDER BY COALESCE(oc.owners, 0) DESC, g.app_id ASC
          ) AS dev_rank
        FROM games g
        LEFT JOIN owner_counts oc ON oc.app_id = g.app_id
        WHERE g.app_id = ANY($1::int[])
      )
      SELECT app_id FROM ranked
      WHERE dev_rank <= $3
      ORDER BY owners DESC, app_id ASC
      LIMIT 50
    `,
    [Array.from(byAppId.keys()), getGuildId(), devCap]
  );

  return { byAppId, topAppIds: ranked.rows.map((row) => row.app_id) };
}

type NewsRow = {
  app_id: number;
  game_name: string;
  header_image_url: string | null;
  gid: string;
  title: string;
  url: string;
  contents: string | null;
  feed_label: string | null;
  feed_name: string | null;
  feed_type: number | null;
  is_external_url: boolean;
  author: string | null;
  tags: string[];
  published_at: string;
  ai_relevance_score: number | null;
  ai_summary: string | null;
  ai_label: string | null;
  ai_spoiler_warning: boolean;
  source_kind: string | null;
  source_label: string | null;
};

gameNewsRouter.get("/news", async (_req, res) => {
  const discordUserId = String(res.locals.userId);

  const scope = await resolveScopeAppIds(discordUserId);
  const allAppIds = Array.from(scope.byAppId.keys());

  if (allAppIds.length === 0) {
    res.json({ news: [] });
    return;
  }

  // Fire-and-forget: ingest fresh Steam news, then curate. 30 apps × Steam fetch
  // takes ~30s — would time out the request if awaited. Page returns current
  // rows immediately; next reload sees the fresh batch.
  ingestNewsForApps(scope.topAppIds, { maxApps: 30 })
    .then(() => curateUncuratedNews(scope.topAppIds))
    .catch((err) => {
      console.error("[gameNews] background ingest/curate error:", err);
    });

  const result = await db.query<NewsRow>(
    `
      WITH eligible AS (
        SELECT
          n.app_id,
          n.gid,
          n.title,
          n.url,
          n.contents,
          n.feed_label,
          n.feed_name,
          n.feed_type,
          n.is_external_url,
          n.author,
          n.tags,
          n.published_at,
          n.ai_relevance_score,
          n.ai_summary,
          n.ai_label,
          n.ai_spoiler_warning,
          n.source_kind,
          n.source_label,
          ROW_NUMBER() OVER (
            PARTITION BY n.app_id
            ORDER BY n.published_at DESC, COALESCE(n.ai_relevance_score, 0) DESC
          ) AS per_game_rank
        FROM game_news n
        WHERE n.app_id = ANY($1::int[])
          AND COALESCE(n.ai_relevance_score, 1) > 0
          AND (n.source_kind = 'rss' OR n.feed_name = 'steam_community_announcements')
          AND n.published_at > NOW() - INTERVAL '60 days'
      )
      SELECT
        e.app_id,
        g.name AS game_name,
        g.header_image_url,
        e.gid,
        e.title,
        e.url,
        e.contents,
        e.feed_label,
        e.feed_name,
        e.feed_type,
        e.is_external_url,
        e.author,
        e.tags,
        e.published_at,
        e.ai_relevance_score,
        e.ai_summary,
        e.ai_label,
        e.ai_spoiler_warning,
        e.source_kind,
        e.source_label
      FROM eligible e
      INNER JOIN games g ON g.app_id = e.app_id
      WHERE e.per_game_rank <= 3
      ORDER BY e.ai_relevance_score DESC NULLS LAST, e.published_at DESC
      LIMIT 60
    `,
    [allAppIds]
  );

  res.json({
    news: result.rows.map((row) => {
      const scopes = scope.byAppId.get(row.app_id);
      const tagSet: Array<"library" | "wishlist" | "crew"> = [];
      if (scopes?.isLibrary) tagSet.push("library");
      if (scopes?.isWishlist) tagSet.push("wishlist");
      if (scopes?.isCrew) tagSet.push("crew");
      return {
        appId: row.app_id,
        gameName: row.game_name,
        headerImageUrl: row.header_image_url,
        gid: row.gid,
        title: row.title,
        url: row.url,
        contents: row.contents,
        feedLabel: row.feed_label,
        feedName: row.feed_name,
        feedType: row.feed_type,
        isExternalUrl: row.is_external_url,
        author: row.author,
        tags: row.tags,
        publishedAt: row.published_at,
        scopes: tagSet,
        aiRelevanceScore: row.ai_relevance_score,
        aiSummary: row.ai_summary,
        aiLabel: row.ai_label as "personal" | "community" | "top_news" | null,
        aiSpoilerWarning: row.ai_spoiler_warning,
        sourceKind: row.source_kind ?? "steam",
        sourceLabel: row.source_label
      };
    })
  });
});

gameNewsRouter.post("/news/curate", requireParentRole, async (_req, res) => {
  const guildId = getGuildId();
  if (!guildId) {
    res.status(503).json({ error: "Guild not configured" });
    return;
  }

  // Resolve the top app IDs across the whole crew (same logic as news GET, but all crew)
  const ranked = await db.query<{ app_id: number }>(
    `
      SELECT g.app_id
      FROM games g
      INNER JOIN user_games ug ON ug.app_id = g.app_id
      INNER JOIN users u ON u.id = ug.user_id
      INNER JOIN guild_members gm ON gm.discord_user_id = u.discord_user_id AND gm.guild_id = $1 AND gm.in_guild = TRUE
      GROUP BY g.app_id
      ORDER BY COUNT(DISTINCT u.id) DESC
      LIMIT 50
    `,
    [guildId]
  );

  const appIds = ranked.rows.map((r) => r.app_id);
  const curated = await forceCurateNews(appIds);
  res.json({ ok: true, curated });
});
