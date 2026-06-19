import { Router } from "express";
import { db } from "../db/client.js";
import { requireBotSecret } from "../lib/auth.js";
import { recordEvent } from "../lib/activityEvents.js";
import { getAIProvider, PROVIDER_DEFAULTS } from "../lib/ai/index.js";
import { getNuggiePersona, buildSystemPrompt } from "../lib/persona/nuggie.js";
import { getAISetting } from "../lib/serverSettings.js";

export const internalRouter = Router();

/**
 * GET /internal/bot/announcements/pending
 * Bot-only. Returns up to 50 unprocessed bot_announcements rows. Bot polls
 * this every 30s to drive milestone announcements + role assignment.
 */
internalRouter.get(
  "/bot/announcements/pending",
  requireBotSecret,
  async (_req, res) => {
    try {
      const r = await db.query<{ id: string; kind: string; payload: Record<string, unknown>; created_at: string }>(
        `SELECT id, kind, payload, created_at
         FROM bot_announcements
         WHERE processed_at IS NULL
         ORDER BY created_at ASC
         LIMIT 50`
      );
      res.json({
        announcements: r.rows.map((row) => ({
          id: parseInt(row.id, 10),
          kind: row.kind,
          payload: row.payload,
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      console.error("[internal] GET /bot/announcements/pending error:", err);
      res.status(500).json({ error: "Failed to load pending announcements" });
    }
  }
);

/**
 * POST /internal/bot/announcements/:id/processed
 * Bot-only. Marks an announcement as processed so it isn't re-served.
 */
internalRouter.post(
  "/bot/announcements/:id/processed",
  requireBotSecret,
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      await db.query(
        "UPDATE bot_announcements SET processed_at = NOW() WHERE id = $1 AND processed_at IS NULL",
        [id]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error("[internal] POST /bot/announcements/:id/processed error:", err);
      res.status(500).json({ error: "Failed to mark processed" });
    }
  }
);

/**
 * GET /internal/settings/:key
 * Bot-only. Returns a single server_settings value. Used by the bot's
 * milestone announcer to read channel + role IDs without exposing the full
 * settings table.
 */
internalRouter.get(
  "/settings/:key",
  requireBotSecret,
  async (req, res) => {
    try {
      const key = String(req.params.key);
      const r = await db.query<{ value: string }>(
        "SELECT value FROM server_settings WHERE key = $1",
        [key]
      );
      res.json({ key, value: r.rows[0]?.value ?? "" });
    } catch (err) {
      console.error("[internal] GET /settings/:key error:", err);
      res.status(500).json({ error: "Failed to load setting" });
    }
  }
);

/**
 * POST /internal/bot/nuggie-chat
 * Bot-only. Single-turn Nuggie chat for the /nuggie ask Discord slash command.
 * Uses the persona from server_settings + buildSystemPrompt(..., 'discord-slash').
 * Forces the cheapest model for the configured provider regardless of the
 * admin's web-chat default, to keep Discord usage cheap.
 * Per-user sliding-window rate limit: max 10 calls per 60 min.
 */
const nuggieAskRateLimit = new Map<string, number[]>();
const NUGGIE_ASK_WINDOW_MS = 60 * 60 * 1000;
const NUGGIE_ASK_MAX = 10;

function checkNuggieAskRate(discordUserId: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const recent = (nuggieAskRateLimit.get(discordUserId) ?? []).filter(
    (t) => now - t < NUGGIE_ASK_WINDOW_MS
  );
  if (recent.length >= NUGGIE_ASK_MAX) {
    const oldest = recent[0];
    const retryAfterSec = Math.ceil((NUGGIE_ASK_WINDOW_MS - (now - oldest)) / 1000);
    return { allowed: false, retryAfterSec };
  }
  recent.push(now);
  nuggieAskRateLimit.set(discordUserId, recent);
  return { allowed: true, retryAfterSec: 0 };
}

internalRouter.post(
  "/bot/nuggie-chat",
  requireBotSecret,
  async (req, res) => {
    try {
      const body = req.body ?? {};
      const question = typeof body.question === "string" ? body.question.trim() : "";
      const discordUserId = typeof body.discordUserId === "string" ? body.discordUserId : "";
      const discordDisplayName =
        typeof body.discordDisplayName === "string" ? body.discordDisplayName : "";
      if (!question || !discordUserId) {
        res.status(400).json({ error: "Missing question or discordUserId" });
        return;
      }
      if (question.length > 500) {
        res.status(400).json({ error: "Question too long (500 char max)" });
        return;
      }

      const rate = checkNuggieAskRate(discordUserId);
      if (!rate.allowed) {
        res.status(429).json({
          error: `Rate limit: ${NUGGIE_ASK_MAX}/hour. Try again in ${Math.ceil(rate.retryAfterSec / 60)} min.`,
        });
        return;
      }

      // Pick cheapest model for whichever provider the admin chose. Override
      // only the model so the API key + provider come from the admin's
      // configured AI settings (don't bypass ai_enabled gate).
      const providerName = (getAISetting("ai_provider") ?? "").toLowerCase();
      const cheapModel = PROVIDER_DEFAULTS[providerName as keyof typeof PROVIDER_DEFAULTS];

      let ai;
      try {
        ai = getAIProvider(cheapModel ? { model: cheapModel } : undefined);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "AI not configured";
        res.status(503).json({ error: msg });
        return;
      }

      const persona = getNuggiePersona();
      const systemPrompt = buildSystemPrompt(persona, "discord-slash");
      const userBlock = discordDisplayName
        ? `Crew member: ${discordDisplayName}\nQuestion: ${question}`
        : `Question: ${question}`;

      const result = await ai.complete(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userBlock },
        ],
        { maxTokens: 256 }
      );

      res.json({ text: result.text, provider: result.provider, model: result.model });
    } catch (err) {
      console.error("[internal] POST /bot/nuggie-chat error:", err);
      res.status(502).json({ error: err instanceof Error ? err.message : "Nuggie chat failed" });
    }
  }
);

/**
 * GET /internal/achievement-variants/:key
 * Bot-only. Returns one weighted-random variant_text from
 * achievement_message_variants for the given key. Bot substitutes the
 * `{{user}}` token at announce time. Returns 404 if no variants exist for
 * the key — bot falls back to a generic line in that case.
 */
internalRouter.get(
  "/achievement-variants/:key",
  requireBotSecret,
  async (req, res) => {
    try {
      const key = String(req.params.key);
      // Weighted random: rows with higher weight are likelier picks.
      // -LN(1 - random()) / weight is the standard weighted-reservoir trick.
      const r = await db.query<{ variant_text: string }>(
        `SELECT variant_text
         FROM achievement_message_variants
         WHERE achievement_key = $1
         ORDER BY -LN(1.0 - random()) / GREATEST(weight, 1)
         LIMIT 1`,
        [key]
      );
      const row = r.rows[0];
      if (!row) {
        res.status(404).json({ error: "No variants for key", key });
        return;
      }
      res.json({ key, text: row.variant_text });
    } catch (err) {
      console.error("[internal] GET /achievement-variants/:key error:", err);
      res.status(500).json({ error: "Failed to load variant" });
    }
  }
);

// ── /internal/autocomplete/* ───────────────────────────────────────────────────
// Feeds Discord slash-command autocomplete. Each endpoint returns up to 25
// `choices` (`{ name, value }`), pre-filtered by a `q` prefix and any
// context-relevant role/status. Discord enforces a 3s deadline and a 100-char
// limit on the `name` field; we cap both server-side.

const AC_LIMIT = 25;

function capName(label: string): string {
  return label.length <= 100 ? label : label.slice(0, 97) + "...";
}

async function resolveUserId(discordUserId: string): Promise<bigint | null> {
  const r = await db.query<{ id: string }>(
    "SELECT id FROM users WHERE discord_user_id = $1",
    [discordUserId]
  );
  return r.rows[0] ? BigInt(r.rows[0].id) : null;
}

function emojiOf(itemData: unknown): string {
  if (itemData && typeof itemData === "object" && "emoji" in itemData) {
    const e = (itemData as { emoji?: unknown }).emoji;
    if (typeof e === "string") return e;
  }
  return "";
}

/**
 * GET /internal/autocomplete/shop?discordUserId&q
 * Active shop items the user does NOT already own, prefix-matched on name.
 * Value = exact item name (the existing `/buy` handler matches by name).
 */
internalRouter.get(
  "/autocomplete/shop",
  requireBotSecret,
  async (req, res) => {
    try {
      const discordUserId = String(req.query.discordUserId ?? "").trim();
      const q = String(req.query.q ?? "").trim();
      if (!discordUserId) {
        res.json({ choices: [] });
        return;
      }
      const userId = await resolveUserId(discordUserId);
      if (!userId) {
        res.json({ choices: [] });
        return;
      }
      const rows = await db.query<{
        id: string; name: string; price: string; item_data: Record<string, unknown>;
      }>(
        `SELECT s.id, s.name, s.price, s.item_data
         FROM nuggies_shop_items s
         WHERE s.is_active = TRUE
           AND s.acquisition = 'shop'
           AND s.id NOT IN (SELECT item_id FROM nuggies_inventory WHERE user_id = $1)
           AND ($2 = '' OR LOWER(s.name) LIKE LOWER($2) || '%')
         ORDER BY s.price ASC, s.name ASC
         LIMIT ${AC_LIMIT}`,
        [userId, q]
      );
      const choices = rows.rows.map((r) => ({
        name: capName(`${emojiOf(r.item_data)} ${r.name} — ${Number(r.price).toLocaleString()}🍗`.trim()),
        value: r.name,
      }));
      res.json({ choices });
    } catch (err) {
      console.error("[internal] GET /autocomplete/shop error:", err);
      res.status(500).json({ choices: [] });
    }
  }
);

/**
 * GET /internal/autocomplete/inventory?discordUserId&q&exclude_listed=true
 * Items the user owns, prefix-matched on name. When exclude_listed=true,
 * hides items already on the marketplace as active listings.
 * Value = exact item name (matches existing `/equip` + `/market list` handlers).
 */
internalRouter.get(
  "/autocomplete/inventory",
  requireBotSecret,
  async (req, res) => {
    try {
      const discordUserId = String(req.query.discordUserId ?? "").trim();
      const q = String(req.query.q ?? "").trim();
      const excludeListed = String(req.query.exclude_listed ?? "") === "true";
      if (!discordUserId) {
        res.json({ choices: [] });
        return;
      }
      const userId = await resolveUserId(discordUserId);
      if (!userId) {
        res.json({ choices: [] });
        return;
      }
      const excludeClause = excludeListed
        ? `AND NOT EXISTS (
             SELECT 1 FROM nuggies_market_listings m
             WHERE m.seller_user_id = $1 AND m.item_id = s.id AND m.status = 'active'
           )`
        : "";
      const rows = await db.query<{
        item_id: string; name: string; equipped: boolean; item_data: Record<string, unknown>;
      }>(
        `SELECT i.item_id, s.name, i.equipped, s.item_data
         FROM nuggies_inventory i
         INNER JOIN nuggies_shop_items s ON s.id = i.item_id
         WHERE i.user_id = $1
           ${excludeClause}
           AND ($2 = '' OR LOWER(s.name) LIKE LOWER($2) || '%')
         ORDER BY i.equipped DESC, s.name ASC
         LIMIT ${AC_LIMIT}`,
        [userId, q]
      );
      const choices = rows.rows.map((r) => ({
        name: capName(`${emojiOf(r.item_data)} ${r.name}${r.equipped ? " (equipped)" : ""}`.trim()),
        value: r.name,
      }));
      res.json({ choices });
    } catch (err) {
      console.error("[internal] GET /autocomplete/inventory error:", err);
      res.status(500).json({ choices: [] });
    }
  }
);

/**
 * GET /internal/autocomplete/loans?discordUserId&role=borrower|lender&status=pending|active
 * Loans the user can act on for the given subcommand. Value = numeric loan ID.
 */
internalRouter.get(
  "/autocomplete/loans",
  requireBotSecret,
  async (req, res) => {
    try {
      const discordUserId = String(req.query.discordUserId ?? "").trim();
      const role = String(req.query.role ?? "").trim();
      const status = String(req.query.status ?? "").trim();
      const q = String(req.query.q ?? "").trim();
      if (!discordUserId || (role !== "borrower" && role !== "lender")) {
        res.json({ choices: [] });
        return;
      }
      if (status !== "pending" && status !== "active") {
        res.json({ choices: [] });
        return;
      }
      const userId = await resolveUserId(discordUserId);
      if (!userId) {
        res.json({ choices: [] });
        return;
      }
      const roleCol = role === "borrower" ? "borrower_user_id" : "lender_user_id";
      const rows = await db.query<{
        id: string; principal: string; amount_due: string; due_at: string; status: string;
      }>(
        `SELECT id, principal, amount_due, due_at, status
         FROM nuggies_loans
         WHERE ${roleCol} = $1
           AND status = $2
           AND ($3 = '' OR CAST(id AS TEXT) LIKE $3 || '%')
         ORDER BY due_at ASC
         LIMIT ${AC_LIMIT}`,
        [userId, status, q]
      );
      const now = Date.now();
      const choices = rows.rows.map((r) => {
        const dueMs = new Date(r.due_at).getTime();
        const days = Math.max(0, Math.round((dueMs - now) / 86_400_000));
        const dueLabel = status === "pending" ? "pending" : `due ${days}d`;
        return {
          name: capName(`#${r.id} — ${Number(r.amount_due).toLocaleString()}🍗 · ${dueLabel}`),
          value: Number(r.id),
        };
      });
      res.json({ choices });
    } catch (err) {
      console.error("[internal] GET /autocomplete/loans error:", err);
      res.status(500).json({ choices: [] });
    }
  }
);

/**
 * GET /internal/autocomplete/market-listings?discordUserId&q&seller=mine|others
 * Active marketplace listings. `seller=mine` → user's own listings (for /market cancel),
 * `seller=others` → listings by other users (for /market buy). Value = numeric listing ID.
 */
internalRouter.get(
  "/autocomplete/market-listings",
  requireBotSecret,
  async (req, res) => {
    try {
      const discordUserId = String(req.query.discordUserId ?? "").trim();
      const seller = String(req.query.seller ?? "").trim();
      const q = String(req.query.q ?? "").trim();
      if (!discordUserId || (seller !== "mine" && seller !== "others")) {
        res.json({ choices: [] });
        return;
      }
      const userId = await resolveUserId(discordUserId);
      if (!userId) {
        res.json({ choices: [] });
        return;
      }
      const sellerClause = seller === "mine"
        ? "m.seller_user_id = $1"
        : "m.seller_user_id <> $1";
      const rows = await db.query<{
        id: string; price: string; name: string; item_data: Record<string, unknown>;
      }>(
        `SELECT m.id, m.price, s.name, s.item_data
         FROM nuggies_market_listings m
         INNER JOIN nuggies_shop_items s ON s.id = m.item_id
         WHERE ${sellerClause}
           AND m.status = 'active'
           AND ($2 = '' OR LOWER(s.name) LIKE LOWER($2) || '%' OR CAST(m.id AS TEXT) LIKE $2 || '%')
         ORDER BY m.listed_at DESC
         LIMIT ${AC_LIMIT}`,
        [userId, q]
      );
      const choices = rows.rows.map((r) => ({
        name: capName(`#${r.id} — ${emojiOf(r.item_data)} ${r.name} — ${Number(r.price).toLocaleString()}🍗`.trim()),
        value: Number(r.id),
      }));
      res.json({ choices });
    } catch (err) {
      console.error("[internal] GET /autocomplete/market-listings error:", err);
      res.status(500).json({ choices: [] });
    }
  }
);

/**
 * GET /internal/autocomplete/game-nights?q
 * Upcoming and recent (last 30d) game nights. Value = numeric night ID.
 * No user filter — any member can request recommendations for any night.
 */
internalRouter.get(
  "/autocomplete/game-nights",
  requireBotSecret,
  async (req, res) => {
    try {
      const q = String(req.query.q ?? "").trim();
      const rows = await db.query<{
        id: string; title: string; scheduled_for: string;
      }>(
        `SELECT id, title, scheduled_for
         FROM game_nights
         WHERE scheduled_for >= NOW() - INTERVAL '30 days'
           AND ($1 = '' OR LOWER(title) LIKE LOWER($1) || '%' OR CAST(id AS TEXT) LIKE $1 || '%')
         ORDER BY scheduled_for DESC
         LIMIT ${AC_LIMIT}`,
        [q]
      );
      const fmt = (iso: string) => {
        const d = new Date(iso);
        return Number.isFinite(d.getTime())
          ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "";
      };
      const choices = rows.rows.map((r) => ({
        name: capName(`#${r.id} — ${r.title} (${fmt(r.scheduled_for)})`),
        value: Number(r.id),
      }));
      res.json({ choices });
    } catch (err) {
      console.error("[internal] GET /autocomplete/game-nights error:", err);
      res.status(500).json({ choices: [] });
    }
  }
);

/**
 * POST /internal/events/member-joined
 * Bot-only. Records a "member.joined" activity event when someone joins the
 * Discord guild. The new member may not have a `users` row yet (created on
 * first web login), so the actor's identity is carried in the payload for
 * robust feed rendering + profile linking.
 */
internalRouter.post(
  "/events/member-joined",
  requireBotSecret,
  async (req, res) => {
    try {
      const body = req.body ?? {};
      const discordUserId = typeof body.discordUserId === "string" ? body.discordUserId : "";
      const displayName = typeof body.displayName === "string" ? body.displayName : "";
      const avatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl : null;
      if (!/^\d{15,25}$/.test(discordUserId)) {
        res.status(400).json({ error: "Invalid discordUserId" });
        return;
      }
      await recordEvent({
        eventType: "member.joined",
        actorDiscordUserId: discordUserId,
        payload: { discordUserId, displayName, avatarUrl }
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("[internal] POST /events/member-joined error:", err);
      res.status(500).json({ error: "Failed to record member-joined" });
    }
  }
);
