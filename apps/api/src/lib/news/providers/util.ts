// Shared helpers used by every NewsProvider.

import Parser from "rss-parser";
import { extractImageFromHtml } from "../newsImageHtml.js";

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

/** Best-effort image-URL extraction from common RSS field shapes.
 *  Priority: media:content > media:thumbnail > enclosure (image/*) > description img. */
export function extractImageUrl(item: unknown): string | null {
  const it = item as {
    mediaThumbnail?: { $?: { url?: string; width?: string; height?: string } };
    mediaContent?: { $?: { url?: string; medium?: string; type?: string } } | Array<{ $?: { url?: string; medium?: string; type?: string } }>;
    enclosure?: { url?: string; type?: string };
    content?: string;
    contentSnippet?: string;
    summary?: string;
    description?: string;
  };

  const mediaContents = Array.isArray(it.mediaContent) ? it.mediaContent : it.mediaContent ? [it.mediaContent] : [];
  for (const mc of mediaContents) {
    const url = mc?.$?.url;
    const type = mc?.$?.type ?? "";
    const medium = mc?.$?.medium ?? "";
    if (url && (type.includes("image") || medium === "image")) return url;
  }

  const thumbUrl = it.mediaThumbnail?.["$"]?.url;
  if (thumbUrl) return thumbUrl;

  const encType = it.enclosure?.type ?? "";
  if (it.enclosure?.url && encType.includes("image")) return it.enclosure.url;

  const html =
    (typeof it.content === "string" && it.content) ||
    (typeof it.description === "string" && it.description) ||
    (typeof it.summary === "string" && it.summary) ||
    null;
  return extractImageFromHtml(html);
}
