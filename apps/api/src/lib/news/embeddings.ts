import OpenAI from "openai";
import { env } from "../../config.js";
import { db } from "../../db/client.js";
import { recordAiCost } from "../ai/usageTally.js";
import { getAISetting } from "../serverSettings.js";

// Embeddings-based clustering. Uses OpenAI text-embedding-3-small (1536-dim,
// $0.02 / 1M tokens — effectively free at our volume). Stored in
// general_news.embedding (pgvector column) and queried with cosine distance
// (`<=>`) against existing primary cards to find merge candidates.

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;
const EMBEDDING_PRICE_PER_M_TOKENS = 0.02; // $USD, input only
// Cosine-similarity threshold for treating two articles as the same story.
// 0.85 picks up "ARC Raiders cadence shift" variants across outlets but won't
// merge "ARC Raiders cadence shift" with "ARC Raiders season 2 launch".
const SIMILARITY_THRESHOLD = 0.85;
const SIMILARITY_WINDOW_DAYS = 14;

let availabilityChecked = false;
let columnAvailable = false;

/** Returns true once both pgvector is installed AND the column exists. */
export async function isEmbeddingColumnAvailable(): Promise<boolean> {
  if (availabilityChecked) return columnAvailable;
  availabilityChecked = true;
  const r = await db.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM information_schema.columns
        WHERE table_name = 'general_news' AND column_name = 'embedding'
     ) AS exists`
  );
  columnAvailable = r.rows[0]?.exists === true;
  if (!columnAvailable) {
    console.warn(
      "[embeddings] general_news.embedding column missing — pgvector not installed. Falling back to fingerprint-only clustering."
    );
  }
  return columnAvailable;
}

function resolveOpenAIKey(): string | null {
  // Embeddings use OpenAI's text-embedding-3-small. Same OpenAI account as the
  // chat models, so we read the shared openai_api_key setting first. Legacy
  // ai_api_key fallback covers installs where the admin only ever configured
  // one key and had OpenAI selected as the chat provider.
  const fromOpenAI = getAISetting("openai_api_key");
  const legacy = getAISetting("ai_api_key");
  const key = (fromOpenAI || legacy || env.OPENAI_API_KEY || "").trim();
  return key.length > 0 ? key : null;
}

let cachedClient: OpenAI | null = null;
let cachedKey: string | null = null;
function getClient(): OpenAI | null {
  const key = resolveOpenAIKey();
  if (!key) return null;
  if (cachedClient && cachedKey === key) return cachedClient;
  cachedClient = new OpenAI({ apiKey: key });
  cachedKey = key;
  return cachedClient;
}

/** Embed a piece of text. Returns null when no key is configured or input is empty. */
export async function embedText(text: string): Promise<number[] | null> {
  const client = getClient();
  if (!client) return null;
  const trimmed = (text ?? "").slice(0, 6000).trim();
  if (trimmed.length < 8) return null;
  try {
    const resp = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: trimmed
    });
    const vec = resp.data[0]?.embedding;
    if (!vec || vec.length !== EMBEDDING_DIM) return null;
    const promptTokens = resp.usage?.prompt_tokens ?? 0;
    if (promptTokens > 0) {
      const cost = (promptTokens * EMBEDDING_PRICE_PER_M_TOKENS) / 1_000_000;
      recordAiCost("openai", EMBEDDING_MODEL, cost);
    }
    return vec;
  } catch (err) {
    console.warn("[embeddings] embedText failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** pgvector literal — `'[0.1, 0.2, ...]'::vector`. */
function vectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

export type SimilarPrimary = {
  id: number;
  external_id: string;
  similarity: number;
  fingerprint: string | null;
  ai_sources: string[] | null;
};

/** Nearest curated primary within the lookback window if cosine similarity > threshold. */
export async function findSimilarPrimary(
  embedding: number[],
  excludeId?: number
): Promise<SimilarPrimary | null> {
  const v = vectorLiteral(embedding);
  const r = await db.query<{
    id: number;
    external_id: string;
    similarity: number;
    ai_story_fingerprint: string | null;
    ai_sources: string[] | null;
  }>(
    `
      SELECT id, external_id, ai_story_fingerprint, ai_sources,
             1 - (embedding <=> $1::vector) AS similarity
        FROM general_news
       WHERE embedding IS NOT NULL
         AND ai_curated_at IS NOT NULL
         AND ai_relevance_score > 0
         AND ai_summary IS NOT NULL
         AND ai_validation_failed = FALSE
         AND published_at > NOW() - INTERVAL '${SIMILARITY_WINDOW_DAYS} days'
         AND ($2::int IS NULL OR id <> $2::int)
       ORDER BY embedding <=> $1::vector
       LIMIT 1
    `,
    [v, excludeId ?? null]
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  if (row.similarity < SIMILARITY_THRESHOLD) return null;
  return {
    id: row.id,
    external_id: row.external_id,
    similarity: row.similarity,
    fingerprint: row.ai_story_fingerprint,
    ai_sources: row.ai_sources
  };
}

export async function setEmbedding(id: number, vec: number[]): Promise<void> {
  await db.query(
    `UPDATE general_news SET embedding = $1::vector WHERE id = $2`,
    [vectorLiteral(vec), id]
  );
}

/** Absorb new article into an existing primary: fold its URL into the
 *  primary's sources and mark this row as a sibling (no card emitted). */
export async function absorbAsSibling(
  newRowId: number,
  newUrl: string,
  primary: SimilarPrimary
): Promise<void> {
  const existingSources = Array.isArray(primary.ai_sources) ? primary.ai_sources : [];
  const merged = Array.from(new Set([...existingSources, newUrl]));

  await db.query(
    `UPDATE general_news
        SET ai_sources    = $1,
            ai_curated_at = NOW()
      WHERE id = $2`,
    [merged, primary.id]
  );
  await db.query(
    `UPDATE general_news
        SET ai_relevance_score = 0,
            ai_summary = NULL,
            ai_story_fingerprint = COALESCE($1, ai_story_fingerprint),
            ai_curated_at = NOW(),
            ai_validation_failed = FALSE,
            ai_last_validation_errors = NULL
      WHERE id = $2`,
    [primary.fingerprint, newRowId]
  );
}

/** Backfill embeddings for rows missing them. Returns the count actually
 *  embedded (after the OpenAI rate limit, network errors, or empty inputs). */
export async function backfillEmbeddings(maxRows: number = 200): Promise<number> {
  if (!(await isEmbeddingColumnAvailable())) return 0;
  if (!resolveOpenAIKey()) {
    console.warn("[embeddings] backfill skipped — no OpenAI key configured");
    return 0;
  }

  const r = await db.query<{ id: number; title: string; contents: string | null; ai_summary: string | null }>(
    `
      SELECT id, title, contents, ai_summary
        FROM general_news
       WHERE embedding IS NULL
       ORDER BY published_at DESC
       LIMIT $1
    `,
    [maxRows]
  );
  let count = 0;
  for (const row of r.rows) {
    // Prefer AI summary (rich, denoised) when available; fall back to raw
    // title + contents. Either way we cap at 6000 chars in embedText.
    const text = row.ai_summary
      ? `${row.title}\n\n${row.ai_summary}`
      : `${row.title}\n\n${row.contents ?? ""}`;
    const vec = await embedText(text);
    if (vec) {
      await setEmbedding(row.id, vec);
      count++;
    }
  }
  if (count > 0) {
    console.log(`[embeddings] backfilled ${count}/${r.rowCount} row(s)`);
  }
  return count;
}
