import express from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { recordEvent } from "../lib/activityEvents.js";
import { requireParentRole, requireSession } from "../lib/auth.js";

export const newsCardsRouter = express.Router();

const createSchema = z.object({
  title: z.string().trim().min(1).max(140),
  body: z.string().trim().min(1).max(2000),
  icon: z.string().trim().max(8).optional(),
  tag: z.string().trim().max(40).nullable().optional(),
  sourceUrl: z.string().trim().url().max(500).nullable().optional()
});

const updateSchema = createSchema.partial();

type NewsCardRow = {
  id: string;
  title: string;
  body: string;
  icon: string;
  tag: string | null;
  source_url: string | null;
  published_at: string;
  updated_at: string;
  creator_discord_user_id: string | null;
  creator_username: string | null;
  creator_display_name: string | null;
  creator_avatar_url: string | null;
};

function rowToCard(row: NewsCardRow) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    icon: row.icon,
    tag: row.tag,
    sourceUrl: row.source_url,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    createdBy: row.creator_discord_user_id
      ? {
          discordUserId: row.creator_discord_user_id,
          displayName: row.creator_display_name ?? row.creator_username ?? "Crew member",
          avatarUrl: row.creator_avatar_url
        }
      : null
  };
}

const cardSelect = `
  SELECT
    nc.id::text AS id,
    nc.title,
    nc.body,
    nc.icon,
    nc.tag,
    nc.source_url,
    nc.published_at,
    nc.updated_at,
    creator.discord_user_id AS creator_discord_user_id,
    creator_dp.username AS creator_username,
    creator_gm.display_name AS creator_display_name,
    creator_gm.avatar_url AS creator_avatar_url
  FROM news_cards nc
  LEFT JOIN users creator ON creator.id = nc.created_by_user_id
  LEFT JOIN discord_profiles creator_dp ON creator_dp.user_id = creator.id
  LEFT JOIN guild_members creator_gm ON creator_gm.discord_user_id = creator.discord_user_id
`;

newsCardsRouter.get("/", requireSession, async (_req, res) => {
  const result = await db.query<NewsCardRow>(
    `
      ${cardSelect}
      WHERE nc.archived_at IS NULL
      ORDER BY nc.published_at DESC
      LIMIT 50
    `
  );
  res.json({ cards: result.rows.map(rowToCard) });
});

newsCardsRouter.post("/", requireParentRole, async (req, res) => {
  const body = createSchema.parse(req.body);
  const discordUserId = String(res.locals.userId);

  const userLookup = await db.query<{ id: number }>(
    `SELECT id FROM users WHERE discord_user_id = $1`,
    [discordUserId]
  );
  const creatorId = userLookup.rows[0]?.id ?? null;

  const insert = await db.query<{ id: string }>(
    `
      INSERT INTO news_cards (title, body, icon, tag, source_url, created_by_user_id)
      VALUES ($1, $2, COALESCE($3, '🌊'), $4, $5, $6)
      RETURNING id::text
    `,
    [
      body.title.trim(),
      body.body.trim(),
      body.icon?.trim() || null,
      body.tag?.trim() || null,
      body.sourceUrl?.trim() || null,
      creatorId
    ]
  );

  const newId = insert.rows[0]?.id;
  if (!newId) {
    res.status(500).json({ error: "Failed to insert news card" });
    return;
  }

  void recordEvent({
    eventType: "news.card_published",
    actorDiscordUserId: discordUserId,
    payload: { cardId: newId, title: body.title.trim() }
  });

  const result = await db.query<NewsCardRow>(
    `${cardSelect} WHERE nc.id::text = $1 LIMIT 1`,
    [newId]
  );
  const card = result.rows[0] ? rowToCard(result.rows[0]) : null;
  res.status(201).json({ card });
});

newsCardsRouter.patch("/:id", requireParentRole, async (req, res) => {
  const id = String(req.params.id);
  const body = updateSchema.parse(req.body);

  const fields: string[] = [];
  const values: unknown[] = [id];

  if (body.title !== undefined) {
    fields.push(`title = $${values.length + 1}`);
    values.push(body.title.trim());
  }
  if (body.body !== undefined) {
    fields.push(`body = $${values.length + 1}`);
    values.push(body.body.trim());
  }
  if (body.icon !== undefined) {
    fields.push(`icon = $${values.length + 1}`);
    values.push(body.icon.trim() || "🌊");
  }
  if (body.tag !== undefined) {
    fields.push(`tag = $${values.length + 1}`);
    values.push(body.tag === null ? null : body.tag.trim() || null);
  }
  if (body.sourceUrl !== undefined) {
    fields.push(`source_url = $${values.length + 1}`);
    values.push(body.sourceUrl === null ? null : body.sourceUrl.trim() || null);
  }

  if (fields.length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  fields.push(`updated_at = NOW()`);

  const update = await db.query(
    `UPDATE news_cards SET ${fields.join(", ")} WHERE id::text = $1 AND archived_at IS NULL`,
    values
  );

  if (update.rowCount === 0) {
    res.status(404).json({ error: "Card not found" });
    return;
  }

  const result = await db.query<NewsCardRow>(
    `${cardSelect} WHERE nc.id::text = $1 LIMIT 1`,
    [id]
  );
  const card = result.rows[0] ? rowToCard(result.rows[0]) : null;

  void recordEvent({
    eventType: "news.card_updated",
    actorDiscordUserId: String(res.locals.userId),
    payload: { cardId: id, title: card?.title ?? body.title ?? "" },
  });

  res.json({ card });
});

newsCardsRouter.delete("/:id", requireParentRole, async (req, res) => {
  const id = String(req.params.id);
  const existing = await db.query<{ title: string }>(
    `SELECT title FROM news_cards WHERE id::text = $1 AND archived_at IS NULL`,
    [id]
  );
  const update = await db.query(
    `UPDATE news_cards SET archived_at = NOW(), updated_at = NOW() WHERE id::text = $1 AND archived_at IS NULL`,
    [id]
  );
  if (update.rowCount === 0) {
    res.status(404).json({ error: "Card not found" });
    return;
  }
  void recordEvent({
    eventType: "news.card_archived",
    actorDiscordUserId: String(res.locals.userId),
    payload: { cardId: id, title: existing.rows[0]?.title ?? "" },
  });
  res.json({ ok: true });
});
