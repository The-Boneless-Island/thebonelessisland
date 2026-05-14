import { getAISetting } from "../../serverSettings.js";
import { FeedItem, FetchContext, NewsProvider, NewsSourceRow } from "./types.js";
import { ITEMS_PER_FEED, matchTagsToArticle, rssParser } from "./util.js";

const DEFAULT_USER_AGENT = "boneless-island-news-bot/1.0";
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Reddit provider. `source.identifier` holds the subreddit name (e.g.
 * "pcgaming"). Reads `reddit_user_agent` from server_settings — Reddit asks
 * for a unique UA per app and may rate-limit clients sending generic ones.
 * No OAuth token required for the public .rss endpoint.
 */
export const redditProvider: NewsProvider = {
  kind: "reddit",
  readinessGate: () => null, // Public RSS — no key required.
  async fetch(source: NewsSourceRow, ctx: FetchContext): Promise<FeedItem[]> {
    const userAgent = getAISetting("reddit_user_agent") || DEFAULT_USER_AGENT;
    const url = `https://www.reddit.com/r/${encodeURIComponent(source.identifier)}/.rss`;

    const resp = await fetch(url, {
      headers: { "User-Agent": userAgent, Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) {
      throw new Error(`Reddit RSS ${resp.status} for r/${source.identifier}`);
    }
    const xml = await resp.text();
    const parsed = await rssParser.parseString(xml);

    const limit = ctx.limit ?? ITEMS_PER_FEED;
    const items = (parsed.items ?? []).slice(0, limit);

    return items
      .filter((item) => !!item.link && !!item.title)
      .map((item) => {
        const link = item.link!;
        const title = item.title!;
        const contents = item.contentSnippet ?? item.content ?? null;
        const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();
        return {
          sourceType: "reddit" as const,
          sourceName: source.name,
          externalId: link,
          title,
          url: link,
          contents,
          author: item.creator ?? null,
          imageUrl: null, // Reddit RSS doesn't expose post thumbnails directly.
          publishedAt,
          matchedTags: matchTagsToArticle(title, contents, ctx.crewTags, ctx.gameNames),
        };
      });
  },
};
