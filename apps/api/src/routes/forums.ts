import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { requireParentRole, requireSession } from "../lib/auth.js";
import { ensureSettingsLoaded, getAISetting } from "../lib/serverSettings.js";
import { recordEvent } from "../lib/activityEvents.js";
import { applyTransaction } from "../lib/nuggiesLedger.js";

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
  reaction_count: string;
  user_reacted: boolean;
};

async function fetchPosts(threadId: bigint, viewerUserId: bigint | null): Promise<PostRow[]> {
  const r = await db.query<PostRow>(
    `SELECT
       p.id, p.thread_id, p.body, p.is_op, p.is_deleted, p.edited_at, p.created_at,
       u.discord_user_id AS author_discord_id,
       dp.username AS author_username,
       COALESCE(dp.global_name, dp.username) AS author_display_name,
       dp.avatar_url AS author_avatar_url,
       (SELECT COUNT(*)::text FROM forum_post_reactions WHERE post_id = p.id) AS reaction_count,
       EXISTS (
         SELECT 1 FROM forum_post_reactions
         WHERE post_id = p.id AND user_id = $2
       ) AS user_reacted
     FROM forum_posts p
     INNER JOIN users u ON u.id = p.author_user_id
     INNER JOIN discord_profiles dp ON dp.user_id = p.author_user_id
     WHERE p.thread_id = $1
     ORDER BY p.created_at ASC`,
    [threadId, viewerUserId ?? -1]
  );
  return r.rows;
}

function serializePost(row: PostRow) {
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
    reactionCount: parseInt(row.reaction_count, 10),
    userReacted: row.user_reacted,
  };
}

// ── GET /forums/categories ──────────────────────────────────────────────────

forumsRouter.get("/categories", requireSession, async (_req, res) => {
  const r = await db.query<{
    id: string; slug: string; name: string; description: string;
    icon: string; accent_color: string; position: number; is_locked: boolean;
    thread_count: string; last_thread_id: string | null; last_thread_title: string | null;
    last_thread_slug: string | null; last_activity_at: string | null;
    last_user_display: string | null; last_user_avatar: string | null;
  }>(
    `SELECT c.id, c.slug, c.name, c.description, c.icon, c.accent_color, c.position, c.is_locked,
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
    categories: r.rows.map((row) => ({
      id: parseInt(row.id, 10),
      slug: row.slug,
      name: row.name,
      description: row.description,
      icon: row.icon,
      accentColor: row.accent_color,
      position: row.position,
      isLocked: row.is_locked,
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

  const discordUserId = String(res.locals.userId);
  const userId = await resolveInternalId(discordUserId);
  if (!userId) { res.status(404).json({ error: "User not found" }); return; }
  if (await isBanned(userId)) { res.status(403).json({ error: "Banned from forums" }); return; }

  const cat = await db.query<{ id: string; is_locked: boolean }>(
    "SELECT id, is_locked FROM forum_categories WHERE slug = $1",
    [String(req.params.slug)]
  );
  if (!cat.rows[0]) { res.status(404).json({ error: "Category not found" }); return; }
  if (cat.rows[0].is_locked && !(await isParent(discordUserId))) {
    res.status(403).json({ error: "Category is locked" }); return;
  }
  const categoryId = parseInt(cat.rows[0].id, 10);

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

  const slug = slugify(title);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const t = await client.query<{ id: string }>(
      `INSERT INTO forum_threads (category_id, author_user_id, title, slug, last_reply_at, last_reply_user_id)
       VALUES ($1, $2, $3, $4, NOW(), $2) RETURNING id`,
      [categoryId, userId, title, slug]
    );
    const threadId = parseInt(t.rows[0].id, 10);
    await client.query(
      `INSERT INTO forum_posts (thread_id, author_user_id, body, is_op)
       VALUES ($1, $2, $3, TRUE)`,
      [threadId, userId, body]
    );
    await client.query("COMMIT");

    void recordEvent({
      eventType: "forum_thread_created",
      actorDiscordUserId: discordUserId,
      payload: { threadId, categoryId, title, slug },
    });

    const reward = getSetting("forums_thread_nuggies", 5);
    if (reward > 0) {
      void applyTransaction({
        discordUserId,
        amount: reward,
        type: "earn",
        reason: `Forum thread: ${title.slice(0, 50)}`,
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
    is_pinned: boolean; is_locked: boolean; is_deleted: boolean;
    view_count: number; reply_count: number; created_at: string; updated_at: string;
    author_discord_id: string; author_username: string; author_display_name: string; author_avatar_url: string | null;
    category_slug: string; category_name: string; category_icon: string; category_accent: string;
  }>(
    `SELECT t.id, t.category_id, t.title, t.slug, t.is_pinned, t.is_locked, t.is_deleted,
            t.view_count, t.reply_count, t.created_at, t.updated_at,
            u.discord_user_id AS author_discord_id,
            dp.username AS author_username,
            COALESCE(dp.global_name, dp.username) AS author_display_name,
            dp.avatar_url AS author_avatar_url,
            c.slug AS category_slug, c.name AS category_name, c.icon AS category_icon, c.accent_color AS category_accent
     FROM forum_threads t
     INNER JOIN users u ON u.id = t.author_user_id
     INNER JOIN discord_profiles dp ON dp.user_id = t.author_user_id
     INNER JOIN forum_categories c ON c.id = t.category_id
     WHERE t.id = $1`,
    [threadId]
  );
  if (!t.rows[0] || t.rows[0].is_deleted) { res.status(404).json({ error: "Thread not found" }); return; }

  // increment view count (best-effort, fire and forget)
  db.query("UPDATE forum_threads SET view_count = view_count + 1 WHERE id = $1", [threadId]).catch(() => undefined);

  const posts = await fetchPosts(BigInt(threadId), viewerUserId);

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
    },
    posts: posts.map(serializePost),
  });
});

// ── POST /forums/threads/:id/posts ──────────────────────────────────────────

const replySchema = z.object({ body: z.string().min(1) });

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
    await client.query("COMMIT");

    void recordEvent({
      eventType: "forum_reply_created",
      actorDiscordUserId: discordUserId,
      payload: { threadId, postId: parseInt(p.rows[0].id, 10), threadTitle: t.rows[0].title },
    });

    const reward = getSetting("forums_reply_nuggies", 1);
    if (reward > 0) {
      void applyTransaction({
        discordUserId,
        amount: reward,
        type: "earn",
        reason: `Forum reply on: ${t.rows[0].title.slice(0, 50)}`,
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

  const p = await db.query<{ author_user_id: string; is_deleted: boolean }>(
    "SELECT author_user_id, is_deleted FROM forum_posts WHERE id = $1",
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

forumsRouter.post("/posts/:id/react", requireSession, async (req, res) => {
  const postId = parseInt(String(req.params.id), 10);
  const userId = await resolveInternalId(String(res.locals.userId));
  if (!userId) { res.status(404).json({ error: "User not found" }); return; }

  const exists = await db.query(
    "SELECT 1 FROM forum_post_reactions WHERE post_id = $1 AND user_id = $2 AND reaction = 'like'",
    [postId, userId]
  );
  if (exists.rows.length > 0) {
    await db.query(
      "DELETE FROM forum_post_reactions WHERE post_id = $1 AND user_id = $2 AND reaction = 'like'",
      [postId, userId]
    );
    res.json({ reacted: false });
    return;
  }
  await db.query(
    `INSERT INTO forum_post_reactions (post_id, user_id, reaction) VALUES ($1, $2, 'like')
     ON CONFLICT DO NOTHING`,
    [postId, userId]
  );
  res.json({ reacted: true });
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
  const limit = Math.min(parseInt(String(req.query.limit ?? "30"), 10) || 30, 100);
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

  const viewerUserId = await resolveInternalId(String(res.locals.userId));

  const where: string[] = ["t.is_deleted = FALSE"];
  const params: unknown[] = [];
  let p = 0;

  if (categorySlug) {
    p++; where.push(`c.slug = $${p}`); params.push(categorySlug);
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
    SELECT t.id, t.title, t.slug, t.is_pinned, t.is_locked, t.view_count, t.reply_count,
           t.created_at, t.last_reply_at,
           c.slug AS category_slug, c.name AS category_name, c.icon AS category_icon, c.accent_color AS category_accent,
           u.discord_user_id AS author_discord_id,
           dp.username AS author_username,
           COALESCE(dp.global_name, dp.username) AS author_display_name,
           dp.avatar_url AS author_avatar_url,
           COALESCE(ldp.global_name, ldp.username) AS last_user_display,
           ldp.avatar_url AS last_user_avatar
    FROM forum_threads t
    INNER JOIN forum_categories c ON c.id = t.category_id
    INNER JOIN users u ON u.id = t.author_user_id
    INNER JOIN discord_profiles dp ON dp.user_id = t.author_user_id
    LEFT JOIN discord_profiles ldp ON ldp.user_id = t.last_reply_user_id
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderBy}
    LIMIT $${limitParam} OFFSET $${offsetParam}
  `;

  const r = await db.query<{
    id: string; title: string; slug: string;
    is_pinned: boolean; is_locked: boolean;
    view_count: number; reply_count: number;
    created_at: string; last_reply_at: string | null;
    category_slug: string; category_name: string; category_icon: string; category_accent: string;
    author_discord_id: string; author_username: string; author_display_name: string; author_avatar_url: string | null;
    last_user_display: string | null; last_user_avatar: string | null;
  }>(sql, params);

  res.json({
    threads: r.rows.map((row) => ({
      id: parseInt(row.id, 10),
      title: row.title,
      slug: row.slug,
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
    })),
    sort,
    limit,
    offset,
  });
});

// ── GET /forums/stats ──────────────────────────────────────────────────────

forumsRouter.get("/stats", requireSession, async (_req, res) => {
  const viewerUserId = await resolveInternalId(String(res.locals.userId));

  const [counts, topAuthors, mine] = await Promise.all([
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
      ? db.query<{ thread_count: string; post_count: string }>(
          `SELECT
             (SELECT COUNT(*)::text FROM forum_threads WHERE author_user_id = $1 AND is_deleted = FALSE) AS thread_count,
             (SELECT COUNT(*)::text FROM forum_posts   WHERE author_user_id = $1 AND is_deleted = FALSE) AS post_count`,
          [viewerUserId]
        )
      : Promise.resolve({ rows: [{ thread_count: "0", post_count: "0" }] }),
  ]);

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
    },
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

// ── GET /forums/search?q=... ────────────────────────────────────────────────

forumsRouter.get("/search", requireSession, async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) { res.json({ threads: [] }); return; }

  const r = await db.query<{
    id: string; title: string; slug: string; reply_count: number;
    created_at: string; last_reply_at: string | null;
    category_slug: string; category_name: string; category_icon: string;
  }>(
    `SELECT t.id, t.title, t.slug, t.reply_count, t.created_at, t.last_reply_at,
            c.slug AS category_slug, c.name AS category_name, c.icon AS category_icon
     FROM forum_threads t
     INNER JOIN forum_categories c ON c.id = t.category_id
     WHERE t.is_deleted = FALSE AND t.title ILIKE $1
     ORDER BY COALESCE(t.last_reply_at, t.created_at) DESC
     LIMIT 30`,
    [`%${q}%`]
  );

  res.json({
    threads: r.rows.map((row) => ({
      id: parseInt(row.id, 10),
      title: row.title,
      slug: row.slug,
      replyCount: row.reply_count,
      createdAt: row.created_at,
      lastReplyAt: row.last_reply_at,
      categorySlug: row.category_slug,
      categoryName: row.category_name,
      categoryIcon: row.category_icon,
    })),
  });
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
});

forumsRouter.post("/admin/categories", requireSession, requireParentRole, async (req, res) => {
  const parsed = adminCategorySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const { slug, name, description = "", icon = "💬", accentColor = "#3b82f6", position = 999, isLocked = false } = parsed.data;
  await db.query(
    `INSERT INTO forum_categories (slug, name, description, icon, accent_color, position, is_locked)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [slug, name, description, icon, accentColor, position, isLocked]
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
