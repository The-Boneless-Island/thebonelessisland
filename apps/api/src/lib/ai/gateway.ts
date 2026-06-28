/**
 * Cloudflare AI Gateway configuration resolver.
 *
 * When ai_gateway_enabled == "true" in server_settings, all provider clients
 * route through the gateway base URL instead of calling the provider directly.
 * The gateway is strictly opt-in; when disabled every provider behaves exactly
 * as before this file existed.
 *
 * Base URL pattern (provider-native endpoint):
 *   https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/{slug}
 *
 * Slugs:
 *   openai          → openai
 *   gemini          → google-ai-studio
 *   anthropic       → anthropic
 *
 * Auth header (for authenticated gateways):
 *   cf-aig-authorization: Bearer <token>
 *
 * References:
 *   https://developers.cloudflare.com/ai-gateway/providers/openai/
 *   https://developers.cloudflare.com/ai-gateway/providers/google-ai-studio/
 *   https://developers.cloudflare.com/ai-gateway/providers/anthropic/
 *   https://developers.cloudflare.com/ai-gateway/configuration/authentication/
 */

import { getAISetting } from "../serverSettings.js";

const CF_GATEWAY_BASE = "https://gateway.ai.cloudflare.com/v1";

/** Known account + gateway hard-coded as defaults; overridable via settings. */
const DEFAULT_ACCOUNT_ID = "3764b4b090876b4293200d6b5d5e3e8c";
const DEFAULT_GATEWAY_ID = "boneless-news";

export type GatewaySlug = "openai" | "google-ai-studio" | "anthropic";

export interface GatewayConfig {
  /** Full base URL to pass to the provider SDK (replaces the provider's default). */
  baseURL: string;
  /**
   * Extra HTTP headers to merge into the provider client's defaultHeaders.
   * Always includes cf-aig-authorization when a token is configured.
   */
  headers: Record<string, string>;
}

/**
 * Returns gateway config for the given provider slug, or null when the gateway
 * is disabled or not configured. Callers pass the result straight to the SDK
 * constructor — if null, they omit both baseURL and the gateway header.
 *
 * This function reads live from the settings cache (safe to call per-request).
 */
export function resolveGatewayConfig(slug: GatewaySlug): GatewayConfig | null {
  const enabled = (getAISetting("ai_gateway_enabled") ?? "").toLowerCase().trim();
  if (enabled !== "true") return null;

  const accountId =
    getAISetting("ai_gateway_account_id")?.trim() || DEFAULT_ACCOUNT_ID;
  const gatewayId =
    getAISetting("ai_gateway_id")?.trim() || DEFAULT_GATEWAY_ID;
  const token = getAISetting("ai_gateway_token")?.trim() ?? "";

  const baseURL = `${CF_GATEWAY_BASE}/${accountId}/${gatewayId}/${slug}`;

  const headers: Record<string, string> = {};
  if (token) {
    // cf-aig-authorization is the correct header for provider-native endpoints
    // at gateway.ai.cloudflare.com. curl examples in the Cloudflare docs confirm
    // this name; the SDK wrapper examples show Authorization but that is a docs
    // inconsistency in the "stored keys" mode docs — we use BYOK (pass-through),
    // so the provider's own key goes via the SDK and the gateway gets its own
    // separate cf-aig-authorization token.
    headers["cf-aig-authorization"] = `Bearer ${token}`;
  }

  return { baseURL, headers };
}
