import { formatNuggiesReason, NUGGIES_TX_TYPE } from "@island/shared";
import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { userOrIp } from "../middleware/rateLimit.js";
import { z } from "zod";
import { db } from "../db/client.js";
import { requireParentRole, requireSession } from "../lib/auth.js";
import { ensureSettingsLoaded, getAISetting } from "../lib/serverSettings.js";
import { recordEvent } from "../lib/activityEvents.js";
import { applyTransaction } from "../lib/nuggiesLedger.js";
import { getOrFetchLinkPreview } from "../lib/forumLinkPreview.js";
import { announceNewThread } from "../lib/forumAnnounce.js";
import {
  enqueueOfficialAnnouncementCreate,
  enqueueOfficialAnnouncementUpdate,
} from "../lib/officialAnnounce.js";
import { processForumImage } from "../lib/forumUploads.js";

const THREAD_TYPES = ["discussion", "memory", "recommendation", "resource"] as const;

/** Public base URL of this API, derived from the (proxy-aware) request. */
function reqBaseUrl(req: Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

type Querier = { query: (text: string, params?: unknown[]) => Promise<unknown> };

/** Attach pending uploads to a post — only the uploader's own unclaimed rows. */
async function claimUploads(q: Querier, uploadIds: number[] | undefined, userId: bigint, postId: number): Promise<void> {
  const ids = (uploadIds ?? []).filter((n) => Number.isInteger(n) && n > 0).slice(0, 10);
  if (ids.length === 0) return;
  await q.query(
    `UPDATE forum_uploads SET post_id = $1
     WHERE id = ANY($2::bigint[]) AND uploader_user_id = $3 AND post_id IS NULL`,
    [postId, ids, userId]
  );
}

// @username mentions: the unique no-spaces Discord username. The lookbehind
// rejects an @ glued to a preceding word char so email addresses
// (test@example.com) never read as a mention of "example.com".
const MENTION_RE = /(?<![a-z0-9._])@([a-z0-9._]{2,32})/gi;

/** Resolve @username mentions in a body to internal user ids (minus the author). */
async function resolveMentions(body: string, authorUserId: bigint): Promise<bigint[]> {
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(body)) !== null) names.add(m[1].toLowerCase());
  if (names.size === 0) return [];
  const r = await db.query<{ user_id: string }>(
    `SELECT DISTINCT dp.user_id FROM discord_profiles dp WHERE lower(dp.username) = ANY($1)`,
    [[...names]]
  );
  return r.rows.map((row) => BigInt(row.user_id)).filter((id) => id !== authorUserId);
}

/**
 * Notify about a new post: mentioned users get a 'mention', thread subscribers
 * get a 'reply'. Mention wins over reply for the same recipient; the author and
 * banned users never get notified. Best-effort (called post-commit).
 */
async function notifyForPost(opts: { threadId: number; postId: number; body: string; authorUserId: bigint }): Promise<void> {
  const { threadId, postId, body, authorUserId } = opts;
  const notified = new Set<string>();

  const mentioned = await resolveMentions(body, authorUserId);
  for (const uid of mentioned) {
    if (await isBanned(uid)) continue;
    await db.query(
      `INSERT INTO forum_notifications (user_id, type, actor_user_id, thread_id, post_id)
       VALUES ($1, 'mention', $2, $3, $4)`,
      [uid, authorUserId, threadId, postId]
    );
    notified.add(String(uid));
  }

  const subs = await db.query<{ user_id: string }>(
    `SELECT user_id FROM forum_thread_subscriptions WHERE thread_id = $1 AND user_id <> $2`,
    [threadId, authorUserId]
  );
  for (const row of subs.rows) {
    if (notified.has(row.user_id)) continue;
    const uid = BigInt(row.user_id);
    if (await isBanned(uid)) continue;
    await db.query(
      `INSERT INTO forum_notifications (user_id, type, actor_user_id, thread_id, post_id)
       VALUES ($1, 'reply', $2, $3, $4)`,
      [uid, authorUserId, threadId, postId]
    );
  }
}

export const forumsRouter = Router();

function getSetting(key: string, fallback: number): number {
  const raw = getAISetting(key);
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function isEnabled(): boolean {
  return getAISetting("forums_enabled") !== "false";
}

async function resolveInternalId(discordUserId: string): Promise<bigint | null> {
  const r = await db.query<{ id: string }>(
    "SELECT id FROM users WHERE discord_user_id = $1",
    [discordUserId]
  );
  return r.rows[0] ? BigInt(r.rows[0].id) : null;
}

async function isBanned(userId: bigint): Promise<boolean> {
  const r = await db.query<{ expires_at: string | null }>(
    "SELECT expires_at FROM forum_user_bans WHERE user_id = $1",
    [userId]
  );
  if (!r.rows[0]) return false;
  const exp = r.rows[0].expires_at;
  if (!exp) return true;
  return new Date(exp).getTime() > Date.now();
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "thread";
}

async function isParent(discordUserId: string): Promise<boolean> {
  const r = await db.query<{ role_names: string[] }>(
    `SELECT COALESCE(gm.role_names, '{}'::text[]) AS role_names
     FROM guild_members gm
     WHERE gm.discord_user_id = $1 AND gm.in_guild = TRUE
     LIMIT 1`,
    [discordUserId]
  );
  return (r.rows[0]?.role_names ?? []).includes("Parent");
}

// The fixed reaction set. Stored verbatim in forum_post_reactions.reaction.
// Legacy 'like' rows (pre-v2) are mapped to 'nug' at read time below until
// migration 057 renames them in place.
const REACTIONS = ["nug", "heart", "laugh", "fire", "salute"] as const;
type ReactionKey = (typeof REACTIONS)[number];
const REACTION_SET = new Set<string>(REACTIONS);

// Normalize legacy 'like' → 'nug' in aggregations. Reused across queries.
const REACTION_NORM = "CASE WHEN reaction = 'like' THEN 'nug' ELSE reaction END";

type UploadRow = { file_path: string; thumb_path: string; width: number; height: number };

type PostRow = {
  id: string;
  thread_id: string;
  body: string;
  is_op: boolean;
  is_deleted: boolean;
  edited_at: string | null;
  created_at: string;
  author_discord_id: string;
  author_username: string;
  author_display_name: string;
  author_avatar_url: string | null;
  reactions: Record<string, number> | null;
  my_reactions: string[] | null;
  attachments: UploadRow[] | null;
};

async function fetchPosts(threadId: bigint, viewerUserId: bigint | null): Promise<PostRow[]> {
  const r = await db.query<PostRow>(
    `SELECT
       p.id, p.thread_id, p.body, p.is_op, p.is_deleted, p.edited_at, p.created_at,
       u.discord_user_id AS author_discord_id,
       dp.username AS author_username,
       COALESCE(dp.global_name, dp.username) AS author_display_name,
       dp.avatar_url AS author_avatar_url,
       (SELECT COALESCE(jsonb_object_agg(rk, cnt), '{}'::jsonb)
          FROM (SELECT ${REACTION_NORM} AS rk, COUNT(*)::int AS cnt
                FROM forum_post_reactions WHERE post_id = p.id
                GROUP BY 1) agg) AS reactions,
       (SELECT COALESCE(array_agg(DISTINCT ${REACTION_NORM}), '{}')
          FROM forum_post_reactions WHERE post_id = p.id AND user_id = $2) AS my_reactions,
       (SELECT COALESCE(json_agg(json_build_object(
                 'file_path', fu.file_path, 'thumb_path', fu.thumb_path,
                 'width', fu.width, 'height', fu.height) ORDER BY fu.id), '[]'::json)
          FROM forum_uploads fu WHERE fu.post_id = p.id) AS attachments
     FROM forum_posts p
     INNER JOIN users u ON u.id = p.author_user_id
     INNER JOIN discord_profiles dp ON dp.user_id = p.author_user_id
     WHERE p.thread_id = $1
     ORDER BY p.created_at ASC`,
    [threadId, viewerUserId ?? -1]
  );
  return r.rows;
}

function serializePost(row: PostRow, baseUrl: string) {
  return {
    id: parseInt(row.id, 10),
    threadId: parseInt(row.thread_id, 10),
    body: row.is_deleted ? "" : row.body,
    isOp: row.is_op,
    isDeleted: row.is_deleted,
    editedAt: row.edited_at,
    createdAt: row.created_at,
    author: {
      discordUserId: row.author_discord_id,
      username: row.author_username,
      displayName: row.author_display_name,
      avatarUrl: row.author_avatar_url,
    },
    reactions: row.reactions ?? {},
    myReactions: row.my_reactions ?? [],
    attachments: row.is_deleted
      ? []
      : (row.attachments ?? []).map((a) => ({
          url: `${baseUrl}/uploads/${a.file_path}`,
          thumbUrl: `${baseUrl}/uploads/${a.thumb_path}`,
          width: a.width,
          height: a.height,
        })),
  };
}

type LinkPreviewRow = {
  lp_status: string | null;
  lp_title: string | null;
  lp_desc: string | null;
  lp_image: string | null;
  lp_site: string | null;
};

function buildLinkPreview(row: LinkPreviewRow) {
  if (row.lp_status !== "ok") return null;
  return {
    title: row.lp_title,
    description: row.lp_desc,
    imageUrl: row.lp_image,
    siteName: row.lp_site,
  };
}

// Shared SELECT fragment + JOIN for the cached link preview of a thread.
const LINK_PREVIEW_SELECT =
  "lp.status AS lp_status, lp.title AS lp_title, lp.description AS lp_desc, lp.image_url AS lp_image, lp.site_name AS lp_site";
const LINK_PREVIEW_JOIN = "LEFT JOIN forum_link_previews lp ON lp.url = t.link_url";

type PollOptionRow = { id: number; label: string; position: number; votes: number };

/** Fetch the thread's poll (if any) with per-option counts + the viewer's votes. */
async function fetchPoll(threadId: number, viewerUserId: bigint | null) {
  const r = await db.query<{
    id: string; question: string; multi: boolean; closes_at: string | null;
    options: PollOptionRow[] | null; my_votes: string[] | null; voter_count: string;
  }>(
    `SELECT p.id, p.question, p.multi, p.closes_at,
       (SELECT COALESCE(json_agg(json_build_object(
          'id', o.id, 'label', o.label, 'position', o.position,
          'votes', (SELECT COUNT(*) FROM forum_poll_votes v WHERE v.option_id = o.id)
        ) ORDER BY o.position), '[]'::json)
        FROM forum_poll_options o WHERE o.poll_id = p.id) AS options,
       (SELECT COALESCE(array_agg(v.option_id), '{}')
        FROM forum_poll_votes v WHERE v.poll_id = p.id AND v.user_id = $2) AS my_votes,
       (SELECT COUNT(DISTINCT v.user_id)::text FROM forum_poll_votes v WHERE v.poll_id = p.id) AS voter_count
     FROM forum_polls p WHERE p.thread_id = $1`,
    [threadId, viewerUserId ?? -1]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: parseInt(row.id, 10),
    question: row.question,
    multi: row.multi,
    closesAt: row.closes_at,
    totalVoters: parseInt(row.voter_count, 10),
    options: (row.options ?? []).map((o) => ({ id: Number(o.id), label: o.label, votes: Number(o.votes) })),
    myVotes: (row.my_votes ?? []).map((v) => Number(v)),
  };
}

// ── GET /forums/categories ──────────────────────────────────────────────────

forumsRouter.get("/categories", requireSession, async (_req, res) => {
  const r = await db.query<{
    id: string; slug: string; name: string; description: string;
    icon: string; accent_color: string; position: number; is_locked: boolean;
    auto_discord_bridge: boolean;
    thread_count: string; last_thread_id: string | null; last_thread_title: string | null;
    last_thread_slug: string | null; last_activity_at: string | null;
    last_user_display: string | null; last_user_avatar: string | null;
  }>(
    `SELECT c.id, c.slug, c.name, c.description, c.icon, c.accent_color, c.position, c.is_locked,
       c.auto_discord_bridge,
       (SELECT COUNT(*)::text FROM forum_threads WHERE category_id = c.id AND is_deleted = FALSE) AS thread_count,
       lt.id AS last_thread_id,
       lt.title AS last_thread_title,
       lt.slug AS last_thread_slug,
       COALESCE(lt.last_reply_at, lt.created_at) AS last_activity_at,
       COALESCE(ldp.global_name, ldp.username) AS last_user_display,
       ldp.avatar_url AS last_user_avatar
     FROM forum_categories c
     LEFT JOIN LATERAL (
       SELECT t.id, t.title, t.slug, t.last_reply_at, t.created_at,
              COALESCE(t.last_reply_user_id, t.author_user_id) AS last_uid
       FROM forum_threads t
       WHERE t.category_id = c.id AND t.is_deleted = FALSE
       ORDER BY COALESCE(t.last_reply_at, t.created_at) DESC
       LIMIT 1
     ) lt ON TRUE
     LEFT JOIN discord_profiles ldp ON ldp.user_id = lt.last_uid
     ORDER BY c.position ASC, c.id ASC`
  );

  res.json({
    announceAvailable: Boolean(getAISetting("forums_discord_webhook_url")),
    categories: r.rows.map((row) => ({
      id: parseInt(row.id, 10),
      slug: row.slug,
      name: row.name,
      description: row.description,
      icon: row.icon,
      accentColor: row.accent_color,
      position: row.position,
      isLocked: row.is_locked,
      autoDiscordBridge: row.auto_discord_bridge,
      threadCount: parseInt(row.thread_count, 10),
      lastActivity: row.last_thread_id
        ? {
            threadId: parseInt(row.last_thread_id, 10),
            threadTitle: row.last_thread_title,
            threadSlug: row.last_thread_slug,
            at: row.last_activity_at,
            userDisplayName: row.last_user_display,
            userAvatarUrl: row.last_user_avatar,
          }
        : null,
    })),
  });
});

// ── GET /forums/categories/:slug/threads ────────────────────────────────────

forumsRouter.get("/categories/:slug/threads", requireSession, async (req, res) => {
  const slug = String(req.params.slug);
  const limit = Math.min(parseInt(String(req.query.limit ?? "30"), 10) || 30, 100);
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

  const cat = await db.query<{ id: string; name: string; description: string; icon: string; accent_color: string; is_locked: boolean }>(
    "SELECT id, name, description, icon, accent_color, is_locked FROM forum_categories WHERE slug = $1",
    [slug]
  );
  if (!cat.rows[0]) { res.status(404).json({ error: "Category not found" }); return; }

  const categoryId = parseInt(cat.rows[0].id, 10);

  const tr = await db.query<{
    id: string; title: string; slug: string;
    is_pinned: boolean; is_locked: boolean;
    view_count: number; reply_count: number;
    created_at: string; last_reply_at: string | null;
    author_discord_id: string; author_username: string; author_display_name: string; author_avatar_url: string | null;
    last_user_display: string | null; last_user_avatar: string | null;
  }>(
    `SELECT t.id, t.title, t.slug, t.is_pinned, t.is_locked, t.view_count, t.reply_count,
       t.created_at, t.last_reply_at,
       u.discord_user_id AS author_discord_id,
       dp.username AS author_username,
       COALESCE(dp.global_name, dp.username) AS author_display_name,
       dp.avatar_url AS author_avatar_url,
       COALESCE(ldp.global_name, ldp.username) AS last_user_display,
       ldp.avatar_url AS last_user_avatar
     FROM forum_threads t
     INNER JOIN users u ON u.id = t.author_user_id
     INNER JOIN discord_profiles dp ON dp.user_id = t.author_user_id
     LEFT JOIN discord_profiles ldp ON ldp.user_id = t.last_reply_user_id
     WHERE t.category_id = $1 AND t.is_deleted = FALSE
     ORDER BY t.is_pinned DESC, COALESCE(t.last_reply_at, t.created_at) DESC
     LIMIT $2 OFFSET $3`,
    [categoryId, limit, offset]
  );

  const total = await db.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM forum_threads WHERE category_id = $1 AND is_deleted = FALSE",
    [categoryId]
  );

  res.json({
    category: {
      id: categoryId,
      slug,
      name: cat.rows[0].name,
      description: cat.rows[0].description,
      icon: cat.rows[0].icon,
      accentColor: cat.rows[0].accent_color,
      isLocked: cat.rows[0].is_locked,
    },
    threads: tr.rows.map((row) => ({
      id: parseInt(row.id, 10),
      title: row.title,
      slug: row.slug,
      isPinned: row.is_pinned,
      isLocked: row.is_locked,
      viewCount: row.view_count,
      replyCount: row.reply_count,
      createdAt: row.created_at,
      lastReplyAt: row.last_reply_at,
      author: {
        discordUserId: row.author_discord_id,
        username: row.author_username,
        displayName: row.author_display_name,
        avatarUrl: row.author_avatar_url,
      },
      lastReplyUser: row.last_user_display
        ? { displayName: row.last_user_display, avatarUrl: row.last_user_avatar }
        : null,
    })),
    total: parseInt(total.rows[0]?.count ?? "0", 10),
    limit,
    offset,
  });
});

// ── POST /forums/categories/:slug/threads ───────────────────────────────────

const createThreadSchema = z.object({
  title: z.string().min(3),
  body: z.string().min(2),
  appId: z.number().int().positive().optional(),
  threadType: z.enum(THREAD_TYPES).optional(),
  linkUrl: z.string().max(2048).optional(),
  uploadIds: z.array(z.number().int().positive()).max(10).optional(),
  announce: z.boolean().optional(),
  poll: z.object({
    question: z.string().min(1).max(300),
    options: z.array(z.string().min(1).max(120)).min(2).max(10),
    multi: z.boolean().optional(),
    closesAt: z.string().datetime().optional(),
  }).optional(),
});

forumsRouter.post("/categories/:slug/threads", requireSession, async (req, res) => {
  if (!isEnabled()) { res.status(503).json({ error: "Forums disabled" }); return; }
  await ensureSettingsLoaded();

  const parsed = createThreadSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const titleMax = getSetting("forums_title_max_chars", 160);
  const bodyMin = getSetting("forums_post_min_chars", 2);
  const bodyMax = getSetting("forums_post_max_chars", 8000);
  const cooldown = getSetting("forums_new_thread_cooldown_secs", 30);

  const title = parsed.data.title.trim().slice(0, titleMax);
  const body = parsed.data.body.trim();
  if (body.length < bodyMin || body.length > bodyMax) {
    res.status(400).json({ error: `Post must be ${bodyMin}–${bodyMax} characters` }); return;
  }

  // Post type + optional primary link. Links are only meaningful for resource
  // (required) and recommendation (optional); reject them elsewhere so the
  // column means one thing.
  const threadType = parsed.data.threadType ?? "discussion";
  const linkRaw = parsed.data.linkUrl?.trim();
  if (linkRaw && threadType !== "resource" && threadType !== "recommendation") {
    res.status(400).json({ error: "Links are only allowed on resource or recommendation posts" }); return;
  }
  if (threadType === "resource" && !linkRaw) {
    res.status(400).json({ error: "A resource post needs a link" }); return;
  }
  if (linkRaw && !/^https?:\/\/\S+$/i.test(linkRaw)) {
    res.status(400).json({ error: "Link must be a full http(s) URL" }); return;
  }
  const linkUrl: string | null = linkRaw ?? null;

  const discordUserId = String(res.locals.userId);
  const userId = await resolveInternalId(discordUserId);
  if (!userId) { res.status(404).json({ error: "User not found" }); return; }
  if (await isBanned(userId)) { res.status(403).json({ error: "Banned from forums" }); return; }

  const cat = await db.query<{ id: string; name: string; is_locked: boolean; auto_discord_bridge: boolean }>(
    "SELECT id, name, is_locked, auto_discord_bridge FROM forum_categories WHERE slug = $1",
    [String(req.params.slug)]
  );
  if (!cat.rows[0]) { res.status(404).json({ error: "Category not found" }); return; }
  if (cat.rows[0].is_locked && !(await isParent(discordUserId))) {
    res.status(403).json({ error: "Category is locked" }); return;
  }
  const categoryId = parseInt(cat.rows[0].id, 10);
  const categoryName = cat.rows[0].name;
  const autoDiscordBridge = cat.rows[0].auto_discord_bridge;

  if (autoDiscordBridge && parsed.data.poll) {
    res.status(400).json({ error: "Polls are not allowed in official announcements" }); return;
  }

  const last = await db.query<{ created_at: string }>(
    `SELECT created_at FROM forum_threads
     WHERE author_user_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  if (last.rows[0]) {
    const elapsed = (Date.now() - new Date(last.rows[0].created_at).getTime()) / 1000;
    if (elapsed < cooldown) {
      res.status(429).json({ error: `Wait ${Math.ceil(cooldown - elapsed)}s before posting another thread` });
      return;
    }
  }

  // Optional game tag: only store appIds the catalog actually knows, so feed
  // joins always resolve a name + art and typos don't create dead chips.
  let appId: number | null = null;
  if (parsed.data.appId) {
    const g = await db.query("SELECT 1 FROM games WHERE app_id = $1", [parsed.data.appId]);
    if (g.rows.length > 0) appId = parsed.data.appId;
  }

  const slug = slugify(title);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const t = await client.query<{ id: string }>(
      `INSERT INTO forum_threads (
         category_id, author_user_id, title, slug, last_reply_at, last_reply_user_id,
         app_id, thread_type, link_url, is_locked, is_pinned
       )
       VALUES ($1, $2, $3, $4, NOW(), $2, $5, $6, $7, $8, $9) RETURNING id`,
      [
        categoryId,
        userId,
        title,
        slug,
        appId,
        autoDiscordBridge ? "discussion" : threadType,
        autoDiscordBridge ? null : linkUrl,
        autoDiscordBridge,
        autoDiscordBridge,
      ]
    );
    const threadId = parseInt(t.rows[0].id, 10);
    const op = await client.query<{ id: string }>(
      `INSERT INTO forum_posts (thread_id, author_user_id, body, is_op)
       VALUES ($1, $2, $3, TRUE) RETURNING id`,
      [threadId, userId, body]
    );
    const opPostId = parseInt(op.rows[0].id, 10);
    await claimUploads(client, parsed.data.uploadIds, userId, opPostId);
    // Author auto-subscribes to their own thread.
    await client.query(
      `INSERT INTO forum_thread_subscriptions (user_id, thread_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, threadId]
    );
    // Optional poll attached to the thread.
    if (parsed.data.poll) {
      const opts = parsed.data.poll.options.map((o) => o.trim()).filter((o) => o.length > 0);
      if (opts.length >= 2) {
        const pr = await client.query<{ id: string }>(
          `INSERT INTO forum_polls (thread_id, question, multi, closes_at) VALUES ($1, $2, $3, $4) RETURNING id`,
          [threadId, parsed.data.poll.question.trim(), parsed.data.poll.multi ?? false, parsed.data.poll.closesAt ?? null]
        );
        const pollId = parseInt(pr.rows[0].id, 10);
        for (let i = 0; i < opts.length; i++) {
          await client.query(`INSERT INTO forum_poll_options (poll_id, position, label) VALUES ($1, $2, $3)`, [pollId, i, opts[i]]);
        }
      }
    }
    await client.query("COMMIT");

    void recordEvent({
      eventType: "forum_thread_created",
      actorDiscordUserId: discordUserId,
      payload: { threadId, categoryId, title, slug, threadType },
    });

    // Notify anyone @mentioned in the opening post.
    void notifyForPost({ threadId, postId: opPostId, body, authorUserId: userId }).catch(() => undefined);

    // Unfurl the primary link (cached) — fire-and-forget, never blocks/fails
    // the response.
    if (linkUrl) void getOrFetchLinkPreview(linkUrl).catch(() => undefined);

    // Announce to Discord as Nuggie — only if the author opted in for this post
    // (and a webhook is configured). Fire-and-forget; never blocks the response.
    if (parsed.data.announce && !autoDiscordBridge) {
      void (async () => {
        const a = await db.query<{ display_name: string }>(
          "SELECT COALESCE(dp.global_name, dp.username) AS display_name FROM discord_profiles dp WHERE dp.user_id = $1",
          [userId]
        ).catch(() => null);
        await announceNewThread({
          threadId,
          title,
          threadType,
          categoryName,
          authorName: a?.rows[0]?.display_name ?? "someone",
          bodyPreview: body,
          linkUrl,
        });
      })();
    }

    if (autoDiscordBridge) {
      void (async () => {
        const a = await db.query<{ display_name: string }>(
          "SELECT COALESCE(dp.global_name, dp.username) AS display_name FROM discord_profiles dp WHERE dp.user_id = $1",
          [userId]
        ).catch(() => null);
        await enqueueOfficialAnnouncementCreate({
          threadId,
          title,
          bodyPreview: body,
          authorName: a?.rows[0]?.display_name ?? "Island crew",
        });
      })();
    }

    const reward = autoDiscordBridge ? 0 : getSetting("forums_thread_nuggies", 5);
    if (reward > 0) {
      void applyTransaction({
        discordUserId,
        amount: reward,
        type: NUGGIES_TX_TYPE.earn,
        reason: formatNuggiesReason({
          type: NUGGIES_TX_TYPE.earn,
          amount: reward,
          metadata: { threadTitle: title.slice(0, 50) },
        }),
        referenceId: `forum_thread:${threadId}`,
      }).catch(() => undefined);
    }

    res.json({ threadId, slug });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// ── GET /forums/threads/:id ────────────────────────────────────────────────

forumsRouter.get("/threads/:id", requireSession, async (req, res) => {
  const threadId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(threadId)) { res.status(400).json({ error: "Invalid thread id" }); return; }

  const viewerUserId = await resolveInternalId(String(res.locals.userId));

  const t = await db.query<{
    id: string; category_id: string; title: string; slug: string;
    thread_type: string; link_url: string | null;
    is_pinned: boolean; is_locked: boolean; is_deleted: boolean;
    view_count: number; reply_count: number; created_at: string; updated_at: string;
    author_discord_id: string; author_username: string; author_display_name: string; author_avatar_url: string | null;
    category_slug: string; category_name: string; category_icon: string; category_accent: string;
    app_id: number | null; game_name: string | null; game_image: string | null;
  } & LinkPreviewRow>(
    `SELECT t.id, t.category_id, t.title, t.slug, t.thread_type, t.link_url,
            t.is_pinned, t.is_locked, t.is_deleted,
            t.view_count, t.reply_count, t.created_at, t.updated_at, t.app_id,
            g.name AS game_name, g.header_image_url AS game_image,
            u.discord_user_id AS author_discord_id,
            dp.username AS author_username,
            COALESCE(dp.global_name, dp.username) AS author_display_name,
            dp.avatar_url AS author_avatar_url,
            c.slug AS category_slug, c.name AS category_name, c.icon AS category_icon, c.accent_color AS category_accent,
            ${LINK_PREVIEW_SELECT}
     FROM forum_threads t
     INNER JOIN users u ON u.id = t.author_user_id
     INNER JOIN discord_profiles dp ON dp.user_id = t.author_user_id
     INNER JOIN forum_categories c ON c.id = t.category_id
     LEFT JOIN games g ON g.app_id = t.app_id
     ${LINK_PREVIEW_JOIN}
     WHERE t.id = $1`,
    [threadId]
  );
  if (!t.rows[0] || t.rows[0].is_deleted) { res.status(404).json({ error: "Thread not found" }); return; }

  // increment view count (best-effort, fire and forget)
  db.query("UPDATE forum_threads SET view_count = view_count + 1 WHERE id = $1", [threadId]).catch(() => undefined);

  const posts = await fetchPosts(BigInt(threadId), viewerUserId);
  const baseUrl = reqBaseUrl(req);

  // Subscription state + unread divider, then mark the thread read up to its
  // latest post.
  let subscribed = false;
  let firstUnreadPostId: number | null = null;
  if (viewerUserId) {
    const [sub, prev] = await Promise.all([
      db.query("SELECT 1 FROM forum_thread_subscriptions WHERE user_id = $1 AND thread_id = $2", [viewerUserId, threadId]),
      db.query<{ last_read_post_id: string | null }>(
        "SELECT last_read_post_id FROM forum_thread_reads WHERE user_id = $1 AND thread_id = $2",
        [viewerUserId, threadId]
      ),
    ]);
    subscribed = sub.rows.length > 0;
    const prevLast = prev.rows[0]?.last_read_post_id ? parseInt(prev.rows[0].last_read_post_id, 10) : 0;
    const firstUnread = posts.find((pp) => !pp.is_deleted && parseInt(pp.id, 10) > prevLast);
    firstUnreadPostId = firstUnread ? parseInt(firstUnread.id, 10) : null;
    const lastPostId = posts.length ? parseInt(posts[posts.length - 1].id, 10) : null;
    await db.query(
      `INSERT INTO forum_thread_reads (user_id, thread_id, last_read_post_id, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, thread_id) DO UPDATE SET last_read_post_id = EXCLUDED.last_read_post_id, updated_at = NOW()`,
      [viewerUserId, threadId, lastPostId]
    ).catch(() => undefined);
  }

  const poll = await fetchPoll(threadId, viewerUserId);

  const row = t.rows[0];
  res.json({
    thread: {
      id: parseInt(row.id, 10),
      categoryId: parseInt(row.category_id, 10),
      categorySlug: row.category_slug,
      categoryName: row.category_name,
      categoryIcon: row.category_icon,
      categoryAccent: row.category_accent,
      title: row.title,
      slug: row.slug,
      threadType: row.thread_type,
      linkUrl: row.link_url,
      linkPreview: row.link_url ? buildLinkPreview(row) : null,
      poll,
      subscribed,
      firstUnreadPostId,
      isPinned: row.is_pinned,
      isLocked: row.is_locked,
      viewCount: row.view_count,
      replyCount: row.reply_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      author: {
        discordUserId: row.author_discord_id,
        username: row.author_username,
        displayName: row.author_display_name,
        avatarUrl: row.author_avatar_url,
      },
      game: row.app_id && row.game_name
        ? { appId: row.app_id, name: row.game_name, headerImageUrl: row.game_image }
        : null,
    },
    posts: posts.map((pr) => serializePost(pr, baseUrl)),
  });
});

// ── POST /forums/threads/:id/posts ──────────────────────────────────────────

const replySchema = z.object({
  body: z.string().min(1),
  uploadIds: z.array(z.number().int().positive()).max(10).optional(),
});

forumsRouter.post("/threads/:id/posts", requireSession, async (req, res) => {
  if (!isEnabled()) { res.status(503).json({ error: "Forums disabled" }); return; }
  await ensureSettingsLoaded();

  const parsed = replySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const threadId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(threadId)) { res.status(400).json({ error: "Invalid thread id" }); return; }

  const bodyMin = getSetting("forums_post_min_chars", 2);
  const bodyMax = getSetting("forums_post_max_chars", 8000);
  const cooldown = getSetting("forums_reply_cooldown_secs", 5);

  const body = parsed.data.body.trim();
  if (body.length < bodyMin || body.length > bodyMax) {
    res.status(400).json({ error: `Post must be ${bodyMin}–${bodyMax} characters` }); return;
  }

  const discordUserId = String(res.locals.userId);
  const userId = await resolveInternalId(discordUserId);
  if (!userId) { res.status(404).json({ error: "User not found" }); return; }
  if (await isBanned(userId)) { res.status(403).json({ error: "Banned from forums" }); return; }

  const t = await db.query<{ id: string; is_locked: boolean; is_deleted: boolean; title: string }>(
    "SELECT id, is_locked, is_deleted, title FROM forum_threads WHERE id = $1",
    [threadId]
  );
  if (!t.rows[0] || t.rows[0].is_deleted) { res.status(404).json({ error: "Thread not found" }); return; }
  if (t.rows[0].is_locked && !(await isParent(discordUserId))) {
    res.status(403).json({ error: "Thread is locked" }); return;
  }

  const last = await db.query<{ created_at: string }>(
    `SELECT created_at FROM forum_posts WHERE author_user_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  if (last.rows[0]) {
    const elapsed = (Date.now() - new Date(last.rows[0].created_at).getTime()) / 1000;
    if (elapsed < cooldown) {
      res.status(429).json({ error: `Wait ${Math.ceil(cooldown - elapsed)}s before replying again` });
      return;
    }
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const p = await client.query<{ id: string }>(
      `INSERT INTO forum_posts (thread_id, author_user_id, body, is_op)
       VALUES ($1, $2, $3, FALSE) RETURNING id`,
      [threadId, userId, body]
    );
    await client.query(
      `UPDATE forum_threads
       SET reply_count = reply_count + 1,
           last_reply_at = NOW(),
           last_reply_user_id = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [userId, threadId]
    );
    const replyPostId = parseInt(p.rows[0].id, 10);
    await claimUploads(client, parsed.data.uploadIds, userId, replyPostId);
    // Replier auto-subscribes so they're notified of further replies.
    await client.query(
      `INSERT INTO forum_thread_subscriptions (user_id, thread_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, threadId]
    );
    await client.query("COMMIT");

    void recordEvent({
      eventType: "forum_reply_created",
      actorDiscordUserId: discordUserId,
      payload: { threadId, postId: replyPostId, threadTitle: t.rows[0].title },
    });

    // Notify mentioned users + thread subscribers.
    void notifyForPost({ threadId, postId: replyPostId, body, authorUserId: userId }).catch(() => undefined);

    const reward = getSetting("forums_reply_nuggies", 1);
    if (reward > 0) {
      void applyTransaction({
        discordUserId,
        amount: reward,
        type: NUGGIES_TX_TYPE.earn,
        reason: formatNuggiesReason({
          type: NUGGIES_TX_TYPE.earn,
          amount: reward,
          metadata: { threadTitle: t.rows[0].title.slice(0, 50), isForumReply: true },
        }),
        referenceId: `forum_reply:${parseInt(p.rows[0].id, 10)}`,
      }).catch(() => undefined);
    }

    res.json({ postId: parseInt(p.rows[0].id, 10) });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// ── PATCH /forums/posts/:id ────────────────────────────────────────────────

const editPostSchema = z.object({ body: z.string().min(1) });

forumsRouter.patch("/posts/:id", requireSession, async (req, res) => {
  await ensureSettingsLoaded();
  const parsed = editPostSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const postId = parseInt(String(req.params.id), 10);
  const discordUserId = String(res.locals.userId);
  const userId = await resolveInternalId(discordUserId);
  if (!userId) { res.status(404).json({ error: "User not found" }); return; }

  const p = await db.query<{
    author_user_id: string;
    is_deleted: boolean;
    is_op: boolean;
    thread_id: string;
  }>(
    "SELECT author_user_id, is_deleted, is_op, thread_id FROM forum_posts WHERE id = $1",
    [postId]
  );
  if (!p.rows[0] || p.rows[0].is_deleted) { res.status(404).json({ error: "Post not found" }); return; }

  const isAuthor = String(p.rows[0].author_user_id) === String(userId);
  const isMod = await isParent(discordUserId);
  if (!isAuthor && !isMod) { res.status(403).json({ error: "Not authorized" }); return; }

  const bodyMin = getSetting("forums_post_min_chars", 2);
  const bodyMax = getSetting("forums_post_max_chars", 8000);
  const body = parsed.data.body.trim();
  if (body.length < bodyMin || body.length > bodyMax) {
    res.status(400).json({ error: `Post must be ${bodyMin}–${bodyMax} characters` }); return;
  }

  await db.query(
    "UPDATE forum_posts SET body = $1, edited_at = NOW() WHERE id = $2",
    [body, postId]
  );

  if (isMod && !isAuthor) {
    await db.query(
      `INSERT INTO forum_mod_log (moderator_user_id, action, target_post_id, notes)
       VALUES ($1, 'edit_post', $2, $3)`,
      [userId, postId, "Edited by moderator"]
    );
  }

  if (p.rows[0].is_op) {
    void (async () => {
      const threadId = parseInt(p.rows[0].thread_id, 10);
      const row = await db.query<{
        title: string;
        discord_announcement_message_id: string | null;
        discord_announcement_channel_id: string | null;
        auto_discord_bridge: boolean;
      }>(
        `SELECT t.title,
                t.discord_announcement_message_id,
                t.discord_announcement_channel_id,
                c.auto_discord_bridge
         FROM forum_threads t
         INNER JOIN forum_categories c ON c.id = t.category_id
         WHERE t.id = $1 AND t.is_deleted = FALSE`,
        [threadId]
      ).catch(() => null);
      const thread = row?.rows[0];
      if (
        !thread?.auto_discord_bridge ||
        !thread.discord_announcement_message_id ||
        !thread.discord_announcement_channel_id
      ) {
        return;
      }
      const a = await db.query<{ display_name: string }>(
        "SELECT COALESCE(dp.global_name, dp.username) AS display_name FROM discord_profiles dp WHERE dp.user_id = $1",
        [userId]
      ).catch(() => null);
      await enqueueOfficialAnnouncementUpdate({
        threadId,
        title: thread.title,
        bodyPreview: body,
        authorName: a?.rows[0]?.display_name ?? "Island crew",
        messageId: thread.discord_announcement_message_id,
        channelId: thread.discord_announcement_channel_id,
      });
    })();
  }

  res.json({ ok: true });
});

// ── DELETE /forums/posts/:id ───────────────────────────────────────────────

forumsRouter.delete("/posts/:id", requireSession, async (req, res) => {
  const postId = parseInt(String(req.params.id), 10);
  const discordUserId = String(res.locals.userId);
  const userId = await resolveInternalId(discordUserId);
  if (!userId) { res.status(404).json({ error: "User not found" }); return; }

  const p = await db.query<{ author_user_id: string; thread_id: string; is_op: boolean; is_deleted: boolean }>(
    "SELECT author_user_id, thread_id, is_op, is_deleted FROM forum_posts WHERE id = $1",
    [postId]
  );
  if (!p.rows[0] || p.rows[0].is_deleted) { res.status(404).json({ error: "Post not found" }); return; }

  const isAuthor = String(p.rows[0].author_user_id) === String(userId);
  const isMod = await isParent(discordUserId);
  if (!isAuthor && !isMod) { res.status(403).json({ error: "Not authorized" }); return; }

  if (p.rows[0].is_op) {
    if (!isMod) { res.status(403).json({ error: "Only mods can delete the OP — delete the thread instead" }); return; }
    await db.query("UPDATE forum_threads SET is_deleted = TRUE WHERE id = $1", [parseInt(p.rows[0].thread_id, 10)]);
  }

  await db.query("UPDATE forum_posts SET is_deleted = TRUE WHERE id = $1", [postId]);

  if (!p.rows[0].is_op) {
    await db.query(
      `UPDATE forum_threads
       SET reply_count = GREATEST(reply_count - 1, 0)
       WHERE id = $1`,
      [parseInt(p.rows[0].thread_id, 10)]
    );
  }

  if (isMod && !isAuthor) {
    await db.query(
      `INSERT INTO forum_mod_log (moderator_user_id, action, target_post_id, target_thread_id)
       VALUES ($1, 'delete_post', $2, $3)`,
      [userId, postId, parseInt(p.rows[0].thread_id, 10)]
    );
  }

  res.json({ ok: true });
});

// ── POST /forums/posts/:id/react ───────────────────────────────────────────

const reactSchema = z.object({ reaction: z.enum(REACTIONS).optional() });

forumsRouter.post("/posts/:id/react", requireSession, async (req, res) => {
  const postId = parseInt(String(req.params.id), 10);
  const parsed = reactSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "Invalid reaction" }); return; }
  // Default to 'nug' so a bare POST (legacy client) still toggles the primary.
  const reaction: ReactionKey = parsed.data.reaction ?? "nug";
  if (!REACTION_SET.has(reaction)) { res.status(400).json({ error: "Invalid reaction" }); return; }

  const discordUserId = String(res.locals.userId);
  const userId = await resolveInternalId(discordUserId);
  if (!userId) { res.status(404).json({ error: "User not found" }); return; }
  if (await isBanned(userId)) { res.status(403).json({ error: "Banned from forums" }); return; }

  // Toggle this specific reaction for this user. Legacy 'like' rows count as
  // 'nug': clear them too so the user's nug state stays single-valued.
  const exists = await db.query(
    `SELECT 1 FROM forum_post_reactions
     WHERE post_id = $1 AND user_id = $2
       AND (${REACTION_NORM}) = $3`,
    [postId, userId, reaction]
  );
  if (exists.rows.length > 0) {
    await db.query(
      `DELETE FROM forum_post_reactions
       WHERE post_id = $1 AND user_id = $2 AND (${REACTION_NORM}) = $3`,
      [postId, userId, reaction]
    );
    res.json({ reacted: false, reaction });
    return;
  }
  await db.query(
    `INSERT INTO forum_post_reactions (post_id, user_id, reaction) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [postId, userId, reaction]
  );
  res.json({ reacted: true, reaction });

  // Activity feed: announce a post the first time its reactions reach the
  // configured milestone. Fires once (count === threshold), post-response.
  void (async () => {
    const milestone = getSetting("forums_reaction_milestone", 5);
    if (milestone <= 0) return;
    const cnt = await db.query<{ c: string }>(
      "SELECT COUNT(*)::text AS c FROM forum_post_reactions WHERE post_id = $1",
      [postId]
    );
    if (parseInt(cnt.rows[0]?.c ?? "0", 10) !== milestone) return;
    const info = await db.query<{ author_discord: string | null; thread_id: string; thread_title: string }>(
      `SELECT u.discord_user_id AS author_discord, t.id AS thread_id, t.title AS thread_title
       FROM forum_posts p
       JOIN forum_threads t ON t.id = p.thread_id
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p.id = $1`,
      [postId]
    );
    const row = info.rows[0];
    if (!row) return;
    await recordEvent({
      eventType: "forum.reactions_milestone",
      actorDiscordUserId: row.author_discord,
      payload: {
        threadId: parseInt(row.thread_id, 10),
        postId,
        threadTitle: row.thread_title,
        count: milestone,
        reaction
      }
    });
  })().catch(() => undefined);
});

// ── POST /forums/uploads ───────────────────────────────────────────────────
// Multipart image upload. The buffer is sniffed + re-encoded to WebP (EXIF
// stripped) before it is written; the row is claimed when a post is created.

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: () => getSetting("forums_upload_per_hour", 20),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIp,
  message: { error: "Too many uploads — try again later" },
});

// multer is constructed per request so the size limit honors the live setting.
function uploadMiddleware(req: Request, res: Response, next: NextFunction) {
  const maxMb = getSetting("forums_upload_max_mb", 8);
  const mw = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxMb * 1024 * 1024, files: 1 } }).single("file");
  mw(req, res, (err: unknown) => {
    if (err) {
      const code = (err as { code?: string }).code;
      res.status(400).json({ error: code === "LIMIT_FILE_SIZE" ? `Image too large (max ${maxMb}MB)` : "Upload failed" });
      return;
    }
    next();
  });
}

forumsRouter.post("/uploads", requireSession, uploadLimiter, uploadMiddleware, async (req, res) => {
  if (!isEnabled()) { res.status(503).json({ error: "Forums disabled" }); return; }
  await ensureSettingsLoaded();

  const userId = await resolveInternalId(String(res.locals.userId));
  if (!userId) { res.status(404).json({ error: "User not found" }); return; }
  if (await isBanned(userId)) { res.status(403).json({ error: "Banned from forums" }); return; }

  const file = req.file;
  if (!file?.buffer?.length) { res.status(400).json({ error: "No image provided" }); return; }

  try {
    const img = await processForumImage(file.buffer);
    const ins = await db.query<{ id: string }>(
      `INSERT INTO forum_uploads (uploader_user_id, file_path, thumb_path, width, height, bytes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, img.filePath, img.thumbPath, img.width, img.height, img.bytes]
    );
    const base = reqBaseUrl(req);
    res.json({
      id: parseInt(ins.rows[0].id, 10),
      url: `${base}/uploads/${img.filePath}`,
      thumbUrl: `${base}/uploads/${img.thumbPath}`,
      width: img.width,
      height: img.height,
    });
  } catch {
    res.status(400).json({ error: "Unsupported or corrupt image" });
  }
});

// ── POST /forums/posts/:id/report ──────────────────────────────────────────
// ── POST /forums/threads/:id/report ────────────────────────────────────────

const reportSchema = z.object({ reason: z.string().min(1).max(500) });

forumsRouter.post("/posts/:id/report", requireSession, async (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const postId = parseInt(String(req.params.id), 10);
  const userId = await resolveInternalId(String(res.locals.userId));
  if (!userId) { res.status(404).json({ error: "User not found" }); return; }

  const p = await db.query<{ thread_id: string }>(
    "SELECT thread_id FROM forum_posts WHERE id = $1",
    [postId]
  );
  if (!p.rows[0]) { res.status(404).json({ error: "Post not found" }); return; }

  await db.query(
    `INSERT INTO forum_reports (post_id, thread_id, reporter_user_id, reason)
     VALUES ($1, $2, $3, $4)`,
    [postId, parseInt(p.rows[0].thread_id, 10), userId, parsed.data.reason.trim()]
  );
  res.json({ ok: true });
});

forumsRouter.post("/threads/:id/report", requireSession, async (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const threadId = parseInt(String(req.params.id), 10);
  const userId = await resolveInternalId(String(res.locals.userId));
  if (!userId) { res.status(404).json({ error: "User not found" }); return; }

  await db.query(
    `INSERT INTO forum_reports (thread_id, reporter_user_id, reason)
     VALUES ($1, $2, $3)`,
    [threadId, userId, parsed.data.reason.trim()]
  );
  res.json({ ok: true });
});

// ── PATCH /forums/threads/:id (mod-only actions) ───────────────────────────

const threadModSchema = z.object({
  isPinned: z.boolean().optional(),
  isLocked: z.boolean().optional(),
  categoryId: z.number().int().positive().optional(),
  title: z.string().min(3).optional(),
});

forumsRouter.patch("/threads/:id", requireSession, async (req, res) => {
  const parsed = threadModSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const threadId = parseInt(String(req.params.id), 10);
  const discordUserId = String(res.locals.userId);
  const userId = await resolveInternalId(discordUserId);
  if (!userId) { res.status(404).json({ error: "User not found" }); return; }

  const t = await db.query<{ author_user_id: string }>(
    "SELECT author_user_id FROM forum_threads WHERE id = $1",
    [threadId]
  );
  if (!t.rows[0]) { res.status(404).json({ error: "Thread not found" }); return; }

  const isAuthor = String(t.rows[0].author_user_id) === String(userId);
  const isMod = await isParent(discordUserId);

  // Title edit allowed for author or mod. Pin/lock/move are mod-only.
  if (parsed.data.isPinned !== undefined || parsed.data.isLocked !== undefined || parsed.data.categoryId !== undefined) {
    if (!isMod) { res.status(403).json({ error: "Mod only" }); return; }
  } else if (!isAuthor && !isMod) {
    res.status(403).json({ error: "Not authorized" }); return;
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (parsed.data.title !== undefined) { fields.push(`title = $${i++}`); values.push(parsed.data.title.trim()); }
  if (parsed.data.isPinned !== undefined) { fields.push(`is_pinned = $${i++}`); values.push(parsed.data.isPinned); }
  if (parsed.data.isLocked !== undefined) { fields.push(`is_locked = $${i++}`); values.push(parsed.data.isLocked); }
  if (parsed.data.categoryId !== undefined) { fields.push(`category_id = $${i++}`); values.push(parsed.data.categoryId); }
  if (fields.length === 0) { res.json({ ok: true }); return; }

  fields.push(`updated_at = NOW()`);
  values.push(threadId);
  await db.query(`UPDATE forum_threads SET ${fields.join(", ")} WHERE id = $${i}`, values);

  if (isMod) {
    const action = parsed.data.isPinned !== undefined
      ? (parsed.data.isPinned ? "pin_thread" : "unpin_thread")
      : parsed.data.isLocked !== undefined
        ? (parsed.data.isLocked ? "lock_thread" : "unlock_thread")
        : parsed.data.categoryId !== undefined
          ? "move_thread"
          : "edit_thread";
    await db.query(
      `INSERT INTO forum_mod_log (moderator_user_id, action, target_thread_id)
       VALUES ($1, $2, $3)`,
      [userId, action, threadId]
    );
  }

  res.json({ ok: true });
});

// ── DELETE /forums/threads/:id (mod) ───────────────────────────────────────

forumsRouter.delete("/threads/:id", requireSession, async (req, res) => {
  const threadId = parseInt(String(req.params.id), 10);
  const discordUserId = String(res.locals.userId);
  const userId = await resolveInternalId(discordUserId);
  if (!userId) { res.status(404).json({ error: "User not found" }); return; }

  const t = await db.query<{ author_user_id: string }>(
    "SELECT author_user_id FROM forum_threads WHERE id = $1",
    [threadId]
  );
  if (!t.rows[0]) { res.status(404).json({ error: "Thread not found" }); return; }

  const isAuthor = String(t.rows[0].author_user_id) === String(userId);
  const isMod = await isParent(discordUserId);
  if (!isAuthor && !isMod) { res.status(403).json({ error: "Not authorized" }); return; }

  await db.query("UPDATE forum_threads SET is_deleted = TRUE WHERE id = $1", [threadId]);

  if (isMod) {
    await db.query(
      `INSERT INTO forum_mod_log (moderator_user_id, action, target_thread_id)
       VALUES ($1, 'delete_thread', $2)`,
      [userId, threadId]
    );
  }

  res.json({ ok: true });
});

// ── GET /forums/threads (unified feed) ─────────────────────────────────────
// Query: ?sort=latest|top|unanswered|mine&category=<slug>&limit=&offset=

forumsRouter.get("/threads", requireSession, async (req, res) => {
  const sort = String(req.query.sort ?? "latest");
  const categorySlug = req.query.category ? String(req.query.category) : null;
  const typeFilterRaw = req.query.type ? String(req.query.type) : null;
  const typeFilter = typeFilterRaw && (THREAD_TYPES as readonly string[]).includes(typeFilterRaw) ? typeFilterRaw : null;
  const limit = Math.min(parseInt(String(req.query.limit ?? "30"), 10) || 30, 100);
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

  const viewerUserId = await resolveInternalId(String(res.locals.userId));

  const where: string[] = ["t.is_deleted = FALSE"];
  const params: unknown[] = [];
  let p = 0;

  // Viewer id powers the unread join (param reserved up front so it's stable).
  p++; params.push(viewerUserId ?? -1);
  const viewerParam = p;

  if (categorySlug) {
    p++; where.push(`c.slug = $${p}`); params.push(categorySlug);
  }
  if (typeFilter) {
    p++; where.push(`t.thread_type = $${p}`); params.push(typeFilter);
  }
  if (sort === "unanswered") {
    where.push("t.reply_count = 0");
  }
  if (sort === "mine") {
    if (!viewerUserId) { res.json({ threads: [], total: 0, sort, limit, offset }); return; }
    p++; where.push(`t.author_user_id = $${p}`); params.push(viewerUserId);
  }

  let orderBy = "t.is_pinned DESC, COALESCE(t.last_reply_at, t.created_at) DESC";
  if (sort === "top") {
    orderBy = "(t.reply_count * 3 + t.view_count) DESC, t.created_at DESC";
  } else if (sort === "unanswered") {
    orderBy = "t.created_at DESC";
  } else if (sort === "mine") {
    orderBy = "t.created_at DESC";
  }

  p++; params.push(limit);
  const limitParam = p;
  p++; params.push(offset);
  const offsetParam = p;

  const sql = `
    SELECT t.id, t.title, t.slug, t.thread_type, t.link_url, t.is_pinned, t.is_locked, t.view_count, t.reply_count,
           t.created_at, t.last_reply_at, t.app_id,
           g.name AS game_name, g.header_image_url AS game_image,
           c.slug AS category_slug, c.name AS category_name, c.icon AS category_icon, c.accent_color AS category_accent,
           u.discord_user_id AS author_discord_id,
           dp.username AS author_username,
           COALESCE(dp.global_name, dp.username) AS author_display_name,
           dp.avatar_url AS author_avatar_url,
           COALESCE(ldp.global_name, ldp.username) AS last_user_display,
           ldp.avatar_url AS last_user_avatar,
           ${LINK_PREVIEW_SELECT},
           (tr.thread_id IS NOT NULL AND t.last_reply_at IS NOT NULL AND t.last_reply_at > tr.updated_at) AS unread,
           (SELECT json_build_object('file_path', fu.file_path, 'thumb_path', fu.thumb_path)
              FROM forum_uploads fu
              INNER JOIN forum_posts op ON op.id = fu.post_id
              WHERE op.thread_id = t.id AND op.is_op = TRUE AND op.is_deleted = FALSE
              ORDER BY fu.id ASC LIMIT 1) AS cover
    FROM forum_threads t
    INNER JOIN forum_categories c ON c.id = t.category_id
    INNER JOIN users u ON u.id = t.author_user_id
    INNER JOIN discord_profiles dp ON dp.user_id = t.author_user_id
    LEFT JOIN discord_profiles ldp ON ldp.user_id = t.last_reply_user_id
    LEFT JOIN games g ON g.app_id = t.app_id
    LEFT JOIN forum_thread_reads tr ON tr.thread_id = t.id AND tr.user_id = $${viewerParam}
    ${LINK_PREVIEW_JOIN}
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderBy}
    LIMIT $${limitParam} OFFSET $${offsetParam}
  `;

  const baseUrl = reqBaseUrl(req);
  const r = await db.query<{
    id: string; title: string; slug: string; thread_type: string; link_url: string | null;
    is_pinned: boolean; is_locked: boolean;
    view_count: number; reply_count: number;
    created_at: string; last_reply_at: string | null;
    app_id: number | null; game_name: string | null; game_image: string | null;
    category_slug: string; category_name: string; category_icon: string; category_accent: string;
    author_discord_id: string; author_username: string; author_display_name: string; author_avatar_url: string | null;
    last_user_display: string | null; last_user_avatar: string | null;
    cover: { file_path: string; thumb_path: string } | null;
    unread: boolean;
  } & LinkPreviewRow>(sql, params);

  res.json({
    threads: r.rows.map((row) => ({
      id: parseInt(row.id, 10),
      title: row.title,
      slug: row.slug,
      threadType: row.thread_type,
      linkUrl: row.link_url,
      linkPreview: row.link_url ? buildLinkPreview(row) : null,
      coverImage: row.cover
        ? { url: `${baseUrl}/uploads/${row.cover.file_path}`, thumbUrl: `${baseUrl}/uploads/${row.cover.thumb_path}` }
        : null,
      unread: row.unread === true,
      isPinned: row.is_pinned,
      isLocked: row.is_locked,
      viewCount: row.view_count,
      replyCount: row.reply_count,
      createdAt: row.created_at,
      lastReplyAt: row.last_reply_at,
      categorySlug: row.category_slug,
      categoryName: row.category_name,
      categoryIcon: row.category_icon,
      categoryAccent: row.category_accent,
      author: {
        discordUserId: row.author_discord_id,
        username: row.author_username,
        displayName: row.author_display_name,
        avatarUrl: row.author_avatar_url,
      },
      lastReplyUser: row.last_user_display
        ? { displayName: row.last_user_display, avatarUrl: row.last_user_avatar }
        : null,
      game: row.app_id && row.game_name
        ? { appId: row.app_id, name: row.game_name, headerImageUrl: row.game_image }
        : null,
    })),
    sort,
    limit,
    offset,
  });
});

// ── GET /forums/stats ──────────────────────────────────────────────────────

forumsRouter.get("/stats", requireSession, async (_req, res) => {
  const viewerUserId = await resolveInternalId(String(res.locals.userId));

  const [counts, topAuthors, mine, typeCounts] = await Promise.all([
    db.query<{ threads: string; posts: string; categories: string; today_posts: string }>(
      `SELECT
         (SELECT COUNT(*)::text FROM forum_threads WHERE is_deleted = FALSE) AS threads,
         (SELECT COUNT(*)::text FROM forum_posts WHERE is_deleted = FALSE) AS posts,
         (SELECT COUNT(*)::text FROM forum_categories) AS categories,
         (SELECT COUNT(*)::text FROM forum_posts WHERE is_deleted = FALSE AND created_at > NOW() - INTERVAL '1 day') AS today_posts`
    ),
    db.query<{ display_name: string; avatar_url: string | null; post_count: string }>(
      `SELECT COALESCE(dp.global_name, dp.username) AS display_name, dp.avatar_url, COUNT(*)::text AS post_count
       FROM forum_posts p
       INNER JOIN discord_profiles dp ON dp.user_id = p.author_user_id
       WHERE p.is_deleted = FALSE
       GROUP BY COALESCE(dp.global_name, dp.username), dp.avatar_url
       ORDER BY COUNT(*) DESC
       LIMIT 5`
    ),
    viewerUserId
      ? db.query<{ thread_count: string; post_count: string; reactions_given: string }>(
          `SELECT
             (SELECT COUNT(*)::text FROM forum_threads WHERE author_user_id = $1 AND is_deleted = FALSE) AS thread_count,
             (SELECT COUNT(*)::text FROM forum_posts   WHERE author_user_id = $1 AND is_deleted = FALSE) AS post_count,
             (SELECT COUNT(*)::text FROM forum_post_reactions WHERE user_id = $1) AS reactions_given`,
          [viewerUserId]
        )
      : Promise.resolve({ rows: [{ thread_count: "0", post_count: "0", reactions_given: "0" }] }),
    db.query<{ thread_type: string; count: string }>(
      `SELECT thread_type, COUNT(*)::text AS count
       FROM forum_threads WHERE is_deleted = FALSE
       GROUP BY thread_type`
    ),
  ]);

  const typeCountMap: Record<string, number> = {};
  for (const row of typeCounts.rows) typeCountMap[row.thread_type] = parseInt(row.count, 10);

  res.json({
    threadsTotal: parseInt(counts.rows[0]?.threads ?? "0", 10),
    postsTotal: parseInt(counts.rows[0]?.posts ?? "0", 10),
    categoriesTotal: parseInt(counts.rows[0]?.categories ?? "0", 10),
    postsToday: parseInt(counts.rows[0]?.today_posts ?? "0", 10),
    topAuthors: topAuthors.rows.map((r) => ({
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      postCount: parseInt(r.post_count, 10),
    })),
    mine: {
      threadCount: parseInt(mine.rows[0]?.thread_count ?? "0", 10),
      postCount: parseInt(mine.rows[0]?.post_count ?? "0", 10),
      reactionsGiven: parseInt(mine.rows[0]?.reactions_given ?? "0", 10),
    },
    typeCounts: typeCountMap,
  });
});

// ── GET /forums/recent ─────────────────────────────────────────────────────

forumsRouter.get("/recent", requireSession, async (_req, res) => {
  const r = await db.query<{
    id: string; title: string; slug: string; is_pinned: boolean; is_locked: boolean;
    reply_count: number; created_at: string; last_reply_at: string | null;
    category_slug: string; category_name: string; category_icon: string; category_accent: string;
    author_display: string; author_avatar: string | null;
  }>(
    `SELECT t.id, t.title, t.slug, t.is_pinned, t.is_locked, t.reply_count, t.created_at, t.last_reply_at,
            c.slug AS category_slug, c.name AS category_name, c.icon AS category_icon, c.accent_color AS category_accent,
            COALESCE(dp.global_name, dp.username) AS author_display, dp.avatar_url AS author_avatar
     FROM forum_threads t
     INNER JOIN forum_categories c ON c.id = t.category_id
     INNER JOIN discord_profiles dp ON dp.user_id = t.author_user_id
     WHERE t.is_deleted = FALSE
     ORDER BY COALESCE(t.last_reply_at, t.created_at) DESC
     LIMIT 25`
  );

  res.json({
    threads: r.rows.map((row) => ({
      id: parseInt(row.id, 10),
      title: row.title,
      slug: row.slug,
      isPinned: row.is_pinned,
      isLocked: row.is_locked,
      replyCount: row.reply_count,
      createdAt: row.created_at,
      lastReplyAt: row.last_reply_at,
      categorySlug: row.category_slug,
      categoryName: row.category_name,
      categoryIcon: row.category_icon,
      categoryAccent: row.category_accent,
      author: { displayName: row.author_display, avatarUrl: row.author_avatar },
    })),
  });
});

// ── GET /forums/resources ──────────────────────────────────────────────────
// The resource/recommendation shelf: link-first threads for the library view.

forumsRouter.get("/resources", requireSession, async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10) || 20, 50);
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

  const r = await db.query<{
    id: string; title: string; slug: string; thread_type: string; link_url: string | null;
    reply_count: number; created_at: string; last_reply_at: string | null;
    category_slug: string; category_name: string; category_icon: string; category_accent: string;
    author_display: string; author_avatar: string | null;
  } & LinkPreviewRow>(
    `SELECT t.id, t.title, t.slug, t.thread_type, t.link_url, t.reply_count, t.created_at, t.last_reply_at,
            c.slug AS category_slug, c.name AS category_name, c.icon AS category_icon, c.accent_color AS category_accent,
            COALESCE(dp.global_name, dp.username) AS author_display, dp.avatar_url AS author_avatar,
            ${LINK_PREVIEW_SELECT}
     FROM forum_threads t
     INNER JOIN forum_categories c ON c.id = t.category_id
     INNER JOIN discord_profiles dp ON dp.user_id = t.author_user_id
     ${LINK_PREVIEW_JOIN}
     WHERE t.is_deleted = FALSE AND t.thread_type IN ('resource','recommendation')
     ORDER BY COALESCE(t.last_reply_at, t.created_at) DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  res.json({
    resources: r.rows.map((row) => ({
      id: parseInt(row.id, 10),
      title: row.title,
      slug: row.slug,
      threadType: row.thread_type,
      linkUrl: row.link_url,
      linkPreview: row.link_url ? buildLinkPreview(row) : null,
      replyCount: row.reply_count,
      createdAt: row.created_at,
      lastReplyAt: row.last_reply_at,
      categorySlug: row.category_slug,
      categoryName: row.category_name,
      categoryIcon: row.category_icon,
      categoryAccent: row.category_accent,
      author: { displayName: row.author_display, avatarUrl: row.author_avatar },
    })),
  });
});

// ── GET /forums/threads/:id/related ────────────────────────────────────────
// Up to 5 related threads: same game tag first, then same category.

forumsRouter.get("/threads/:id/related", requireSession, async (req, res) => {
  const threadId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(threadId)) { res.status(400).json({ error: "Invalid thread id" }); return; }

  const base = await db.query<{ category_id: string; app_id: number | null }>(
    "SELECT category_id, app_id FROM forum_threads WHERE id = $1 AND is_deleted = FALSE",
    [threadId]
  );
  if (!base.rows[0]) { res.json({ threads: [] }); return; }
  const categoryId = parseInt(base.rows[0].category_id, 10);
  const appId = base.rows[0].app_id;

  const r = await db.query<{
    id: string; title: string; slug: string; thread_type: string; reply_count: number;
    created_at: string; last_reply_at: string | null;
    category_slug: string; category_name: string; category_icon: string; category_accent: string;
  }>(
    `SELECT t.id, t.title, t.slug, t.thread_type, t.reply_count, t.created_at, t.last_reply_at,
            c.slug AS category_slug, c.name AS category_name, c.icon AS category_icon, c.accent_color AS category_accent
     FROM forum_threads t
     INNER JOIN forum_categories c ON c.id = t.category_id
     WHERE t.is_deleted = FALSE AND t.id <> $1
       AND (($2::int IS NOT NULL AND t.app_id = $2) OR t.category_id = $3)
     ORDER BY
       (CASE WHEN $2::int IS NOT NULL AND t.app_id = $2 THEN 2 ELSE 0 END)
         + (CASE WHEN t.category_id = $3 THEN 1 ELSE 0 END) DESC,
       COALESCE(t.last_reply_at, t.created_at) DESC
     LIMIT 5`,
    [threadId, appId, categoryId]
  );

  res.json({
    threads: r.rows.map((row) => ({
      id: parseInt(row.id, 10),
      title: row.title,
      slug: row.slug,
      threadType: row.thread_type,
      replyCount: row.reply_count,
      createdAt: row.created_at,
      lastReplyAt: row.last_reply_at,
      categorySlug: row.category_slug,
      categoryName: row.category_name,
      categoryIcon: row.category_icon,
      categoryAccent: row.category_accent,
    })),
  });
});

// ── GET /forums/search?q=... ────────────────────────────────────────────────

// Highlight sentinels: control chars never present in normal text. The client
// splits on these and renders <mark> as React elements — never raw HTML.
const SEARCH_HL_START = String.fromCharCode(1);
const SEARCH_HL_END = String.fromCharCode(2);
const SEARCH_HL_OPTS = `StartSel=${SEARCH_HL_START},StopSel=${SEARCH_HL_END},MaxFragments=2,MinWords=5,MaxWords=20,FragmentDelimiter= … `;

forumsRouter.get("/search", requireSession, async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) { res.json({ threads: [] }); return; }

  // FTS over title (weighted) + post bodies, with an ILIKE-on-title safety net
  // so partial-word title matches still surface like the old behavior did.
  const r = await db.query<{
    id: string; title: string; slug: string; thread_type: string; reply_count: number;
    created_at: string; last_reply_at: string | null;
    category_slug: string; category_name: string; category_icon: string; category_accent: string;
    snippet: string | null;
  }>(
    `WITH q AS (SELECT websearch_to_tsquery('english', $1) AS query)
     SELECT t.id, t.title, t.slug, t.thread_type, t.reply_count, t.created_at, t.last_reply_at,
            c.slug AS category_slug, c.name AS category_name, c.icon AS category_icon, c.accent_color AS category_accent,
            ts_headline('english', COALESCE(bp.body, t.title), q.query, $2) AS snippet
     FROM forum_threads t
     CROSS JOIN q
     INNER JOIN forum_categories c ON c.id = t.category_id
     LEFT JOIN LATERAL (
       SELECT p.body, ts_rank(p.body_tsv, q.query) AS prank
       FROM forum_posts p
       WHERE p.thread_id = t.id AND p.is_deleted = FALSE AND p.body_tsv @@ q.query
       ORDER BY ts_rank(p.body_tsv, q.query) DESC
       LIMIT 1
     ) bp ON TRUE
     WHERE t.is_deleted = FALSE
       AND (t.title_tsv @@ q.query OR bp.body IS NOT NULL OR t.title ILIKE $3)
     ORDER BY (ts_rank(t.title_tsv, q.query) * 2 + COALESCE(bp.prank, 0)) DESC,
              COALESCE(t.last_reply_at, t.created_at) DESC
     LIMIT 30`,
    [q, SEARCH_HL_OPTS, `%${q}%`]
  );

  res.json({
    threads: r.rows.map((row) => ({
      id: parseInt(row.id, 10),
      title: row.title,
      slug: row.slug,
      threadType: row.thread_type,
      replyCount: row.reply_count,
      createdAt: row.created_at,
      lastReplyAt: row.last_reply_at,
      categorySlug: row.category_slug,
      categoryName: row.category_name,
      categoryIcon: row.category_icon,
      categoryAccent: row.category_accent,
      snippet: row.snippet,
    })),
  });
});

// ── GET /forums/members ────────────────────────────────────────────────────
// Lightweight member list for @mention autocomplete in the composer.

forumsRouter.get("/members", requireSession, async (_req, res) => {
  const r = await db.query<{ username: string; display_name: string; avatar_url: string | null }>(
    `SELECT dp.username, COALESCE(dp.global_name, dp.username) AS display_name, dp.avatar_url
     FROM discord_profiles dp
     INNER JOIN users u ON u.id = dp.user_id
     INNER JOIN guild_members gm ON gm.discord_user_id = u.discord_user_id AND gm.in_guild = TRUE
     WHERE dp.username IS NOT NULL AND dp.username <> ''
     ORDER BY display_name
     LIMIT 200`
  );
  res.json({
    members: r.rows.map((m) => ({ username: m.username, displayName: m.display_name, avatarUrl: m.avatar_url })),
  });
});

// ── Subscriptions ──────────────────────────────────────────────────────────

forumsRouter.post("/threads/:id/subscribe", requireSession, async (req, res) => {
  const threadId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(threadId)) { res.status(400).json({ error: "Invalid thread id" }); return; }
  const userId = await resolveInternalId(String(res.locals.userId));
  if (!userId) { res.status(404).json({ error: "User not found" }); return; }
  if (await isBanned(userId)) { res.status(403).json({ error: "Banned from forums" }); return; }
  await db.query(
    `INSERT INTO forum_thread_subscriptions (user_id, thread_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, threadId]
  );
  res.json({ subscribed: true });
});

forumsRouter.delete("/threads/:id/subscribe", requireSession, async (req, res) => {
  const threadId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(threadId)) { res.status(400).json({ error: "Invalid thread id" }); return; }
  const userId = await resolveInternalId(String(res.locals.userId));
  if (!userId) { res.status(404).json({ error: "User not found" }); return; }
  await db.query("DELETE FROM forum_thread_subscriptions WHERE user_id = $1 AND thread_id = $2", [userId, threadId]);
  res.json({ subscribed: false });
});

// ── Notifications ──────────────────────────────────────────────────────────

forumsRouter.get("/notifications", requireSession, async (_req, res) => {
  const userId = await resolveInternalId(String(res.locals.userId));
  if (!userId) { res.json({ items: [], unreadCount: 0 }); return; }

  const [items, unread] = await Promise.all([
    db.query<{
      id: string; type: string; thread_id: string | null; post_id: string | null;
      read_at: string | null; created_at: string;
      actor_name: string | null; actor_avatar: string | null; thread_title: string | null;
    }>(
      `SELECT n.id, n.type, n.thread_id, n.post_id, n.read_at, n.created_at,
              COALESCE(adp.global_name, adp.username) AS actor_name, adp.avatar_url AS actor_avatar,
              t.title AS thread_title
       FROM forum_notifications n
       LEFT JOIN discord_profiles adp ON adp.user_id = n.actor_user_id
       LEFT JOIN forum_threads t ON t.id = n.thread_id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [userId]
    ),
    db.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM forum_notifications WHERE user_id = $1 AND read_at IS NULL",
      [userId]
    ),
  ]);

  res.json({
    items: items.rows.map((r) => ({
      id: parseInt(r.id, 10),
      type: r.type,
      threadId: r.thread_id ? parseInt(r.thread_id, 10) : null,
      postId: r.post_id ? parseInt(r.post_id, 10) : null,
      read: r.read_at !== null,
      createdAt: r.created_at,
      actorName: r.actor_name,
      actorAvatarUrl: r.actor_avatar,
      threadTitle: r.thread_title,
    })),
    unreadCount: parseInt(unread.rows[0]?.count ?? "0", 10),
  });
});

const markReadSchema = z.object({ ids: z.array(z.number().int().positive()).optional() });

forumsRouter.post("/notifications/read", requireSession, async (req, res) => {
  const parsed = markReadSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }
  const userId = await resolveInternalId(String(res.locals.userId));
  if (!userId) { res.status(404).json({ error: "User not found" }); return; }

  if (parsed.data.ids && parsed.data.ids.length > 0) {
    await db.query(
      "UPDATE forum_notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL AND id = ANY($2::bigint[])",
      [userId, parsed.data.ids]
    );
  } else {
    await db.query("UPDATE forum_notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL", [userId]);
  }
  res.json({ ok: true });
});

// ── Poll voting ────────────────────────────────────────────────────────────

const voteSchema = z.object({ optionIds: z.array(z.number().int().positive()).max(10) });

forumsRouter.post("/polls/:id/vote", requireSession, async (req, res) => {
  const pollId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(pollId)) { res.status(400).json({ error: "Invalid poll id" }); return; }
  const parsed = voteSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const userId = await resolveInternalId(String(res.locals.userId));
  if (!userId) { res.status(404).json({ error: "User not found" }); return; }
  if (await isBanned(userId)) { res.status(403).json({ error: "Banned from forums" }); return; }

  const pr = await db.query<{ thread_id: string; multi: boolean; closes_at: string | null; thread_deleted: boolean; thread_locked: boolean }>(
    `SELECT p.thread_id, p.multi, p.closes_at, t.is_deleted AS thread_deleted, t.is_locked AS thread_locked
     FROM forum_polls p INNER JOIN forum_threads t ON t.id = p.thread_id
     WHERE p.id = $1`,
    [pollId]
  );
  if (!pr.rows[0] || pr.rows[0].thread_deleted) { res.status(404).json({ error: "Poll not found" }); return; }
  const poll = pr.rows[0];
  if (poll.thread_locked) { res.status(403).json({ error: "Thread is locked" }); return; }
  if (poll.closes_at && new Date(poll.closes_at).getTime() < Date.now()) {
    res.status(403).json({ error: "Poll is closed" }); return;
  }

  // Single-choice polls keep at most one option. Validate ids belong to the poll.
  let optionIds = poll.multi ? parsed.data.optionIds : parsed.data.optionIds.slice(0, 1);
  if (optionIds.length > 0) {
    const valid = await db.query<{ id: string }>(
      "SELECT id FROM forum_poll_options WHERE poll_id = $1 AND id = ANY($2::bigint[])",
      [pollId, optionIds]
    );
    const validSet = new Set(valid.rows.map((r) => Number(r.id)));
    optionIds = optionIds.filter((id) => validSet.has(id));
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM forum_poll_votes WHERE poll_id = $1 AND user_id = $2", [pollId, userId]);
    for (const oid of optionIds) {
      await client.query(
        "INSERT INTO forum_poll_votes (poll_id, option_id, user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        [pollId, oid, userId]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const updated = await fetchPoll(parseInt(poll.thread_id, 10), userId);
  res.json({ poll: updated });
});

// ── ADMIN ──────────────────────────────────────────────────────────────────

const adminCategorySchema = z.object({
  slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(80),
  description: z.string().max(400).optional(),
  icon: z.string().max(8).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional(),
  position: z.number().int().min(0).optional(),
  isLocked: z.boolean().optional(),
  autoDiscordBridge: z.boolean().optional(),
});

forumsRouter.post("/admin/categories", requireSession, requireParentRole, async (req, res) => {
  const parsed = adminCategorySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const { slug, name, description = "", icon = "💬", accentColor = "#3b82f6", position = 999, isLocked = false, autoDiscordBridge = false } = parsed.data;
  await db.query(
    `INSERT INTO forum_categories (slug, name, description, icon, accent_color, position, is_locked, auto_discord_bridge)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [slug, name, description, icon, accentColor, position, isLocked, autoDiscordBridge]
  );
  res.json({ ok: true });
});

const adminUpdateCategorySchema = adminCategorySchema.partial().omit({ slug: true });

forumsRouter.patch("/admin/categories/:id", requireSession, requireParentRole, async (req, res) => {
  const parsed = adminUpdateCategorySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const id = parseInt(String(req.params.id), 10);
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (parsed.data.name !== undefined) { fields.push(`name = $${i++}`); values.push(parsed.data.name); }
  if (parsed.data.description !== undefined) { fields.push(`description = $${i++}`); values.push(parsed.data.description); }
  if (parsed.data.icon !== undefined) { fields.push(`icon = $${i++}`); values.push(parsed.data.icon); }
  if (parsed.data.accentColor !== undefined) { fields.push(`accent_color = $${i++}`); values.push(parsed.data.accentColor); }
  if (parsed.data.position !== undefined) { fields.push(`position = $${i++}`); values.push(parsed.data.position); }
  if (parsed.data.isLocked !== undefined) { fields.push(`is_locked = $${i++}`); values.push(parsed.data.isLocked); }
  if (parsed.data.autoDiscordBridge !== undefined) { fields.push(`auto_discord_bridge = $${i++}`); values.push(parsed.data.autoDiscordBridge); }
  if (fields.length === 0) { res.json({ ok: true }); return; }
  values.push(id);
  await db.query(`UPDATE forum_categories SET ${fields.join(", ")} WHERE id = $${i}`, values);
  res.json({ ok: true });
});

forumsRouter.delete("/admin/categories/:id", requireSession, requireParentRole, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  await db.query("DELETE FROM forum_categories WHERE id = $1", [id]);
  res.json({ ok: true });
});

forumsRouter.get("/admin/reports", requireSession, requireParentRole, async (_req, res) => {
  const r = await db.query<{
    id: string; reason: string; status: string; created_at: string;
    post_id: string | null; thread_id: string | null;
    reporter_display: string; reporter_username: string;
    thread_title: string | null; thread_slug: string | null;
    post_body: string | null;
    target_display: string | null;
  }>(
    `SELECT r.id, r.reason, r.status, r.created_at, r.post_id, r.thread_id,
            COALESCE(dp.global_name, dp.username) AS reporter_display,
            dp.username AS reporter_username,
            t.title AS thread_title,
            t.slug AS thread_slug,
            CASE WHEN p.is_deleted THEN '[deleted]' ELSE p.body END AS post_body,
            COALESCE(tdp.global_name, tdp.username) AS target_display
     FROM forum_reports r
     INNER JOIN discord_profiles dp ON dp.user_id = r.reporter_user_id
     LEFT JOIN forum_posts p ON p.id = r.post_id
     LEFT JOIN forum_threads t ON t.id = COALESCE(r.thread_id, p.thread_id)
     LEFT JOIN discord_profiles tdp ON tdp.user_id = COALESCE(p.author_user_id, t.author_user_id)
     WHERE r.status = 'open'
     ORDER BY r.created_at DESC
     LIMIT 100`
  );

  res.json({
    reports: r.rows.map((row) => ({
      id: parseInt(row.id, 10),
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at,
      postId: row.post_id ? parseInt(row.post_id, 10) : null,
      threadId: row.thread_id ? parseInt(row.thread_id, 10) : null,
      threadTitle: row.thread_title,
      threadSlug: row.thread_slug,
      postBody: row.post_body,
      reporterDisplayName: row.reporter_display,
      reporterUsername: row.reporter_username,
      targetDisplayName: row.target_display,
    })),
  });
});

const resolveReportSchema = z.object({
  action: z.enum(["dismiss", "delete_post", "delete_thread"]),
});

forumsRouter.post("/admin/reports/:id/resolve", requireSession, requireParentRole, async (req, res) => {
  const parsed = resolveReportSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const reportId = parseInt(String(req.params.id), 10);
  const modUserId = await resolveInternalId(String(res.locals.userId));
  if (!modUserId) { res.status(404).json({ error: "Mod not found" }); return; }

  const r = await db.query<{ post_id: string | null; thread_id: string | null }>(
    "SELECT post_id, thread_id FROM forum_reports WHERE id = $1 AND status = 'open'",
    [reportId]
  );
  if (!r.rows[0]) { res.status(404).json({ error: "Report not found or already resolved" }); return; }

  const { action } = parsed.data;
  if (action === "delete_post" && r.rows[0].post_id) {
    const pid = parseInt(r.rows[0].post_id, 10);
    const post = await db.query<{ thread_id: string; is_op: boolean }>(
      "SELECT thread_id, is_op FROM forum_posts WHERE id = $1",
      [pid]
    );
    await db.query("UPDATE forum_posts SET is_deleted = TRUE WHERE id = $1", [pid]);
    if (post.rows[0]?.is_op) {
      await db.query("UPDATE forum_threads SET is_deleted = TRUE WHERE id = $1", [parseInt(post.rows[0].thread_id, 10)]);
    } else if (post.rows[0]) {
      await db.query("UPDATE forum_threads SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = $1", [parseInt(post.rows[0].thread_id, 10)]);
    }
    await db.query(
      `INSERT INTO forum_mod_log (moderator_user_id, action, target_post_id) VALUES ($1, 'delete_post', $2)`,
      [modUserId, pid]
    );
  } else if (action === "delete_thread") {
    const tid = r.rows[0].thread_id ? parseInt(r.rows[0].thread_id, 10) : null;
    if (tid) {
      await db.query("UPDATE forum_threads SET is_deleted = TRUE WHERE id = $1", [tid]);
      await db.query(
        `INSERT INTO forum_mod_log (moderator_user_id, action, target_thread_id) VALUES ($1, 'delete_thread', $2)`,
        [modUserId, tid]
      );
    }
  }

  await db.query(
    `UPDATE forum_reports
     SET status = 'resolved', resolver_user_id = $1, resolved_at = NOW(), resolution_action = $2
     WHERE id = $3`,
    [modUserId, action, reportId]
  );

  res.json({ ok: true });
});

forumsRouter.get("/admin/bans", requireSession, requireParentRole, async (_req, res) => {
  const r = await db.query<{
    user_id: string; discord_user_id: string; display_name: string; avatar_url: string | null;
    reason: string; expires_at: string | null; created_at: string;
    banned_by: string;
  }>(
    `SELECT b.user_id, u.discord_user_id, COALESCE(dp.global_name, dp.username) AS display_name, dp.avatar_url,
            b.reason, b.expires_at, b.created_at,
            COALESCE(bdp.global_name, bdp.username) AS banned_by
     FROM forum_user_bans b
     INNER JOIN users u ON u.id = b.user_id
     INNER JOIN discord_profiles dp ON dp.user_id = b.user_id
     INNER JOIN discord_profiles bdp ON bdp.user_id = b.banned_by_user_id
     ORDER BY b.created_at DESC`
  );
  res.json({
    bans: r.rows.map((row) => ({
      discordUserId: row.discord_user_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      reason: row.reason,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      bannedByDisplayName: row.banned_by,
    })),
  });
});

const banSchema = z.object({
  discordUserId: z.string().min(1),
  reason: z.string().min(1).max(400),
  expiresAt: z.string().datetime().optional(),
});

forumsRouter.post("/admin/bans", requireSession, requireParentRole, async (req, res) => {
  const parsed = banSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const modUserId = await resolveInternalId(String(res.locals.userId));
  const targetUserId = await resolveInternalId(parsed.data.discordUserId);
  if (!modUserId || !targetUserId) { res.status(404).json({ error: "User not found" }); return; }

  await db.query(
    `INSERT INTO forum_user_bans (user_id, banned_by_user_id, reason, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       banned_by_user_id = EXCLUDED.banned_by_user_id,
       reason = EXCLUDED.reason,
       expires_at = EXCLUDED.expires_at,
       created_at = NOW()`,
    [targetUserId, modUserId, parsed.data.reason, parsed.data.expiresAt ?? null]
  );
  await db.query(
    `INSERT INTO forum_mod_log (moderator_user_id, action, target_user_id, notes)
     VALUES ($1, 'ban_user', $2, $3)`,
    [modUserId, targetUserId, parsed.data.reason]
  );

  res.json({ ok: true });
});

forumsRouter.delete("/admin/bans/:discordUserId", requireSession, requireParentRole, async (req, res) => {
  const target = await resolveInternalId(String(req.params.discordUserId));
  const modUserId = await resolveInternalId(String(res.locals.userId));
  if (!target || !modUserId) { res.status(404).json({ error: "User not found" }); return; }

  await db.query("DELETE FROM forum_user_bans WHERE user_id = $1", [target]);
  await db.query(
    `INSERT INTO forum_mod_log (moderator_user_id, action, target_user_id)
     VALUES ($1, 'unban_user', $2)`,
    [modUserId, target]
  );
  res.json({ ok: true });
});

forumsRouter.get("/admin/mod-log", requireSession, requireParentRole, async (_req, res) => {
  const r = await db.query<{
    id: string; action: string; notes: string | null; created_at: string;
    mod_display: string;
    target_thread_title: string | null; target_thread_id: string | null;
    target_post_id: string | null;
    target_user_display: string | null;
  }>(
    `SELECT l.id, l.action, l.notes, l.created_at,
            COALESCE(mdp.global_name, mdp.username) AS mod_display,
            t.title AS target_thread_title, t.id::text AS target_thread_id,
            l.target_post_id::text AS target_post_id,
            COALESCE(tudp.global_name, tudp.username) AS target_user_display
     FROM forum_mod_log l
     INNER JOIN discord_profiles mdp ON mdp.user_id = l.moderator_user_id
     LEFT JOIN forum_threads t ON t.id = l.target_thread_id
     LEFT JOIN discord_profiles tudp ON tudp.user_id = l.target_user_id
     ORDER BY l.created_at DESC
     LIMIT 100`
  );

  res.json({
    log: r.rows.map((row) => ({
      id: parseInt(row.id, 10),
      action: row.action,
      notes: row.notes,
      createdAt: row.created_at,
      moderatorDisplayName: row.mod_display,
      targetThreadTitle: row.target_thread_title,
      targetThreadId: row.target_thread_id ? parseInt(row.target_thread_id, 10) : null,
      targetPostId: row.target_post_id ? parseInt(row.target_post_id, 10) : null,
      targetUserDisplayName: row.target_user_display,
    })),
  });
});
