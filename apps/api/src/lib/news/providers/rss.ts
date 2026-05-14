import { FeedItem, FetchContext, NewsProvider, NewsSourceRow } from "./types.js";
import { ITEMS_PER_FEED, extractImageUrl, matchTagsToArticle, rssParser } from "./util.js";

/**
 * Generic RSS provider. `source.identifier` holds the feed URL directly —
 * same handling for curated presets and admin-added custom feeds.
 */
export const rssProvider: NewsProvider = {
  kind: "rss",
  readinessGate: () => null, // RSS is always ready; no credential needed.
  async fetch(source: NewsSourceRow, ctx: FetchContext): Promise<FeedItem[]> {
    const parsed = await rssParser.parseURL(source.identifier);
    const limit = ctx.limit ?? ITEMS_PER_FEED;
    const items = (parsed.items ?? []).slice(0, limit);

    return items
      .filter((item) => !!item.link && !!item.title)
      .map((item) => {
        const url = item.link!;
        const title = item.title!;
        const contents = item.contentSnippet ?? item.content ?? null;
        const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();
        return {
          sourceType: "rss" as const,
          sourceName: source.name,
          externalId: url,
          title,
          url,
          contents,
          author: item.creator ?? null,
          imageUrl: extractImageUrl(item),
          publishedAt,
          matchedTags: matchTagsToArticle(title, contents, ctx.crewTags, ctx.gameNames),
        };
      });
  },
};
