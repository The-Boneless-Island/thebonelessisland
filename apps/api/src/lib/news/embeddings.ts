import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import OpenAI from "openai";
import { env } from "../../config.js";
import { db } from "../../db/client.js";
import { recordAiCost } from "../ai/usageTally.js";
import { getAISetting } from "../serverSettings.js";

// Embeddings-based clustering. Default: Amazon Titan Embed v2 on Bedrock (1024-dim)
// when ai_provider is bedrock. Falls back to OpenAI text-embedding-3-small when an
// OpenAI key is configured. Stored in general_news.embedding (pgvector).

export const EMBEDDING_DIM = 1024;
const TITAN_EMBED_MODEL = "amazon.titan-embed-text-v2:0";
const OPENAI_EMBED_MODEL = "text-embedding-3-small";
const TITAN_PRICE_PER_M_TOKENS = 0.02;
const OPENAI_PRICE_PER_M_TOKENS = 0.02;
const SIMILARITY_THRESHOLD = 0.85;
const SIMILARITY_WINDOW_DAYS = 14;

export type EmbeddingBackend = "bedrock" | "openai" | "none";

let availabilityChecked = false;
let columnAvailable = false;

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

function resolveOpenAIKey(): string | null {
  const fromOpenAI = getAISetting("openai_api_key");
  const legacy = getAISetting("ai_api_key");
  const key = (fromOpenAI || legacy || env.OPENAI_API_KEY || "").trim();
  return key.length > 0 ? key : null;
}

function bedrockRegion(): string {
  return getAISetting("bedrock_region") || process.env.AWS_REGION || "us-east-1";
}

/** Which embedding backend would be used right now (for admin health UI). */
export function resolveEmbeddingBackend(): EmbeddingBackend {
  if (getAISetting("ai_enabled") !== "true") return "none";
  const chatProvider = (getAISetting("ai_provider") ?? "").toLowerCase();
  if (chatProvider === "bedrock") return "bedrock";
  if (resolveOpenAIKey()) return "openai";
  return "none";
}

let openaiClient: OpenAI | null = null;
let openaiKey: string | null = null;
function getOpenAIClient(): OpenAI | null {
  const key = resolveOpenAIKey();
  if (!key) return null;
  if (openaiClient && openaiKey === key) return openaiClient;
  openaiClient = new OpenAI({ apiKey: key });
  openaiKey = key;
  return openaiClient;
}

let bedrockClient: BedrockRuntimeClient | null = null;
let bedrockClientRegion: string | null = null;
function getBedrockClient(): BedrockRuntimeClient {
  const region = bedrockRegion();
  if (bedrockClient && bedrockClientRegion === region) return bedrockClient;
  bedrockClient = new BedrockRuntimeClient({ region });
  bedrockClientRegion = region;
  return bedrockClient;
}

async function embedViaBedrock(text: string): Promise<number[] | null> {
  try {
    const client = getBedrockClient();
    const body = JSON.stringify({
      inputText: text,
      dimensions: EMBEDDING_DIM,
      normalize: true
    });
    const res = await client.send(
      new InvokeModelCommand({
        modelId: TITAN_EMBED_MODEL,
        contentType: "application/json",
        accept: "application/json",
        body: new TextEncoder().encode(body)
      })
    );
    const parsed = JSON.parse(new TextDecoder().decode(res.body)) as {
      embedding?: number[];
      inputTextTokenCount?: number;
    };
    const vec = parsed.embedding;
    if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIM) return null;
    const inputTokens = parsed.inputTextTokenCount ?? 0;
    if (inputTokens > 0) {
      recordAiCost("bedrock", TITAN_EMBED_MODEL, (inputTokens * TITAN_PRICE_PER_M_TOKENS) / 1_000_000);
    }
    return vec;
  } catch (err) {
    console.warn("[embeddings] bedrock embed failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function embedViaOpenAI(text: string): Promise<number[] | null> {
  const client = getOpenAIClient();
  if (!client) return null;
  try {
    const resp = await client.embeddings.create({
      model: OPENAI_EMBED_MODEL,
      input: text,
      dimensions: EMBEDDING_DIM
    });
    const vec = resp.data[0]?.embedding;
    if (!vec || vec.length !== EMBEDDING_DIM) return null;
    const promptTokens = resp.usage?.prompt_tokens ?? 0;
    if (promptTokens > 0) {
      recordAiCost("openai", OPENAI_EMBED_MODEL, (promptTokens * OPENAI_PRICE_PER_M_TOKENS) / 1_000_000);
    }
    return vec;
  } catch (err) {
    console.warn("[embeddings] openai embed failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Embed a piece of text. Returns null when no backend is configured or input is empty. */
export async function embedText(text: string): Promise<number[] | null> {
  const trimmed = (text ?? "").slice(0, 6000).trim();
  if (trimmed.length < 8) return null;

  const backend = resolveEmbeddingBackend();
  if (backend === "bedrock") return embedViaBedrock(trimmed);
  if (backend === "openai") return embedViaOpenAI(trimmed);
  return null;
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
    console.warn("[embeddings] backfill skipped — no embedding backend configured (enable AI + Bedrock or OpenAI key)");
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
      `[embeddings] backfilled ${embedded}/${r.rowCount} row(s), ${skipped} skip sentinel via ${resolveEmbeddingBackend()}`
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
