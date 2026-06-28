import { env } from "../../config.js";
import { getAISetting } from "../serverSettings.js";
import { AIDisabledError, AINotConfiguredError, AIProvider } from "./provider.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { BedrockProvider } from "./providers/bedrock.js";
import { GeminiProvider } from "./providers/gemini.js";
import { OpenAIProvider } from "./providers/openai.js";

// Re-export for consumers that only need the interface/errors
export type { AIMessage, AIProvider, AIResult } from "./provider.js";
export { AIDisabledError, AINotConfiguredError } from "./provider.js";

type SupportedProvider = "anthropic" | "openai" | "gemini" | "bedrock";

export const PROVIDER_DEFAULTS: Record<SupportedProvider, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
  // Flash Lite is ~30× cheaper than Sonnet and sufficient for structured JSON
  // curation work — set as the default for fresh installs that pick Gemini.
  gemini: "gemini-2.5-flash-lite",
  // Bedrock Claude must be invoked via a cross-region inference profile, not the
  // bare on-demand id. This default makes the blank-model case work; admins can
  // still override with any Bedrock model/profile id (incl. Nova).
  bedrock: "global.anthropic.claude-haiku-4-5-20251001-v1:0"
};

export const SUPPORTED_PROVIDERS: SupportedProvider[] = ["anthropic", "openai", "gemini", "bedrock"];

/** Workload-specific routing for all providers. */
export type AITask = "default" | "curation" | "chat" | "light";

// ── Provider-agnostic task routing ───────────────────────────────────────────

/**
 * DB setting keys for provider-agnostic task model overrides.
 * These work for any provider (gemini, openai, anthropic, bedrock).
 * Values should be a bare model id understood by the active provider.
 */
const TASK_SETTING_KEYS: Record<Exclude<AITask, "default">, string> = {
  curation: "ai_model_curation",
  chat: "ai_model_chat",
  light: "ai_model_light"
};

/**
 * Per-provider task model defaults.
 * Used when no per-task override is set in server_settings.
 * Bedrock defaults favour Claude for curation and Nova for chat/light.
 * Gemini defaults favour Flash for curation and Flash-Lite for cheap tasks.
 */
const PROVIDER_TASK_DEFAULTS: Partial<Record<SupportedProvider, Record<Exclude<AITask, "default">, string>>> = {
  gemini: {
    curation: "gemini-2.5-flash",
    chat: "gemini-2.5-flash-lite",
    light: "gemini-2.5-flash-lite"
  }
};

// ── Bedrock back-compat ───────────────────────────────────────────────────────
// The legacy bedrock_model_* keys still work when ai_provider is bedrock.
// New installs should use the provider-agnostic ai_model_* keys instead.

const BEDROCK_TASK_SETTING_KEYS: Record<Exclude<AITask, "default">, string> = {
  curation: "bedrock_model_curation",
  chat: "bedrock_model_chat",
  light: "bedrock_model_light"
};

/** Sensible Bedrock defaults per task — curation gets Claude, chat/light get Nova. */
export const BEDROCK_TASK_DEFAULTS: Record<Exclude<AITask, "default">, string> = {
  curation: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
  chat: "global.amazon.nova-2-lite-v1:0",
  light: "global.amazon.nova-2-lite-v1:0"
};

/**
 * Resolve the model id for a task and the active provider.
 *
 * Resolution order:
 *   1. Provider-agnostic override: ai_model_curation / ai_model_chat / ai_model_light
 *   2. Bedrock legacy override (bedrock only): bedrock_model_curation / …_chat / …_light
 *   3. Provider-specific task default (PROVIDER_TASK_DEFAULTS)
 *   4. undefined → caller uses getAIProvider default (ai_model setting or PROVIDER_DEFAULTS)
 *
 * Returns undefined for task=="default" (no routing needed).
 */
export function resolveModelForTask(task: AITask = "default"): string | undefined {
  if (task === "default") return undefined;

  // 1. Provider-agnostic setting (works for any provider)
  const agnosticKey = TASK_SETTING_KEYS[task];
  const agnosticModel = getAISetting(agnosticKey)?.trim();
  if (agnosticModel) return agnosticModel;

  const provider = (getAISetting("ai_provider") ?? "").toLowerCase() as SupportedProvider;

  // 2. Bedrock back-compat: bedrock_model_* legacy keys
  if (provider === "bedrock") {
    const legacyKey = BEDROCK_TASK_SETTING_KEYS[task];
    const legacyModel = getAISetting(legacyKey)?.trim();
    if (legacyModel) return legacyModel;
    return BEDROCK_TASK_DEFAULTS[task];
  }

  // 3. Provider-specific task default
  const providerDefaults = PROVIDER_TASK_DEFAULTS[provider];
  if (providerDefaults) return providerDefaults[task];

  // 4. No per-task override — fall through to the ai_model / PROVIDER_DEFAULTS
  return undefined;
}

/**
 * Returns a ready-to-use AIProvider based on the current server_settings.
 * Settings are read from the in-memory cache (populated at startup and after
 * every admin write), so this is safe to call in any request handler.
 *
 * Priority for API key: DB ai_api_key → env var fallback
 *
 * Pass `overrides` to bypass DB settings (used by the Admin test endpoint).
 *
 * Throws AIDisabledError  when ai_enabled != "true" (unless overrides.provider is set)
 * Throws AINotConfiguredError when provider or key are missing
 */
export function getAIProvider(overrides?: {
  provider?: string;
  model?: string;
  apiKey?: string;
}): AIProvider {
  const usingOverride = Boolean(overrides?.provider);

  if (!usingOverride) {
    const enabled = getAISetting("ai_enabled") ?? "false";
    if (enabled !== "true") {
      throw new AIDisabledError();
    }
  }

  const providerName = (
    (overrides?.provider ?? getAISetting("ai_provider") ?? "") as SupportedProvider
  ).toLowerCase() as SupportedProvider;

  if (!providerName) {
    throw new AINotConfiguredError("no provider selected");
  }

  if (!SUPPORTED_PROVIDERS.includes(providerName)) {
    throw new AINotConfiguredError(`unknown provider "${providerName}"`);
  }

  // Bedrock authenticates via the AWS credential chain (the EC2 instance role),
  // so it has no API key. Resolve it before the key lookup/requirement below.
  if (providerName === "bedrock") {
    const region = getAISetting("bedrock_region") || process.env.AWS_REGION || "us-east-1";
    const bedrockModel = overrides?.model ?? getAISetting("ai_model") ?? PROVIDER_DEFAULTS.bedrock;
    return new BedrockProvider(region, bedrockModel || PROVIDER_DEFAULTS.bedrock);
  }

  const model =
    overrides?.model ??
    getAISetting("ai_model") ??
    PROVIDER_DEFAULTS[providerName] ??
    "";

  // Resolution order: explicit override → per-provider DB key → legacy
  // shared ai_api_key → env var. Lets the admin keep separate keys per
  // provider but stays backwards-compatible with the old single-key install.
  const perProviderKey =
    providerName === "anthropic"
      ? getAISetting("anthropic_api_key") ?? ""
      : providerName === "openai"
        ? getAISetting("openai_api_key") ?? ""
        : providerName === "gemini"
          ? getAISetting("gemini_api_key") ?? ""
          : "";
  const legacyKey = getAISetting("ai_api_key") ?? "";
  const envFallback =
    providerName === "anthropic"
      ? env.ANTHROPIC_API_KEY
      : providerName === "gemini"
        ? env.GEMINI_API_KEY
        : env.OPENAI_API_KEY;
  const apiKey = overrides?.apiKey ?? (perProviderKey || legacyKey || envFallback);

  if (!apiKey) {
    throw new AINotConfiguredError(`no API key set for provider "${providerName}"`);
  }

  switch (providerName) {
    case "anthropic":
      return new AnthropicProvider(apiKey, model || PROVIDER_DEFAULTS.anthropic);
    case "openai":
      return new OpenAIProvider(apiKey, model || PROVIDER_DEFAULTS.openai);
    case "gemini":
      return new GeminiProvider(apiKey, model || PROVIDER_DEFAULTS.gemini);
    default:
      throw new AINotConfiguredError(`unknown provider "${providerName}"`);
  }
}

/** Task-aware provider — on Bedrock, curation/chat/light can use different model ids. */
export function getAIProviderForTask(
  task: AITask = "default",
  overrides?: { provider?: string; model?: string; apiKey?: string }
): AIProvider {
  const taskModel = overrides?.model ?? resolveModelForTask(task);
  if (taskModel) {
    return getAIProvider({ ...overrides, model: taskModel });
  }
  return getAIProvider(overrides);
}
