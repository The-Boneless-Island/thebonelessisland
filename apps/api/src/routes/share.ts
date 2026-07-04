// Share-to-Discord (WS5): member-facing "send to a channel" feature.
//
// Replaces the old thin per-page navigator.share buttons. A member picks one
// of the admin-curated `share_targets` channels; the server re-fetches the
// content by id (never trusts client-supplied title/body/image), builds a
// member-attributed embed payload, and drops it on the existing
// bot_announcements outbox (kind = 'member.share') for the bot to deliver.

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "../db/client.js";
import { env } from "../config.js";
import { requireAdminRole, requireSession } from "../lib/auth.js";
import { recordEvent } from "../lib/activityEvents.js";
import { officialThreadUrl } from "../lib/officialAnnounce.js";
import { getAISetting, getGuildId } from "../lib/serverSettings.js";
import { userOrIp } from "../middleware/rateLimit.js";

export const shareRouter = Router();

// ── GET /share/targets ───────────────────────────────────────────────────────
// Never includes discord_channel_id — the raw snowflake must never reach the
// browser. Members only see id/label/emoji to pick from.

shareRouter.get("/targets", requireSession, async (_req, res) => {
  try {
    const result = await db.query<{ id: string; label: string; emoji: string | null }>(
      `SELECT id, label, emoji
         FROM share_targets
        WHERE is_active = TRUE
        ORDER BY position ASC, id ASC`
    );
    res.json({
      targets: result.rows.map((row) => ({
        id: Number(row.id),
        label: row.label,
        emoji: row.emoji
      }))
    });
  } catch (err) {
    console.error("[share] GET /share/targets error:", err);
    res.status(500).json({ error: "Failed to load share targets" });
  }
});

// ── POST /share ──────────────────────────────────────────────────────────────

const shareBodySchema = z.object({
  contentType: z.enum(["forum_thread", "forum_post", "news_item", "activity_event"]),
  contentId: z.number().int().positive(),
  targetId: z.number().int().positive()
});

// Strict route-local limiter: sharing hits Discord + writes an outbox row per
// call, so cap it well below the generous defaultLimiter the router is
// mounted under. Keyed by session user (falls back to IP).
const shareLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 5,
  keyGenerator: userOrIp,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many shares. Wait a bit before sharing again." }
});

function webOrigin(): string {
  const raw = env.WEB_ORIGIN as unknown;
  const origin = Array.isArray(raw) ? String(raw[0] ?? "") : String(raw ?? "");
  return origin.replace(/\/+$/, "");
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

type ResolvedContent = {
  title: string;
  description: string;
  imageUrl: string | null;
  deepLink: string;
  sourceLabel: string;
};

async function resolveForumThread(contentId: number): Promise<ResolvedContent | null> {
  const result = await db.query<{
    id: string;
    title: string;
    body: string;
    display_name: string | null;
    username: string | null;
  }>(
    `SELECT t.id, t.title, p.body,
            gm.display_name, dp.username
       FROM forum_threads t
       INNER JOIN forum_posts p ON p.thread_id = t.id AND p.is_op = TRUE AND p.is_deleted = FALSE
       LEFT JOIN users u ON u.id = t.author_user_id
       LEFT JOIN discord_profiles dp ON dp.user_id = u.id
       LEFT JOIN guild_members gm ON gm.discord_user_id = u.discord_user_id AND gm.guild_id = $2
      WHERE t.id = $1 AND t.is_deleted = FALSE
      LIMIT 1`,
    [contentId, getGuildId()]
  );
  const row = result.rows[0];
  if (!row) return null;
  const authorName = row.display_name ?? row.username ?? "a crew member";
  return {
    title: row.title,
    description: `Thread by ${authorName}\n\n${row.body}`,
    imageUrl: null,
    deepLink: officialThreadUrl(Number(row.id)),
    sourceLabel: "Boneless Island Forums"
  };
}

async function resolveForumPost(contentId: number): Promise<ResolvedContent | null> {
  const result = await db.query<{
    id: string;
    thread_id: string;
    body: string;
    thread_title: string;
    display_name: string | null;
    username: string | null;
    file_path: string | null;
  }>(
    `SELECT p.id, p.thread_id, p.body, t.title AS thread_title,
            gm.display_name, dp.username,
            (SELECT fu.file_path FROM forum_uploads fu WHERE fu.post_id = p.id ORDER BY fu.created_at ASC LIMIT 1) AS file_path
       FROM forum_posts p
       INNER JOIN forum_threads t ON t.id = p.thread_id AND t.is_deleted = FALSE
       LEFT JOIN users u ON u.id = p.author_user_id
       LEFT JOIN discord_profiles dp ON dp.user_id = u.id
       LEFT JOIN guild_members gm ON gm.discord_user_id = u.discord_user_id AND gm.guild_id = $2
      WHERE p.id = $1 AND p.is_deleted = FALSE
      LIMIT 1`,
    [contentId, getGuildId()]
  );
  const row = result.rows[0];
  if (!row) return null;
  const authorName = row.display_name ?? row.username ?? "a crew member";
  const imageUrl = row.file_path
    ? `${env.API_PUBLIC_URL.replace(/\/+$/, "")}/uploads/${row.file_path}`
    : null;
  return {
    title: row.thread_title,
    description: `${authorName} wrote:\n\n${row.body}`,
    imageUrl,
    deepLink: officialThreadUrl(Number(row.thread_id)) + `/post/${row.id}`,
    sourceLabel: "Boneless Island Forums"
  };
}

async function resolveNewsItem(contentId: number): Promise<ResolvedContent | null> {
  const result = await db.query<{
    id: number;
    title: string;
    ai_title: string | null;
    ai_summary: string | null;
    ai_subtitle: string | null;
    contents: string | null;
    image_url: string | null;
    source_name: string;
    url: string;
  }>(
    `SELECT id, title, ai_title, ai_summary, ai_subtitle, contents, image_url, source_name, url
       FROM general_news
      WHERE id = $1
        AND ai_relevance_score > 0
        AND ai_validation_failed = FALSE
      LIMIT 1`,
    [contentId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const description =
    row.ai_subtitle ?? row.ai_summary ?? row.contents ?? "Fresh from the shore.";
  return {
    title: row.ai_title ?? row.title,
    description,
    imageUrl: row.image_url,
    deepLink: `${webOrigin()}/games/news?item=${row.id}`,
    sourceLabel: row.source_name || "Gaming News"
  };
}

async function resolveActivityEvent(contentId: number): Promise<ResolvedContent | null> {
  const result = await db.query<{
    id: string;
    event_type: string;
    payload: Record<string, unknown>;
    actor_discord_user_id: string | null;
    display_name: string | null;
    username: string | null;
  }>(
    `SELECT ae.id, ae.event_type, ae.payload,
            u.discord_user_id AS actor_discord_user_id,
            gm.display_name, dp.username
       FROM activity_events ae
       LEFT JOIN users u ON u.id = ae.actor_user_id
       LEFT JOIN discord_profiles dp ON dp.user_id = u.id
       LEFT JOIN guild_members gm ON gm.discord_user_id = u.discord_user_id AND gm.guild_id = $2
      WHERE ae.id = $1
      LIMIT 1`,
    [contentId, getGuildId()]
  );
  const row = result.rows[0];
  if (!row) return null;
  const actorName = row.display_name ?? row.username ?? "A crew member";
  const origin = webOrigin();
  const deepLink = row.actor_discord_user_id
    ? `${origin}/islanders/${encodeURIComponent(row.actor_discord_user_id)}`
    : `${origin}/community`;
  return {
    title: `${actorName} on the island`,
    description: `${actorName} just did something worth a look on Boneless Island.`,
    imageUrl: null,
    deepLink,
    sourceLabel: "Boneless Island Activity"
  };
}

shareRouter.post("/", requireSession, shareLimiter, async (req, res) => {
  try {
    const body = shareBodySchema.parse(req.body);
    const discordUserId = String(res.locals.userId);

    if (getAISetting("share_enabled") === "false") {
      res.status(403).json({ error: "Sharing is currently disabled" });
      return;
    }

    const targetResult = await db.query<{ id: string; discord_channel_id: string; label: string }>(
      `SELECT id, discord_channel_id, label FROM share_targets WHERE id = $1 AND is_active = TRUE LIMIT 1`,
      [body.targetId]
    );
    const target = targetResult.rows[0];
    if (!target) {
      res.status(404).json({ error: "Share target not found" });
      return;
    }

    let content: ResolvedContent | null;
    switch (body.contentType) {
      case "forum_thread":
        content = await resolveForumThread(body.contentId);
        break;
      case "forum_post":
        content = await resolveForumPost(body.contentId);
        break;
      case "news_item":
        content = await resolveNewsItem(body.contentId);
        break;
      case "activity_event":
        content = await resolveActivityEvent(body.contentId);
        break;
    }
    if (!content) {
      res.status(404).json({ error: "Content not found" });
      return;
    }

    // Dedupe: same user + same content + same target within 6h is treated as
    // a duplicate share attempt (double-click, retry, etc).
    const dupe = await db.query(
      `SELECT 1
         FROM activity_events
        WHERE event_type = 'share.discord'
          AND actor_user_id = (SELECT id FROM users WHERE discord_user_id = $1)
          AND payload->>'contentType' = $2
          AND (payload->>'contentId')::bigint = $3
          AND (payload->>'targetId')::bigint = $4
          AND created_at > NOW() - INTERVAL '6 hours'
        LIMIT 1`,
      [discordUserId, body.contentType, body.contentId, body.targetId]
    );
    if ((dupe.rowCount ?? 0) > 0) {
      res.status(409).json({ error: "Already shared this to that channel recently" });
      return;
    }

    const attribution = await db.query<{
      avatar_url: string | null;
      global_name: string | null;
      username: string;
      display_name: string | null;
    }>(
      `SELECT dp.avatar_url, dp.global_name, dp.username, gm.display_name
         FROM users u
         INNER JOIN discord_profiles dp ON dp.user_id = u.id
         LEFT JOIN guild_members gm ON gm.discord_user_id = u.discord_user_id AND gm.guild_id = $2
        WHERE u.discord_user_id = $1
        LIMIT 1`,
      [discordUserId, getGuildId()]
    );
    const who = attribution.rows[0];
    const displayName = who?.display_name ?? who?.global_name ?? who?.username ?? "A crew member";
    const avatarUrl = who?.avatar_url ?? null;

    const payload = Object.freeze({
      channelId: target.discord_channel_id,
      sharedBy: Object.freeze({
        discordUserId,
        displayName,
        avatarUrl
      }),
      contentType: body.contentType,
      title: truncate(content.title, 256),
      description: truncate(content.description, 1000),
      imageUrl: content.imageUrl ?? undefined,
      deepLink: content.deepLink,
      sourceLabel: content.sourceLabel
    });

    await db.query(
      `INSERT INTO bot_announcements (kind, payload) VALUES ('member.share', $1::jsonb)`,
      [JSON.stringify(payload)]
    );

    await recordEvent({
      eventType: "share.discord",
      actorDiscordUserId: discordUserId,
      payload: {
        contentType: body.contentType,
        contentId: body.contentId,
        targetId: body.targetId,
        targetLabel: target.label
      }
    });

    res.status(202).json({ ok: true });
  } catch (err) {
    console.error("[share] POST /share error:", err);
    res.status(500).json({ error: "Failed to share" });
  }
});

// ── Admin: Discord channel picker ────────────────────────────────────────────
// Mirrors the exact Discord REST call pattern used in routes/members.ts —
// bot token in the Authorization header, guild channels endpoint.

const DISCORD_TEXT_CHANNEL_TYPES = new Set([0, 5]); // GUILD_TEXT, GUILD_ANNOUNCEMENT

shareRouter.get("/admin/discord/channels", requireAdminRole, async (_req, res) => {
  try {
    const guildId = getGuildId();
    if (!guildId || !env.DISCORD_BOT_TOKEN) {
      res.status(400).json({ error: "Discord guild/bot token not configured" });
      return;
    }

    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      res.status(502).json({ error: `Discord channel list failed (${response.status})`, detail: body.slice(0, 300) });
      return;
    }

    const data = (await response.json()) as Array<{
      id: string;
      name: string;
      type: number;
      parent_id: string | null;
    }>;
    const categoryNames = new Map(
      data.filter((c) => c.type === 4).map((c) => [c.id, c.name])
    );
    const channels = data
      .filter((c) => DISCORD_TEXT_CHANNEL_TYPES.has(c.type))
      .map((c) => ({
        id: c.id,
        name: c.name,
        category: c.parent_id ? (categoryNames.get(c.parent_id) ?? null) : null
      }));

    res.json({ channels });
  } catch (err) {
    console.error("[share] GET /share/admin/discord/channels error:", err);
    res.status(502).json({ error: "Failed to list Discord channels" });
  }
});

// ── Admin: share_targets CRUD ────────────────────────────────────────────────

const targetCreateSchema = z.object({
  discordChannelId: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(80),
  emoji: z.string().trim().max(16).optional(),
  position: z.number().int().optional()
});

const targetUpdateSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  emoji: z.string().trim().max(16).nullable().optional(),
  position: z.number().int().optional(),
  isActive: z.boolean().optional()
});

const reorderSchema = z.object({
  order: z.array(z.number().int().positive()).min(1)
});

shareRouter.get("/admin/targets", requireAdminRole, async (_req, res) => {
  try {
    const result = await db.query<{
      id: string;
      discord_channel_id: string;
      label: string;
      emoji: string | null;
      position: number;
      is_active: boolean;
    }>(
      `SELECT id, discord_channel_id, label, emoji, position, is_active
         FROM share_targets
        ORDER BY position ASC, id ASC`
    );
    res.json({
      targets: result.rows.map((row) => ({
        id: Number(row.id),
        discordChannelId: row.discord_channel_id,
        label: row.label,
        emoji: row.emoji,
        position: row.position,
        isActive: row.is_active
      }))
    });
  } catch (err) {
    console.error("[share] GET /share/admin/targets error:", err);
    res.status(500).json({ error: "Failed to load share targets" });
  }
});

shareRouter.post("/admin/targets", requireAdminRole, async (req, res) => {
  try {
    const body = targetCreateSchema.parse(req.body);
    const result = await db.query<{ id: string }>(
      `INSERT INTO share_targets (discord_channel_id, label, emoji, position)
       VALUES ($1, $2, $3, COALESCE($4, 0))
       ON CONFLICT (discord_channel_id) DO UPDATE SET
         label = EXCLUDED.label,
         emoji = EXCLUDED.emoji,
         is_active = TRUE
       RETURNING id`,
      [body.discordChannelId, body.label, body.emoji ?? null, body.position ?? null]
    );
    res.status(201).json({ id: Number(result.rows[0].id) });
  } catch (err) {
    console.error("[share] POST /share/admin/targets error:", err);
    res.status(500).json({ error: "Failed to create share target" });
  }
});

shareRouter.patch("/admin/targets/:id", requireAdminRole, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = targetUpdateSchema.parse(req.body);
    const fields: string[] = [];
    const values: unknown[] = [];
    let n = 1;
    if (body.label !== undefined) { fields.push(`label = $${n++}`); values.push(body.label); }
    if (body.emoji !== undefined) { fields.push(`emoji = $${n++}`); values.push(body.emoji); }
    if (body.position !== undefined) { fields.push(`position = $${n++}`); values.push(body.position); }
    if (body.isActive !== undefined) { fields.push(`is_active = $${n++}`); values.push(body.isActive); }
    if (fields.length === 0) {
      res.json({ ok: true });
      return;
    }
    values.push(id);
    await db.query(`UPDATE share_targets SET ${fields.join(", ")} WHERE id = $${n}`, values);
    res.json({ ok: true });
  } catch (err) {
    console.error("[share] PATCH /share/admin/targets/:id error:", err);
    res.status(500).json({ error: "Failed to update share target" });
  }
});

shareRouter.delete("/admin/targets/:id", requireAdminRole, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await db.query(`DELETE FROM share_targets WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("[share] DELETE /share/admin/targets/:id error:", err);
    res.status(500).json({ error: "Failed to delete share target" });
  }
});

shareRouter.post("/admin/targets/reorder", requireAdminRole, async (req, res) => {
  try {
    const body = reorderSchema.parse(req.body);
    await Promise.all(
      body.order.map((id, index) =>
        db.query(`UPDATE share_targets SET position = $1 WHERE id = $2`, [index, id])
      )
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[share] POST /share/admin/targets/reorder error:", err);
    res.status(500).json({ error: "Failed to reorder share targets" });
  }
});
