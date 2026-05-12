import { Router } from "express";
import { db } from "../db/client.js";
import { requireBotSecret } from "../lib/auth.js";

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
