import { GoogleGenAI } from "@google/genai";
import { resolveGatewayConfig } from "../gateway.js";
import { recordAiCost } from "../usageTally.js";
import { EMBEDDING_DIM } from "../../news/embeddingDim.js";
import type { EmbeddingProvider } from "./provider.js";

// Published price for gemini-embedding-001: $0.00 for <= 2k req/min in free
// tier; $0.10/M tokens in paid tier. Approximate — check Google pricing page.
const GEMINI_EMBED_PRICE_PER_M = 0.10;

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  private client: GoogleGenAI;
  private model: string;

  constructor(apiKey: string, model: string = "gemini-embedding-001") {
    this.name = `gemini/${model}`;
    const gateway = resolveGatewayConfig("google-ai-studio");
    this.client = new GoogleGenAI({
      apiKey,
      ...(gateway
        ? {
            httpOptions: {
              baseUrl: gateway.baseURL,
              ...(Object.keys(gateway.headers).length > 0
                ? { headers: gateway.headers }
                : {})
            }
          }
        : {})
    });
    this.model = model;
  }

  async embed(text: string): Promise<number[] | null> {
    try {
      const result = await this.client.models.embedContent({
        model: this.model,
        contents: text,
        config: {
          // outputDimensionality truncates via Matryoshka representation
          // learning so the semantic quality is preserved at lower dims.
          outputDimensionality: EMBEDDING_DIM
        }
      });

      const vec = result.embeddings?.[0]?.values;
      if (!vec || vec.length !== EMBEDDING_DIM) {
        console.warn(
          `[embeddings:gemini] unexpected dim: expected ${EMBEDDING_DIM}, got ${vec?.length ?? "none"}`
        );
        return null;
      }
      // Gemini embedding API doesn't expose token counts on every response;
      // estimate from text length (rough heuristic: ~4 chars/token).
      const estimatedTokens = Math.ceil(text.length / 4);
      if (estimatedTokens > 0) {
        recordAiCost("gemini", this.model, (estimatedTokens * GEMINI_EMBED_PRICE_PER_M) / 1_000_000);
      }
      return vec;
    } catch (err) {
      console.warn("[embeddings:gemini] embed failed:", err instanceof Error ? err.message : err);
      return null;
    }
  }
}
