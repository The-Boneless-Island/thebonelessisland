import express from "express";
import { z } from "zod";
import { requireParentRole, requireSession } from "../lib/auth.js";
import { ensureSettingsLoaded, getAISetting, getPublicSettings, upsertSetting } from "../lib/serverSettings.js";
import { AIDisabledError, AINotConfiguredError, getAIProvider } from "../lib/ai/index.js";
import { getTodayCostUsd } from "../lib/ai/usageTally.js";

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
