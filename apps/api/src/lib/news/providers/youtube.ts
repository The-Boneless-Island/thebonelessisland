import { getAISetting } from "../../serverSettings.js";
import { FeedItem, FetchContext, NewsProvider, NewsSourceRow } from "./types.js";
import { ITEMS_PER_FEED, matchTagsToArticle } from "./util.js";

const FETCH_TIMEOUT_MS = 10_000;

/**
 * YouTube provider. `source.identifier` holds a channel ID (starts with
 * `UC...`). Channel uploads playlist is `UU<suffix>` — same suffix as the
 * channel ID. Gated by the `youtube_api_key` server_setting.
 *
 * Quota: playlistItems.list costs 1 unit per call. With ~4 channels polled
 * per ingestion cycle, daily usage stays well under the 10,000-unit free
 * tier even with hourly cycles.
 */
export const youtubeProvider: NewsProvider = {
  kind: "youtube",
  readinessGate() {
    const key = getAISetting("youtube_api_key");
    if (!key || key === "••••••••") return "youtube_api_key not configured in admin settings";
    return null;
  },
  async fetch(source: NewsSourceRow, ctx: FetchContext): Promise<FeedItem[]> {
    const apiKey = getAISetting("youtube_api_key");
    if (!apiKey) return [];

    const channelId = source.identifier.trim();
    if (!channelId.startsWith("UC")) {
      throw new Error(`YouTube identifier must be a channel ID starting with 'UC' (got: ${channelId})`);
    }
    const uploadsPlaylistId = "UU" + channelId.slice(2);
    const limit = Math.min(ctx.limit ?? ITEMS_PER_FEED, 50);

    const url =
      `https://www.googleapis.com/youtube/v3/playlistItems` +
      `?part=snippet&playlistId=${encodeURIComponent(uploadsPlaylistId)}` +
      `&maxResults=${limit}&key=${encodeURIComponent(apiKey)}`;

    const resp = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`YouTube API ${resp.status}: ${body.slice(0, 200)}`);
    }
    const data = (await resp.json()) as {
      items?: Array<{
        snippet?: {
          publishedAt?: string;
          title?: string;
          description?: string;
          channelTitle?: string;
          thumbnails?: Record<string, { url?: string } | undefined>;
          resourceId?: { videoId?: string };
        };
      }>;
    };

    const items = data.items ?? [];
    return items
      .filter((it) => !!it.snippet?.resourceId?.videoId && !!it.snippet?.title)
      .map((it) => {
        const s = it.snippet!;
        const videoId = s.resourceId!.videoId!;
        const title = s.title!;
        const contents = s.description ?? null;
        const publishedAt = s.publishedAt ? new Date(s.publishedAt) : new Date();
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const thumb =
          s.thumbnails?.maxres?.url ??
          s.thumbnails?.standard?.url ??
          s.thumbnails?.high?.url ??
          s.thumbnails?.medium?.url ??
          s.thumbnails?.default?.url ??
          null;

        return {
          sourceType: "youtube" as const,
          sourceName: source.name,
          externalId: videoUrl,
          title,
          url: videoUrl,
          contents,
          author: s.channelTitle ?? source.name,
          imageUrl: thumb,
          publishedAt,
          matchedTags: matchTagsToArticle(title, contents, ctx.crewTags, ctx.gameNames),
        };
      });
  },
};
