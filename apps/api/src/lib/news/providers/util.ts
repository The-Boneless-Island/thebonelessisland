// Shared helpers used by every NewsProvider.

import Parser from "rss-parser";

/** Substring-match the article against crew game tags + game names. The
 *  result lands in general_news.matched_tags and is later used by the AI
 *  curator for relevance scoring. */
export function matchTagsToArticle(
  title: string,
  contents: string | null,
  crewTags: string[],
  gameNames: string[]
): string[] {
  const haystack = `${title} ${contents ?? ""}`.toLowerCase();
  const tagMatches = crewTags.filter((tag) => haystack.includes(tag));
  const gameMatches = gameNames.filter((name) => haystack.includes(name));
  return [...new Set([...tagMatches, ...gameMatches])];
}

/** Shared rss-parser instance — same custom-field config across providers. */
export const rssParser = new Parser({
  timeout: 10_000,
  customFields: {
    item: [
      ["media:thumbnail", "mediaThumbnail"],
      ["media:content", "mediaContent"],
      ["enclosure", "enclosure"],
    ],
  },
});

/** Max items pulled from a single feed per ingestion cycle. */
export const ITEMS_PER_FEED = 20;

/** Best-effort image-URL extraction from common RSS field shapes. */
export function extractImageUrl(item: unknown): string | null {
  const it = item as {
    mediaThumbnail?: { $?: { url?: string } };
    mediaContent?: { $?: { url?: string } };
    enclosure?: { url?: string };
  };
  return (
    it.mediaThumbnail?.["$"]?.url ??
    it.mediaContent?.["$"]?.url ??
    it.enclosure?.url ??
    null
  );
}
