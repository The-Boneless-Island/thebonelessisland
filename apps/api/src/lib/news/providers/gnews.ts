import { getAISetting } from "../../serverSettings.js";
import { FeedItem, FetchContext, NewsProvider, NewsSourceRow } from "./types.js";
import { matchTagsToArticle } from "./util.js";

const FETCH_TIMEOUT_MS = 10_000;

/**
 * GNews provider. `source.identifier` holds the search query. Gated by the
 * `newsapi_key` server_setting (named that for legacy reasons; it is the
 * GNews.io key). Free tier: 100 requests/day.
 *
 * Note: sourceType is emitted as "newsapi" to match existing general_news
 * rows so dedup keeps working across the migration.
 */
export const gnewsProvider: NewsProvider = {
  kind: "gnews",
  readinessGate() {
    const key = getAISetting("newsapi_key");
    if (!key || key === "••••••••") return "newsapi_key not configured in admin settings";
    return null;
  },
  async fetch(source: NewsSourceRow, ctx: FetchContext): Promise<FeedItem[]> {
    const apiKey = getAISetting("newsapi_key");
    if (!apiKey) return [];

    const query = source.identifier || "video games gaming";
    const max = Math.min(ctx.limit ?? 10, 25);
    const url =
      `https://gnews.io/api/v4/search` +
      `?q=${encodeURIComponent(query)}&lang=en&max=${max}` +
      `&sortby=publishedAt&apikey=${encodeURIComponent(apiKey)}`;

    const resp = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`GNews API ${resp.status}: ${body.slice(0, 200)}`);
    }

    const data = (await resp.json()) as {
      articles?: Array<{
        title: string;
        url: string;
        description: string | null;
        content: string | null;
        publishedAt: string;
        source: { name: string };
        image: string | null;
        author: string | null;
      }>;
    };

    const articles = data.articles ?? [];
    return articles.map((a) => ({
      sourceType: "newsapi" as const,
      sourceName: a.source.name,
      externalId: a.url,
      title: a.title,
      url: a.url,
      contents: a.content ?? a.description,
      author: a.author,
      imageUrl: a.image,
      publishedAt: new Date(a.publishedAt),
      matchedTags: matchTagsToArticle(a.title, a.content ?? a.description, ctx.crewTags, ctx.gameNames),
    }));
  },
};
