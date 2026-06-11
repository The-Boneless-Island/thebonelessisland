import express from "express";
import Parser from "rss-parser";
import { z } from "zod";
import { db } from "../db/client.js";
import { requireParentRole, requireSession } from "../lib/auth.js";
import { getGuildId } from "../lib/serverSettings.js";

export const gameNewsSourcesRouter = express.Router();
gameNewsSourcesRouter.use(requireSession);
gameNewsSourcesRouter.use(requireParentRole);

const rssParser = new Parser({ timeout: 8000 });

type SourceRow = {
  id: string;
  app_id: number;
  source_type: "rss" | "atom";
  source_url: string;
  label: string | null;
  enabled: boolean;
  fetched_at: string | null;
  last_error: string | null;
};

type SourceWithGame = SourceRow & {
  game_name: string;
  header_image_url: string | null;
};

// ── GET / — list all sources grouped by app ──────────────────────────────────

gameNewsSourcesRouter.get("/", async (_req, res) => {
  const result = await db.query<SourceWithGame>(
    `
      SELECT
        s.id::text,
        s.app_id,
        s.source_type,
        s.source_url,
        s.label,
        s.enabled,
        s.fetched_at,
        s.last_error,
        g.name AS game_name,
        g.header_image_url
      FROM game_news_sources s
      INNER JOIN games g ON g.app_id = s.app_id
      ORDER BY g.name ASC, s.id ASC
    `
  );

  const grouped = new Map<number, {
    appId: number;
    gameName: string;
    headerImageUrl: string | null;
    sources: Array<{
      id: string;
      sourceType: "rss" | "atom";
      sourceUrl: string;
      label: string | null;
      enabled: boolean;
      fetchedAt: string | null;
      lastError: string | null;
    }>;
  }>();
  for (const row of result.rows) {
    if (!grouped.has(row.app_id)) {
      grouped.set(row.app_id, {
        appId: row.app_id,
        gameName: row.game_name,
        headerImageUrl: row.header_image_url,
        sources: []
      });
    }
    grouped.get(row.app_id)!.sources.push({
      id: row.id,
      sourceType: row.source_type,
      sourceUrl: row.source_url,
      label: row.label,
      enabled: row.enabled,
      fetchedAt: row.fetched_at,
      lastError: row.last_error
    });
  }
  res.json({ games: Array.from(grouped.values()) });
});

// ── GET /candidates — top 50 crew-owned games ────────────────────────────────

gameNewsSourcesRouter.get("/candidates", async (_req, res) => {
  const guildId = getGuildId();
  if (!guildId) {
    res.json({ candidates: [] });
    return;
  }

  const result = await db.query<{
    app_id: number;
    name: string;
    header_image_url: string | null;
    owners: number;
    source_count: number;
  }>(
    `
      WITH owner_counts AS (
        SELECT ug.app_id, COUNT(DISTINCT u.id)::int AS owners
        FROM shareable_user_games ug
        INNER JOIN users u ON u.id = ug.user_id
        INNER JOIN guild_members gm ON gm.discord_user_id = u.discord_user_id AND gm.guild_id = $1 AND gm.in_guild = TRUE
        GROUP BY ug.app_id
      )
      SELECT
        g.app_id,
        g.name,
        g.header_image_url,
        oc.owners,
        COALESCE((SELECT COUNT(*) FROM game_news_sources s WHERE s.app_id = g.app_id), 0)::int AS source_count
      FROM owner_counts oc
      INNER JOIN games g ON g.app_id = oc.app_id
      ORDER BY oc.owners DESC, g.name ASC
      LIMIT 50
    `,
    [guildId]
  );

  res.json({
    candidates: result.rows.map((row) => ({
      appId: row.app_id,
      name: row.name,
      headerImageUrl: row.header_image_url,
      owners: row.owners,
      sourceCount: row.source_count
    }))
  });
});

// ── POST / — create source ───────────────────────────────────────────────────

const createSchema = z.object({
  appId: z.number().int().positive(),
  sourceType: z.enum(["rss", "atom"]),
  sourceUrl: z.string().url().max(500),
  label: z.string().trim().max(100).nullable().optional()
});

gameNewsSourcesRouter.post("/", async (req, res) => {
  const body = createSchema.parse(req.body);

  const game = await db.query<{ app_id: number }>(`SELECT app_id FROM games WHERE app_id = $1`, [body.appId]);
  if (game.rows.length === 0) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  try {
    const result = await db.query<{ id: string }>(
      `
        INSERT INTO game_news_sources (app_id, source_type, source_url, label)
        VALUES ($1, $2, $3, $4)
        RETURNING id::text
      `,
      [body.appId, body.sourceType, body.sourceUrl, body.label ?? null]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
      res.status(409).json({ error: "This source URL is already registered for this game" });
      return;
    }
    throw err;
  }
});

// ── PATCH /:id — update source ───────────────────────────────────────────────

const patchSchema = z.object({
  sourceUrl: z.string().url().max(500).optional(),
  label: z.string().trim().max(100).nullable().optional(),
  enabled: z.boolean().optional()
});

gameNewsSourcesRouter.patch("/:id", async (req, res) => {
  const id = req.params.id;
  const body = patchSchema.parse(req.body);

  const sets: string[] = [];
  const args: unknown[] = [];
  let i = 1;
  if (body.sourceUrl !== undefined) {
    sets.push(`source_url = $${i++}`);
    args.push(body.sourceUrl);
  }
  if (body.label !== undefined) {
    sets.push(`label = $${i++}`);
    args.push(body.label);
  }
  if (body.enabled !== undefined) {
    sets.push(`enabled = $${i++}`);
    args.push(body.enabled);
  }
  if (sets.length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  args.push(id);

  const result = await db.query(
    `UPDATE game_news_sources SET ${sets.join(", ")} WHERE id = $${i}::bigint`,
    args
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  res.json({ ok: true });
});

// ── DELETE /:id ──────────────────────────────────────────────────────────────

gameNewsSourcesRouter.delete("/:id", async (req, res) => {
  const id = req.params.id;
  const result = await db.query(`DELETE FROM game_news_sources WHERE id = $1::bigint`, [id]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  res.json({ ok: true });
});

// ── POST /test — test a candidate URL without saving ─────────────────────────

const testSchema = z.object({
  sourceUrl: z.string().url().max(500)
});

gameNewsSourcesRouter.post("/test", async (req, res) => {
  const body = testSchema.parse(req.body);
  try {
    const feed = await rssParser.parseURL(body.sourceUrl);
    const items = feed.items ?? [];
    const sample = items[0]
      ? {
          title: items[0].title ?? "",
          url: items[0].link ?? "",
          publishedAt: items[0].isoDate ?? items[0].pubDate ?? null
        }
      : null;
    res.json({
      ok: true,
      feedTitle: feed.title ?? null,
      itemCount: items.length,
      sample
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.json({ ok: false, error: message.slice(0, 300) });
  }
});
