import express from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { getGuildId } from "../lib/serverSettings.js";
import { requireSession } from "../lib/auth.js";
import { getEquippedItemsByUserId } from "../lib/nuggiesLedger.js";

const patchSchema = z.object({
  steamVisibility: z.enum(["private", "members", "public"]).optional(),
  featureOptIn: z.boolean().optional()
});

export const profileRouter = express.Router();
profileRouter.use(requireSession);

profileRouter.get("/me", async (req, res) => {
  const discordUserId = String(res.locals.userId);
  // Single mega-join: profile + balance + opted_out + steam + guild_member.
  // Replaces 4 separate queries with 1; equipped items still needs its own
  // (joins inventory + shop catalogue), but we pass the bigint user_id so it
  // skips a redundant discord-id lookup.
  const result = await db.query<{
    user_id: string;
    discord_user_id: string;
    steam_visibility: string;
    feature_opt_in: boolean;
    nuggies_opted_out: boolean;
    username: string;
    avatar_url: string | null;
    steam_id64: string | null;
    steam_last_synced_at: string | null;
    display_name: string | null;
    role_names: string[] | null;
    in_voice: boolean | null;
    rich_presence_text: string | null;
    balance: string | null;
  }>(
    `
      SELECT
        u.id::text AS user_id,
        u.discord_user_id,
        u.steam_visibility,
        u.feature_opt_in,
        u.nuggies_opted_out,
        dp.username,
        dp.avatar_url,
        sl.steam_id64,
        sl.last_synced_at AS steam_last_synced_at,
        gm.display_name,
        gm.role_names,
        gm.in_voice,
        gm.rich_presence_text,
        nb.balance
      FROM users u
      INNER JOIN discord_profiles dp ON dp.user_id = u.id
      LEFT JOIN steam_links sl ON sl.user_id = u.id
      LEFT JOIN guild_members gm
        ON gm.discord_user_id = u.discord_user_id
       AND gm.guild_id = $2
       AND gm.in_guild = TRUE
      LEFT JOIN nuggies_balances nb ON nb.user_id = u.id
      WHERE u.discord_user_id = $1
    `,
    [discordUserId, getGuildId()]
  );
  const row = result.rows[0];
  if (!row) {
    res.json({ profile: null });
    return;
  }

  const equippedItems = await getEquippedItemsByUserId(BigInt(row.user_id)).catch(() => []);

  res.json({
    profile: {
      discordUserId: row.discord_user_id,
      steamVisibility: row.steam_visibility,
      featureOptIn: row.feature_opt_in,
      username: row.username,
      displayName: row.display_name ?? row.username,
      avatarUrl: row.avatar_url,
      steamId64: row.steam_id64,
      steamLastSyncedAt: row.steam_last_synced_at,
      roleNames: row.role_names ?? [],
      inVoice: Boolean(row.in_voice),
      richPresenceText: row.rich_presence_text ?? "Presence unavailable",
      nuggieBalance: parseInt(row.balance ?? "0", 10),
      nuggiesOptedOut: row.nuggies_opted_out,
      equippedItems,
    }
  });
});

profileRouter.patch("/me", async (req, res) => {
  const body = patchSchema.parse(req.body);
  const discordUserId = String(res.locals.userId);
  await db.query(
    `
      UPDATE users
      SET steam_visibility = COALESCE($2, steam_visibility),
          feature_opt_in = COALESCE($3, feature_opt_in)
      WHERE discord_user_id = $1
    `,
    [discordUserId, body.steamVisibility ?? null, body.featureOptIn ?? null]
  );
  res.json({ ok: true });
});
