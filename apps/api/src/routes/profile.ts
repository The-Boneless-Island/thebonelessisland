import express from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { getGuildId } from "../lib/serverSettings.js";
import { requireSession } from "../lib/auth.js";
import { getEquippedItemsByUserId } from "../lib/nuggiesLedger.js";

const patchSchema = z.object({
  steamVisibility: z.enum(["private", "members", "public"]).optional(),
  featureOptIn: z.boolean().optional(),
  profileBlurb: z.string().trim().max(280).optional()
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
    global_name: string | null;
    banner_url: string | null;
    accent_color: number | null;
    premium_type: number | null;
    profile_blurb: string | null;
    steam_id64: string | null;
    steam_last_synced_at: string | null;
    steam_persona_name: string | null;
    steam_avatar_url: string | null;
    steam_profile_url: string | null;
    steam_persona_state: number | null;
    steam_game_extra_info: string | null;
    steam_level: number | null;
    steam_time_created: string | null;
    display_name: string | null;
    role_names: string[] | null;
    in_voice: boolean | null;
    rich_presence_text: string | null;
    joined_at_guild: string | null;
    premium_since: string | null;
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
        dp.global_name,
        dp.banner_url,
        dp.accent_color,
        dp.premium_type,
        dp.profile_blurb,
        sl.steam_id64,
        sl.last_synced_at AS steam_last_synced_at,
        sl.persona_name AS steam_persona_name,
        sl.steam_avatar_url,
        sl.profile_url AS steam_profile_url,
        sl.persona_state AS steam_persona_state,
        sl.game_extra_info AS steam_game_extra_info,
        sl.steam_level,
        sl.time_created AS steam_time_created,
        gm.display_name,
        gm.role_names,
        gm.in_voice,
        gm.rich_presence_text,
        gm.joined_at_guild,
        gm.premium_since,
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
      displayName: row.display_name ?? row.global_name ?? row.username,
      globalName: row.global_name,
      avatarUrl: row.avatar_url,
      bannerUrl: row.banner_url,
      accentColor: row.accent_color,
      premiumType: row.premium_type,
      profileBlurb: row.profile_blurb,
      joinedAtGuild: row.joined_at_guild,
      premiumSince: row.premium_since,
      steamId64: row.steam_id64,
      steamLastSyncedAt: row.steam_last_synced_at,
      steam: row.steam_id64
        ? {
            personaName: row.steam_persona_name,
            avatarUrl: row.steam_avatar_url,
            profileUrl: row.steam_profile_url,
            personaState: row.steam_persona_state,
            inGame: row.steam_game_extra_info,
            level: row.steam_level,
            accountCreated: row.steam_time_created
          }
        : null,
      roleNames: row.role_names ?? [],
      inVoice: Boolean(row.in_voice),
      richPresenceText: row.rich_presence_text ?? "Presence unavailable",
      nuggieBalance: parseInt(row.balance ?? "0", 10),
      nuggiesOptedOut: row.nuggies_opted_out,
      equippedItems,
      guildId: getGuildId(),
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
  if (body.profileBlurb !== undefined) {
    await db.query(
      `
        UPDATE discord_profiles
        SET profile_blurb = NULLIF($2, '')
        WHERE user_id = (SELECT id FROM users WHERE discord_user_id = $1)
      `,
      [discordUserId, body.profileBlurb]
    );
  }
  res.json({ ok: true });
});

// ── Per-game Steam exclusions (server-persisted, enforced) ──────────────────
// The owner's list of individually-hidden games. Replaces the old localStorage
// checkbox list that was never enforced anywhere.

profileRouter.get("/steam-exclusions", async (_req, res) => {
  const discordUserId = String(res.locals.userId);
  const result = await db.query<{ app_id: number }>(
    `
      SELECT e.app_id
      FROM steam_game_exclusions e
      INNER JOIN users u ON u.id = e.user_id
      WHERE u.discord_user_id = $1
      ORDER BY e.app_id
    `,
    [discordUserId]
  );
  res.json({ appIds: result.rows.map((r) => r.app_id) });
});

profileRouter.put("/steam-exclusions/:appId", async (req, res) => {
  const appId = Number(req.params.appId);
  if (!Number.isInteger(appId) || appId <= 0) {
    res.status(400).json({ error: "appId must be a positive integer" });
    return;
  }
  const discordUserId = String(res.locals.userId);
  await db.query(
    `
      INSERT INTO steam_game_exclusions (user_id, app_id)
      SELECT u.id, $2 FROM users u WHERE u.discord_user_id = $1
      ON CONFLICT (user_id, app_id) DO NOTHING
    `,
    [discordUserId, appId]
  );
  res.json({ ok: true });
});

profileRouter.delete("/steam-exclusions/:appId", async (req, res) => {
  const appId = Number(req.params.appId);
  if (!Number.isInteger(appId) || appId <= 0) {
    res.status(400).json({ error: "appId must be a positive integer" });
    return;
  }
  const discordUserId = String(res.locals.userId);
  await db.query(
    `
      DELETE FROM steam_game_exclusions
      WHERE app_id = $2
        AND user_id = (SELECT id FROM users WHERE discord_user_id = $1)
    `,
    [discordUserId, appId]
  );
  res.json({ ok: true });
});
