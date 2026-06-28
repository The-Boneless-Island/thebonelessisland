/**
 * Embedding provider factory — mirrors the AIProvider factory in ai/index.ts.
 *
 * Selection logic:
 *   1. Read `ai_embedding_model` from server_settings.
 *   2. Derive the backend from the model id prefix:
 *        text-embedding-*          → OpenAI
 *        gemini-embedding-*        → Gemini
 *        amazon.titan-embed-*      → Bedrock Titan
 *   3. If `ai_embedding_model` is not set, default to `text-embedding-3-large`
 *      (OpenAI) provided an OpenAI key is available.
 *   4. If no matching key is found, returns null (caller treats as "none").
 *
 * API key resolution order (same as ai/index.ts for each provider):
 *   OpenAI  : openai_api_key → ai_api_key (legacy) → OPENAI_API_KEY env
 *   Gemini  : gemini_api_key → ai_api_key (legacy) → GEMINI_API_KEY env
 *   Bedrock : AWS credential chain (no key needed); bedrock_region setting
 */

import { env } from "../../../config.js";
import { getAISetting } from "../../serverSettings.js";
import { BedrockTitanEmbeddingProvider } from "./bedrock.js";
import { GeminiEmbeddingProvider } from "./gemini.js";
import { OpenAIEmbeddingProvider } from "./openai.js";
import type { EmbeddingProvider } from "./provider.js";

export type { EmbeddingProvider } from "./provider.js";

/** Default embedding model when `ai_embedding_model` is not configured. */
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-large";

function resolveOpenAIKey(): string | null {
  const key = (
    getAISetting("openai_api_key") ||
    getAISetting("ai_api_key") ||
    env.OPENAI_API_KEY ||
    ""
  ).trim();
  return key.length > 0 ? key : null;
}

function resolveGeminiKey(): string | null {
  const key = (
    getAISetting("gemini_api_key") ||
    getAISetting("ai_api_key") ||
    env.GEMINI_API_KEY ||
    ""
  ).trim();
  return key.length > 0 ? key : null;
}

function resolveBedrockRegion(): string {
  return getAISetting("bedrock_region") || process.env.AWS_REGION || "us-east-1";
}

/**
 * Returns an EmbeddingProvider for the active model setting, or null when
 * no usable provider can be constructed (missing key, unknown model id, AI
 * disabled). Never throws.
 */
export function getEmbeddingProvider(): EmbeddingProvider | null {
  if (getAISetting("ai_enabled") !== "true") return null;

  const model = (
    getAISetting("ai_embedding_model") || DEFAULT_EMBEDDING_MODEL
  ).trim();

  // OpenAI: text-embedding-3-large, text-embedding-3-small, text-embedding-ada-002
  if (model.startsWith("text-embedding-")) {
    const key = resolveOpenAIKey();
    if (!key) return null;
    return new OpenAIEmbeddingProvider(key, model);
  }

  // Gemini: gemini-embedding-001 and future gemini-embedding-* models
  if (model.startsWith("gemini-embedding-")) {
    const key = resolveGeminiKey();
    if (!key) return null;
    return new GeminiEmbeddingProvider(key, model);
  }

  // Bedrock Titan: amazon.titan-embed-text-v2:0 (and future titan variants)
  if (model.startsWith("amazon.titan-embed-")) {
    return new BedrockTitanEmbeddingProvider(resolveBedrockRegion());
  }

  console.warn(`[embeddings] unknown embedding model "${model}" — no provider constructed`);
  return null;
}

/**
 * Returns the active embedding backend name for the admin health UI.
 * Mirrors resolveEmbeddingBackend() semantics but drives off the model id.
 */
export function resolveEmbeddingProviderName(): string {
  const provider = getEmbeddingProvider();
  return provider?.name ?? "none";
}
