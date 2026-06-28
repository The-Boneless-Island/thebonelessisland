import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { recordAiCost } from "../usageTally.js";
import { EMBEDDING_DIM } from "../../news/embeddingDim.js";
import type { EmbeddingProvider } from "./provider.js";

// Titan Embed v2 maximum output dimension is 1024.
// When the DB column is 3072 (our current target), Titan cannot produce
// compatible vectors. We surface this as unavailable rather than silently
// storing a wrong-dim vector.
const TITAN_MAX_DIM = 1024;
const TITAN_EMBED_MODEL = "amazon.titan-embed-text-v2:0";
const TITAN_PRICE_PER_M_TOKENS = 0.02;

export class BedrockTitanEmbeddingProvider implements EmbeddingProvider {
  readonly name = "bedrock/titan";
  private client: BedrockRuntimeClient;

  constructor(region: string) {
    this.client = new BedrockRuntimeClient({ region });
  }

  async embed(text: string): Promise<number[] | null> {
    if (EMBEDDING_DIM > TITAN_MAX_DIM) {
      // Titan v2 tops out at 1024 dims; we cannot store a 3072-dim vector in
      // the current schema. Treat as unavailable so callers can fall back or
      // warn rather than corrupting the DB.
      console.warn(
        `[embeddings:bedrock] Titan v2 max dim is ${TITAN_MAX_DIM} but EMBEDDING_DIM is ${EMBEDDING_DIM}. ` +
        `Titan is incompatible with the current schema — switch to OpenAI or Gemini embeddings.`
      );
      return null;
    }
    try {
      const body = JSON.stringify({
        inputText: text,
        dimensions: EMBEDDING_DIM,
        normalize: true
      });
      const res = await this.client.send(
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
      if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIM) {
        console.warn(
          `[embeddings:bedrock] unexpected dim: expected ${EMBEDDING_DIM}, got ${vec?.length ?? "none"}`
        );
        return null;
      }
      const inputTokens = parsed.inputTextTokenCount ?? 0;
      if (inputTokens > 0) {
        recordAiCost("bedrock", TITAN_EMBED_MODEL, (inputTokens * TITAN_PRICE_PER_M_TOKENS) / 1_000_000);
      }
      return vec;
    } catch (err) {
      console.warn("[embeddings:bedrock] embed failed:", err instanceof Error ? err.message : err);
      return null;
    }
  }
}
