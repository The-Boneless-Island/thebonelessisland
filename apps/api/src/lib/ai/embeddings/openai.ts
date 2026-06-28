import OpenAI from "openai";
import { resolveGatewayConfig } from "../gateway.js";
import { recordAiCost } from "../usageTally.js";
import { EMBEDDING_DIM } from "../../news/embeddingDim.js";
import type { EmbeddingProvider } from "./provider.js";

// Published per-million-token prices ($USD) for the OpenAI embedding models.
// 3-large is ~$0.13/M tokens; 3-small is ~$0.02/M tokens.
const OPENAI_EMBED_PRICING: Record<string, number> = {
  "text-embedding-3-large": 0.13,
  "text-embedding-3-small": 0.02,
  "text-embedding-ada-002": 0.10
};

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = "text-embedding-3-large") {
    this.name = `openai/${model}`;
    const gateway = resolveGatewayConfig("openai");
    this.client = new OpenAI({
      apiKey,
      ...(gateway ? { baseURL: gateway.baseURL } : {}),
      ...(gateway && Object.keys(gateway.headers).length > 0
        ? { defaultHeaders: gateway.headers }
        : {})
    });
    this.model = model;
  }

  async embed(text: string): Promise<number[] | null> {
    try {
      const resp = await this.client.embeddings.create({
        model: this.model,
        input: text,
        // Pass `dimensions` so both 3-large (native 3072) and 3-small
        // (truncated to 3072 via the API's Matryoshka param) emit exactly
        // EMBEDDING_DIM dimensions. Ada-002 doesn't support `dimensions`
        // but it maxes at 1536 which will fail the length check below and
        // return null — providing a clean signal to pick a different model.
        dimensions: EMBEDDING_DIM
      });
      const vec = resp.data[0]?.embedding;
      if (!vec || vec.length !== EMBEDDING_DIM) {
        console.warn(
          `[embeddings:openai] unexpected dim: expected ${EMBEDDING_DIM}, got ${vec?.length ?? "none"}`
        );
        return null;
      }
      const promptTokens = resp.usage?.prompt_tokens ?? 0;
      if (promptTokens > 0) {
        const pricePerM = OPENAI_EMBED_PRICING[this.model] ?? 0.13;
        recordAiCost("openai", this.model, (promptTokens * pricePerM) / 1_000_000);
      }
      return vec;
    } catch (err) {
      console.warn("[embeddings:openai] embed failed:", err instanceof Error ? err.message : err);
      return null;
    }
  }
}
