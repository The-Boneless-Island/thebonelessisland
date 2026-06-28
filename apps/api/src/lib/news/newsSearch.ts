import { db } from "../../db/client.js";
import { embedText, EMBEDDING_DIM, getEmbeddingCast, isEmbeddingColumnAvailable } from "./embeddings.js";

export type NewsSearchHit = {
  id: number;
  title: string;
  aiTitle: string | null;
  aiSummary: string | null;
  aiSubtitle: string | null;
  publishedAt: string;
  url: string;
  imageUrl: string | null;
  aiRelevanceScore: number | null;
  score: number;
  matchKind: "keyword" | "semantic" | "both";
};

export type SimilarArticle = {
  id: number;
  title: string;
  aiTitle: string | null;
  aiSummary: string | null;
  aiSubtitle: string | null;
  publishedAt: string;
  url: string;
  imageUrl: string | null;
  aiRelevanceScore: number | null;
  similarity: number;
};

function mapSearchRow(row: {
  id: number;
  title: string;
  ai_title: string | null;
  ai_summary: string | null;
  ai_subtitle: string | null;
  published_at: string;
  url: string;
  image_url: string | null;
  ai_relevance_score: number | null;
  rank?: number;
  similarity?: number;
  match_kind?: string;
}): NewsSearchHit {
  return {
    id: row.id,
    title: row.title,
    aiTitle: row.ai_title,
    aiSummary: row.ai_summary,
    aiSubtitle: row.ai_subtitle,
    publishedAt: row.published_at,
    url: row.url,
    imageUrl: row.image_url,
    aiRelevanceScore: row.ai_relevance_score,
    score: row.similarity ?? row.rank ?? 0,
    matchKind: (row.match_kind as NewsSearchHit["matchKind"]) ?? "keyword"
  };
}

/** Hybrid keyword (tsvector) + optional semantic (embedding) search over hot/warm primaries. */
export async function searchGeneralNews(query: string, limit = 20): Promise<NewsSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const capped = Math.min(50, Math.max(1, limit));
  const tsQuery = q
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 8)
    .map((w) => w.replace(/[^\w-]/g, ""))
    .filter(Boolean)
    .join(" & ");

  const keywordPromise = tsQuery
    ? db.query<{
        id: number;
        title: string;
        ai_title: string | null;
        ai_summary: string | null;
        ai_subtitle: string | null;
        published_at: string;
        url: string;
        image_url: string | null;
        ai_relevance_score: number | null;
        rank: number;
      }>(
        `
          SELECT gn.id, gn.title, gn.ai_title, gn.ai_summary, gn.ai_subtitle,
                 gn.published_at, gn.url, gn.image_url, gn.ai_relevance_score,
                 ts_rank(gn.search_vector, plainto_tsquery('english', $1)) AS rank
            FROM general_news gn
           WHERE gn.search_vector @@ plainto_tsquery('english', $1)
             AND gn.retention_tier IN ('hot', 'warm')
             AND COALESCE(gn.ai_relevance_score, 0) > 0
             AND gn.ai_validation_failed = FALSE
           ORDER BY rank DESC, gn.published_at DESC
           LIMIT $2
        `,
        [q, capped]
      )
    : Promise.resolve({ rows: [] as never[] });

  let semanticRows: Array<{
    id: number;
    title: string;
    ai_title: string | null;
    ai_summary: string | null;
    ai_subtitle: string | null;
    published_at: string;
    url: string;
    image_url: string | null;
    ai_relevance_score: number | null;
    similarity: number;
  }> = [];

  if ((await isEmbeddingColumnAvailable()) && q.length >= 3) {
    const vec = await embedText(q);
    if (vec) {
      const v = `[${vec.join(",")}]`;
      const cast = await getEmbeddingCast(1);
      const sem = await db.query<{
        id: number;
        title: string;
        ai_title: string | null;
        ai_summary: string | null;
        ai_subtitle: string | null;
        published_at: string;
        url: string;
        image_url: string | null;
        ai_relevance_score: number | null;
        similarity: number;
      }>(
        `
          SELECT gn.id, gn.title, gn.ai_title, gn.ai_summary, gn.ai_subtitle,
                 gn.published_at, gn.url, gn.image_url, gn.ai_relevance_score,
                 1 - (gn.embedding <=> ${cast}) AS similarity
            FROM general_news gn
           WHERE gn.embedding IS NOT NULL
             AND gn.retention_tier IN ('hot', 'warm')
             AND COALESCE(gn.ai_relevance_score, 0) > 0
             AND gn.ai_validation_failed = FALSE
             AND vector_dims(gn.embedding) = $3
           ORDER BY gn.embedding <=> ${cast}
           LIMIT $2
        `,
        [v, capped, EMBEDDING_DIM]
      );
      semanticRows = sem.rows.filter((r) => r.similarity >= 0.72);
    }
  }

  const keywordRows = (await keywordPromise).rows;
  const merged = new Map<number, NewsSearchHit>();

  for (const row of keywordRows) {
    merged.set(row.id, mapSearchRow({ ...row, match_kind: "keyword" }));
  }
  for (const row of semanticRows) {
    const existing = merged.get(row.id);
    if (existing) {
      existing.matchKind = "both";
      existing.score = Math.max(existing.score, row.similarity);
    } else {
      merged.set(row.id, mapSearchRow({ ...row, match_kind: "semantic" }));
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.score - a.score || b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, capped);
}

/** Nearest-neighbor stories for "More like this" (embedding-only, cheap). */
export async function findSimilarArticles(
  newsId: number,
  limit = 6
): Promise<SimilarArticle[]> {
  if (!(await isEmbeddingColumnAvailable())) return [];

  const source = await db.query<{ embedding: string | null }>(
    `SELECT embedding::text AS embedding FROM general_news WHERE id = $1`,
    [newsId]
  );
  const embedding = source.rows[0]?.embedding;
  if (!embedding) return [];

  const capped = Math.min(12, Math.max(1, limit));
  const cast = await getEmbeddingCast(1);
  const r = await db.query<{
    id: number;
    title: string;
    ai_title: string | null;
    ai_summary: string | null;
    ai_subtitle: string | null;
    published_at: string;
    url: string;
    image_url: string | null;
    ai_relevance_score: number | null;
    similarity: number;
  }>(
    `
      SELECT gn.id, gn.title, gn.ai_title, gn.ai_summary, gn.ai_subtitle,
             gn.published_at, gn.url, gn.image_url, gn.ai_relevance_score,
             1 - (gn.embedding <=> ${cast}) AS similarity
        FROM general_news gn
       WHERE gn.embedding IS NOT NULL
         AND gn.id <> $2
         AND gn.retention_tier IN ('hot', 'warm')
         AND COALESCE(gn.ai_relevance_score, 0) > 0
         AND gn.ai_validation_failed = FALSE
         AND vector_dims(gn.embedding) = $4
       ORDER BY gn.embedding <=> ${cast}
       LIMIT $3
    `,
    [embedding, newsId, capped, EMBEDDING_DIM]
  );

  return r.rows
    .filter((row) => row.similarity >= 0.75)
    .map((row) => ({
      id: row.id,
      title: row.title,
      aiTitle: row.ai_title,
      aiSummary: row.ai_summary,
      aiSubtitle: row.ai_subtitle,
      publishedAt: row.published_at,
      url: row.url,
      imageUrl: row.image_url,
      aiRelevanceScore: row.ai_relevance_score,
      similarity: row.similarity
    }));
}
