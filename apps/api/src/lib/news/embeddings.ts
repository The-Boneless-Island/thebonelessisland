import { db } from "../../db/client.js";
import { getEmbeddingProvider, resolveEmbeddingProviderName } from "../ai/embeddings/index.js";
import { EMBEDDING_DIM } from "./embeddingDim.js";

// Embeddings-based clustering. Active backend: OpenAI text-embedding-3-large
// at 3072 dimensions (pgvector halfvec or vector depending on installed
// pgvector version — auto-detected once at startup).
//
// All public exports are unchanged so dependents compile without edits.

export { EMBEDDING_DIM } from "./embeddingDim.js";

const SIMILARITY_THRESHOLD = 0.85;
const SIMILARITY_WINDOW_DAYS = 14;

export type EmbeddingBackend = "bedrock" | "openai" | "gemini" | "none";

// ── Column availability + type cache ─────────────────────────────────────────

let availabilityChecked = false;
let columnAvailable = false;

/**
 * "halfvec" or "vector" — detected once after the migration lands.
 * Drives the cast used in similarity queries so the correct operator class
 * fires regardless of pgvector version.
 */
let embeddingColumnType: "halfvec" | "vector" | null = null;

/** Returns true once pgvector is installed AND the embedding column exists. */
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

/**
 * Detect whether the embedding column is `halfvec` or `vector` by querying
 * pg_attribute. Falls back to `vector` if the column is absent or the type
 * cannot be resolved. Result is cached for the process lifetime.
 */
async function resolveColumnType(): Promise<"halfvec" | "vector"> {
  if (embeddingColumnType) return embeddingColumnType;
  try {
    const r = await db.query<{ typname: string }>(
      `SELECT t.typname
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_type  t ON t.oid = a.atttypid
        WHERE c.relname = 'general_news'
          AND a.attname = 'embedding'
          AND a.attnum  > 0
          AND NOT a.attisdropped`
    );
    const typname = r.rows[0]?.typname ?? "vector";
    embeddingColumnType = typname === "halfvec" ? "halfvec" : "vector";
  } catch {
    embeddingColumnType = "vector";
  }
  return embeddingColumnType;
}

/**
 * Returns the SQL cast expression for a vector literal, e.g. `$1::halfvec`
 * or `$1::vector`, so the correct cosine `<=>` operator class is resolved.
 * Exported so sibling query files (newsSearch.ts) can use the same cast.
 */
export async function getEmbeddingCast(paramNum: number = 1): Promise<string> {
  const colType = await resolveColumnType();
  return `$${paramNum}::${colType}`;
}

/** @internal — alias used within this file for readability */
async function vectorCast(paramNum: number = 1): Promise<string> {
  return getEmbeddingCast(paramNum);
}

// ── Backend resolver (admin health UI) ───────────────────────────────────────

/**
 * Which embedding backend would be used right now.
 * Preserved for the admin health UI; now delegates to the provider factory.
 *
 * Returns "openai" | "gemini" | "bedrock" | "none" — the first segment of
 * the provider name. Callers that type-check against EmbeddingBackend will
 * work as before for "bedrock"/"openai"/"none"; "gemini" is a new value.
 */
export function resolveEmbeddingBackend(): EmbeddingBackend {
  const name = resolveEmbeddingProviderName();
  if (name.startsWith("openai")) return "openai";
  if (name.startsWith("bedrock")) return "bedrock";
  if (name.startsWith("gemini")) return "gemini";
  return "none";
}

// ── Core embedding call ───────────────────────────────────────────────────────

/** pgvector literal — `[0.1, 0.2, ...]` (no cast; cast is applied per-query). */
function vectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/** Embed a piece of text. Returns null when no backend is configured or input is empty. */
export async function embedText(text: string): Promise<number[] | null> {
  const trimmed = (text ?? "").slice(0, 6000).trim();
  if (trimmed.length < 8) return null;

  const provider = getEmbeddingProvider();
  if (!provider) return null;

  const vec = await provider.embed(trimmed);
  // Provider implementations already validate length; double-check here.
  if (!vec || vec.length !== EMBEDDING_DIM) return null;
  return vec;
}

// ── Similarity query ──────────────────────────────────────────────────────────

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
  const cast = await vectorCast(1);

  const r = await db.query<{
    id: number;
    external_id: string;
    similarity: number;
    ai_story_fingerprint: string | null;
    ai_sources: string[] | null;
  }>(
    `
      SELECT id, external_id, ai_story_fingerprint, ai_sources,
             1 - (embedding <=> ${cast}) AS similarity
        FROM general_news
       WHERE embedding IS NOT NULL
         AND ai_curated_at IS NOT NULL
         AND ai_relevance_score > 0
         AND ai_summary IS NOT NULL
         AND ai_validation_failed = FALSE
         AND published_at > NOW() - INTERVAL '${SIMILARITY_WINDOW_DAYS} days'
         AND ($2::int IS NULL OR id <> $2::int)
       ORDER BY embedding <=> ${cast}
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

// ── Persistence helpers ───────────────────────────────────────────────────────

export async function setEmbedding(id: number, vec: number[]): Promise<void> {
  const cast = await vectorCast(1);
  await db.query(
    `UPDATE general_news SET embedding = ${cast} WHERE id = $2`,
    [vectorLiteral(vec), id]
  );
}

/** Placeholder for rows with no embeddable text — keeps backfill from stalling on NULL. */
function skippedEmbeddingVector(): number[] {
  const v = new Array(EMBEDDING_DIM).fill(0);
  v[0] = 1;
  return v;
}

function buildEmbedInput(title: string, contents: string | null, aiSummary: string | null): string {
  if (aiSummary?.trim()) return `${title}\n\n${aiSummary}`;
  const body = (contents ?? "").trim();
  if (body.length > 0) return `${title}\n\n${body}`;
  const t = (title ?? "").trim();
  if (t.length >= 8) return t;
  return `${t || "gaming news"} — article`;
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

export type EmbedClusterResult = { embedded: number; absorbed: number; remaining: number };

export type BackfillEmbeddingsResult = { embedded: number; skipped: number };

/** Backfill embeddings for rows missing them. Always marks a row handled (embed or skip sentinel). */
export async function backfillEmbeddings(maxRows: number = 200): Promise<BackfillEmbeddingsResult> {
  if (!(await isEmbeddingColumnAvailable())) return { embedded: 0, skipped: 0 };
  if (resolveEmbeddingBackend() === "none") {
    console.warn("[embeddings] backfill skipped — no embedding backend configured (enable AI + configure embedding model)");
    return { embedded: 0, skipped: 0 };
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
  let embedded = 0;
  let skipped = 0;
  for (const row of r.rows) {
    const text = buildEmbedInput(row.title, row.contents, row.ai_summary);
    let vec = await embedText(text);
    if (!vec) {
      vec = await embedText(buildEmbedInput(row.title || "News", row.contents, null));
    }
    if (vec) {
      await setEmbedding(row.id, vec);
      embedded++;
    } else {
      await setEmbedding(row.id, skippedEmbeddingVector());
      skipped++;
      console.warn(`[embeddings] backfill skip sentinel for row=${row.id} (embed failed)`);
    }
  }
  if (embedded > 0 || skipped > 0) {
    console.log(
      `[embeddings] backfilled ${embedded}/${r.rowCount} row(s), ${skipped} skip sentinel via ${resolveEmbeddingProviderName()}`
    );
  }
  return { embedded, skipped };
}

/** Count rows still missing embeddings (for admin health). */
export async function countMissingEmbeddings(): Promise<number> {
  if (!(await isEmbeddingColumnAvailable())) return 0;
  const r = await db.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM general_news WHERE embedding IS NULL`
  );
  return parseInt(r.rows[0]?.c ?? "0", 10);
}
