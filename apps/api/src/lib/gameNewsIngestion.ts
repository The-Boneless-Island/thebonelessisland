import Parser from "rss-parser";
import { db } from "../db/client.js";

type SteamNewsItem = {
  gid?: string;
  title?: string;
  url?: string;
  is_external_url?: boolean;
  author?: string;
  contents?: string;
  feedlabel?: string;
  feedname?: string;
  feed_type?: number;
  date?: number;
  tags?: string[];
};

type SteamNewsResponse = {
  appnews?: {
    appid?: number;
    newsitems?: SteamNewsItem[];
  };
};

type SourceRow = {
  id: number;
  app_id: number;
  source_type: "rss" | "atom";
  source_url: string;
  label: string | null;
};

type NormalizedItem = SteamNewsItem & {
  sourceKind: "steam" | "rss";
  sourceLabel: string | null;
};

const STEAM_NEWS_PER_APP = 10;
const STEAM_NEWS_MAXLENGTH = 400;
const RSS_NEWS_PER_SOURCE = 8;
// Filter to first-party publisher announcements only — drops third-party news
// outlets Steam mirrors (IGN, etc.) and screenshot/press_release noise.
const STEAM_NEWS_FEEDS = "steam_community_announcements";

const rssParser = new Parser({ timeout: 8000 });

function stripHtml(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

async function fetchSteamNewsForApp(appId: number): Promise<NormalizedItem[]> {
  const url =
    `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/` +
    `?appid=${appId}&count=${STEAM_NEWS_PER_APP}&maxlength=${STEAM_NEWS_MAXLENGTH}&format=json` +
    `&feeds=${STEAM_NEWS_FEEDS}`;
  const response = await fetch(url).catch(() => null);
  if (!response?.ok) {
    return [];
  }
  const payload = (await response.json().catch(() => null)) as SteamNewsResponse | null;
  const items = payload?.appnews?.newsitems ?? [];
  return items.map((item) => ({ ...item, sourceKind: "steam", sourceLabel: null }));
}

async function fetchRssForSource(source: SourceRow): Promise<NormalizedItem[]> {
  try {
    const feed = await rssParser.parseURL(source.source_url);
    const items = (feed.items ?? []).slice(0, RSS_NEWS_PER_SOURCE);
    const label = source.label ?? feed.title ?? null;

    await db.query(
      `UPDATE game_news_sources SET fetched_at = NOW(), last_error = NULL WHERE id = $1`,
      [source.id]
    );

    return items.map((item) => {
      const dedupeKey = item.guid || item.link || item.title || "";
      const isoDate = item.isoDate || item.pubDate;
      const date = isoDate ? Math.floor(new Date(isoDate).getTime() / 1000) : 0;
      return {
        gid: `rss::${source.id}::${dedupeKey}`,
        title: item.title ?? "",
        url: item.link ?? "",
        contents: stripHtml(item.contentSnippet || item.content || item.summary || ""),
        author: item.creator ?? undefined,
        date,
        tags: Array.isArray(item.categories) ? item.categories.filter((c): c is string => typeof c === "string") : [],
        feedlabel: label ?? undefined,
        feedname: label ?? undefined,
        is_external_url: true,
        sourceKind: "rss" as const,
        sourceLabel: label
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.query(
      `UPDATE game_news_sources SET fetched_at = NOW(), last_error = $1 WHERE id = $2`,
      [message.slice(0, 500), source.id]
    );
    return [];
  }
}

async function loadEnabledSourcesForApp(appId: number): Promise<SourceRow[]> {
  const result = await db.query<SourceRow>(
    `
      SELECT id, app_id, source_type, source_url, label
      FROM game_news_sources
      WHERE app_id = $1 AND enabled = TRUE
      ORDER BY id
    `,
    [appId]
  );
  return result.rows;
}

async function upsertNewsItems(appId: number, items: NormalizedItem[]): Promise<void> {
  for (const item of items) {
    const gid = typeof item.gid === "string" ? item.gid.trim() : "";
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const url = typeof item.url === "string" ? item.url.trim() : "";
    const date = typeof item.date === "number" ? item.date : 0;
    if (!gid || !title || !url || !date) {
      continue;
    }

    const tags = Array.isArray(item.tags) ? item.tags.filter((tag) => typeof tag === "string") : [];

    await db.query(
      `
        INSERT INTO game_news (
          app_id,
          gid,
          title,
          url,
          contents,
          feed_label,
          feed_name,
          feed_type,
          is_external_url,
          author,
          tags,
          published_at,
          fetched_at,
          source_kind,
          source_label
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::text[], to_timestamp($12), NOW(), $13, $14)
        ON CONFLICT (app_id, gid)
        DO UPDATE SET
          title = EXCLUDED.title,
          url = EXCLUDED.url,
          contents = EXCLUDED.contents,
          feed_label = EXCLUDED.feed_label,
          feed_name = EXCLUDED.feed_name,
          feed_type = EXCLUDED.feed_type,
          is_external_url = EXCLUDED.is_external_url,
          author = EXCLUDED.author,
          tags = EXCLUDED.tags,
          published_at = EXCLUDED.published_at,
          fetched_at = NOW(),
          source_kind = EXCLUDED.source_kind,
          source_label = EXCLUDED.source_label
      `,
      [
        appId,
        gid,
        title,
        url,
        item.contents ?? null,
        item.feedlabel ?? null,
        item.feedname ?? null,
        typeof item.feed_type === "number" ? item.feed_type : null,
        Boolean(item.is_external_url),
        item.author ?? null,
        tags,
        date,
        item.sourceKind,
        item.sourceLabel
      ]
    );
  }
}

export async function ingestNewsForApps(
  appIds: number[],
  options: { staleAfterMs?: number; maxApps?: number } = {}
): Promise<{ ingestedApps: number; ingestedItems: number }> {
  const staleAfterMs = options.staleAfterMs ?? 6 * 60 * 60 * 1000;
  const maxApps = options.maxApps ?? 8;

  if (appIds.length === 0) {
    return { ingestedApps: 0, ingestedItems: 0 };
  }

  const cutoff = new Date(Date.now() - staleAfterMs).toISOString();
  const stale = await db.query<{ app_id: number }>(
    `
      SELECT app_id
      FROM games
      WHERE app_id = ANY($1::int[])
        AND (news_checked_at IS NULL OR news_checked_at < $2::timestamptz)
      ORDER BY news_checked_at NULLS FIRST, app_id ASC
      LIMIT $3::int
    `,
    [appIds, cutoff, maxApps]
  );

  let ingestedItems = 0;
  for (const row of stale.rows) {
    const sources = await loadEnabledSourcesForApp(row.app_id);
    const fetched = await Promise.all([
      fetchSteamNewsForApp(row.app_id),
      ...sources.map((src) => fetchRssForSource(src))
    ]);
    const all = fetched.flat();
    if (all.length > 0) {
      await upsertNewsItems(row.app_id, all);
      ingestedItems += all.length;
    }
    await db.query(`UPDATE games SET news_checked_at = NOW() WHERE app_id = $1`, [row.app_id]);
  }

  return { ingestedApps: stale.rows.length, ingestedItems };
}
