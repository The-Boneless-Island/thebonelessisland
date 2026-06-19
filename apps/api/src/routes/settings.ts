import express from "express";
import { z } from "zod";
import { requireParentRole, requireSession } from "../lib/auth.js";
import { ensureSettingsLoaded, getAISetting, getPublicSettings, upsertSetting } from "../lib/serverSettings.js";
import { AIDisabledError, AINotConfiguredError, getAIProvider } from "../lib/ai/index.js";
import { getTodayCostUsd } from "../lib/ai/usageTally.js";
import { env } from "../config.js";

export const settingsRouter = express.Router();

settingsRouter.get("/", requireSession, requireParentRole, async (_req, res) => {
  await ensureSettingsLoaded();
  res.json({ settings: getPublicSettings() });
});

const patchSchema = z.object({
  key: z.string().min(1),
  value: z.string()
});

settingsRouter.patch("/", requireSession, requireParentRole, async (req, res) => {
  const { key, value } = patchSchema.parse(req.body);
  const discordUserId = String(res.locals.userId);
  await upsertSetting(key, value, discordUserId);
  // Return the full updated settings so the client can refresh in one round-trip
  res.json({ ok: true, settings: getPublicSettings() });
});

const aiTestSchema = z.object({
  provider: z.string().min(1),
  model: z.string().optional(),
  apiKey: z.string().optional()
});

/**
 * GET /settings/ai-cost-today
 * Returns today's persisted AI spend + call count and the configured warn
 * threshold. UI uses this for a small chip + (when over) a banner.
 */
settingsRouter.get("/ai-cost-today", requireSession, requireParentRole, async (_req, res) => {
  const today = await getTodayCostUsd();
  const rawThreshold = getAISetting("ai_daily_cost_warn_usd") ?? "5";
  const threshold = parseFloat(rawThreshold);
  const safeThreshold = Number.isFinite(threshold) && threshold >= 0 ? threshold : 5;
  res.json({
    today: today.usd,
    calls: today.calls,
    threshold: safeThreshold,
    overThreshold: safeThreshold > 0 && today.usd >= safeThreshold
  });
});

interface AIModelOption {
  id: string;
  label: string;
}

/**
 * GET /settings/ai-models
 * Lists the models available for a provider so the Admin UI can render a live
 * dropdown instead of a free-text field. The provider comes from ?provider
 * (anthropic|openai|gemini|bedrock) or falls back to the current ai_provider
 * setting. This NEVER 4xx/5xx: on any failure it returns 200 with models: []
 * and a short error string so the UI degrades to the Custom-id input.
 */
settingsRouter.get("/ai-models", requireSession, requireParentRole, async (req, res) => {
  const provider = ((req.query.provider as string) || getAISetting("ai_provider") || "").toLowerCase();

  let models: AIModelOption[] = [];
  let error: string | undefined;

  try {
    switch (provider) {
      case "bedrock": {
        const { BedrockClient, ListInferenceProfilesCommand } = await import("@aws-sdk/client-bedrock");
        const region = getAISetting("bedrock_region") || process.env.AWS_REGION || "us-east-1";
        const client = new BedrockClient({ region });
        const collected: AIModelOption[] = [];
        let nextToken: string | undefined;
        do {
          const out = await client.send(
            new ListInferenceProfilesCommand({ maxResults: 100, nextToken })
          );
          for (const s of out.inferenceProfileSummaries ?? []) {
            const id = s.inferenceProfileId;
            if (!id) continue;
            collected.push({ id, label: `${s.inferenceProfileName ?? id} (${id})` });
          }
          nextToken = out.nextToken;
        } while (nextToken && collected.length < 200);
        collected.sort((a, b) => a.label.localeCompare(b.label));
        models = collected;
        break;
      }
      case "anthropic": {
        const apiKey =
          getAISetting("anthropic_api_key") || getAISetting("ai_api_key") || env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          error = "no anthropic key";
          break;
        }
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const list = await new Anthropic({ apiKey }).models.list();
        models = list.data.map((m) => ({ id: m.id, label: m.display_name ?? m.id }));
        break;
      }
      case "openai": {
        const apiKey =
          getAISetting("openai_api_key") || getAISetting("ai_api_key") || env.OPENAI_API_KEY;
        if (!apiKey) {
          error = "no openai key";
          break;
        }
        const { default: OpenAI } = await import("openai");
        const list = await new OpenAI({ apiKey }).models.list();
        models = list.data
          .filter((m) => m.id.startsWith("gpt"))
          .map((m) => ({ id: m.id, label: m.id }));
        break;
      }
      case "gemini": {
        // Listing models via @google/genai is not reliable across SDK versions,
        // and the gemini ids are public — return a small static set rather than
        // failing. (No key required to know these ids.)
        models = [
          { id: "gemini-2.5-flash-lite", label: "gemini-2.5-flash-lite" },
          { id: "gemini-2.5-flash", label: "gemini-2.5-flash" },
          { id: "gemini-2.5-pro", label: "gemini-2.5-pro" }
        ];
        break;
      }
      default: {
        error = provider ? `unknown provider "${provider}"` : "no provider selected";
        break;
      }
    }
  } catch (err) {
    models = [];
    error = err instanceof Error ? err.message : "Unknown error";
  }

  res.json({ provider, models, ...(error ? { error } : {}) });
});

settingsRouter.post("/ai/test", requireSession, requireParentRole, async (req, res) => {
  const { provider, model, apiKey } = aiTestSchema.parse(req.body);

  try {
    const ai = getAIProvider({ provider, model, apiKey });
    const result = await ai.complete([
      { role: "user", content: "Reply with exactly: ok" }
    ], { maxTokens: 10 });

    res.json({ ok: true, provider: result.provider, model: result.model, response: result.text.trim() });
  } catch (err) {
    if (err instanceof AIDisabledError || err instanceof AINotConfiguredError) {
      res.status(400).json({ ok: false, error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ ok: false, error: `Provider error: ${message}` });
  }
});
