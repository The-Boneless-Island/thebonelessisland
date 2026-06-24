import express from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { requireParentRole, requireSession } from "../lib/auth.js";

export const patchAlertsRouter = express.Router();
patchAlertsRouter.use(requireSession, requireParentRole);

patchAlertsRouter.get("/roles", async (_req, res) => {
  const result = await db.query<{
    app_id: number;
    discord_role_id: string;
    game_name: string;
    header_image_url: string | null;
  }>(
    `
      SELECT p.app_id, p.discord_role_id, g.name AS game_name, g.header_image_url
      FROM patch_alert_roles p
      INNER JOIN games g ON g.app_id = p.app_id
      ORDER BY g.name ASC
    `
  );
  res.json({
    roles: result.rows.map((row) => ({
      appId: row.app_id,
      discordRoleId: row.discord_role_id,
      gameName: row.game_name,
      headerImageUrl: row.header_image_url,
    })),
  });
});

const upsertSchema = z.object({
  discordRoleId: z.string().min(1).max(32),
});

patchAlertsRouter.put("/roles/:appId", async (req, res) => {
  const appId = parseInt(String(req.params.appId), 10);
  if (!Number.isFinite(appId)) {
    res.status(400).json({ error: "Invalid app id" });
    return;
  }
  const body = upsertSchema.parse(req.body);
  const game = await db.query("SELECT 1 FROM games WHERE app_id = $1", [appId]);
  if (game.rows.length === 0) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  await db.query(
    `
      INSERT INTO patch_alert_roles (app_id, discord_role_id)
      VALUES ($1, $2)
      ON CONFLICT (app_id) DO UPDATE SET discord_role_id = EXCLUDED.discord_role_id
    `,
    [appId, body.discordRoleId.trim()]
  );
  res.json({ ok: true });
});

patchAlertsRouter.delete("/roles/:appId", async (req, res) => {
  const appId = parseInt(String(req.params.appId), 10);
  if (!Number.isFinite(appId)) {
    res.status(400).json({ error: "Invalid app id" });
    return;
  }
  await db.query("DELETE FROM patch_alert_roles WHERE app_id = $1", [appId]);
  res.json({ ok: true });
});
