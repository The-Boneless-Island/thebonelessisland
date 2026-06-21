import express from "express";
import { env } from "../config.js";
import { db } from "../db/client.js";
import { getGuildId } from "../lib/serverSettings.js";
import { requireBotSecret, requireSession } from "../lib/auth.js";
import { broadcast } from "../lib/eventBus.js";
import { activityText } from "../lib/presence.js";

const PRESENCE_STATUSES = new Set(["online", "idle", "dnd", "offline"]);

// Per-user GET /users/:id (bot token) — the only endpoint that returns a user's
// global banner + accent_color. Used for lazy backfill on profile view.
async function fetchDiscordUserBanner(
  userId: string
): Promise<{ bannerUrl: string | null; accentColor: number | null } | null> {
  if (!env.DISCORD_BOT_TOKEN) return null;
  const resp = await fetch(`https://discord.com/api/v10/users/${userId}`, {
    headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
  }).catch(() => null);
  if (!resp?.ok) return null;
  const data = (await resp.json().catch(() => null)) as {
    banner?: string | null;
    accent_color?: number | null;
  } | null;
  if (!data) return null;
  const banner = data.banner ?? null;
  const ext = banner?.startsWith("a_") ? "gif" : "png";
  const bannerUrl = banner
    ? `https://cdn.discordapp.com/banners/${userId}/${banner}.${ext}?size=600`
    : null;
  return { bannerUrl, accentColor: typeof data.accent_color === "number" ? data.accent_color : null };
}

type DiscordGuildMember = {
  nick?: string | null;
  roles?: string[];
  joined_at?: string | null;
  premium_since?: string | null;
  avatar?: string | null; // guild-specific avatar hash
  user?: {
    id?: string;
    username?: string;
    global_name?: string | null;
    avatar?: string | null;
  };
};

type DiscordRole = {
  id: string;
  name: string;
};

type DiscordVoiceState = {
  user_id?: string;
  channel_id?: string | null;
};

type VoiceSyncDiagnostics = {
  ok: boolean;
  status: number | null;
  count: number;
  details?: string;
};

type MemberSyncResult = {
  syncedMembers: number;
  voice: VoiceSyncDiagnostics;
};

// Error thrown by syncGuildMembers when Discord/config prevents a sync. Carries
// an HTTP status + details so the POST /sync route can respond exactly as before.
class MemberSyncError extends Error {
  status: number;
  details?: string;
  constructor(status: number, message: string, details?: string) {
    super(message);
    this.name = "MemberSyncError";
    this.status = status;
    this.details = details;
  }
}

// Reusable member-sync routine (no req/res). Reads guild id + bot token the
// same way the handler does. Called by POST /members/sync and the server cron.
export async function syncGuildMembers(): Promise<MemberSyncResult> {
  if (!getGuildId() || !env.DISCORD_BOT_TOKEN) {
    throw new MemberSyncError(
      400,
      "DISCORD_GUILD_ID and DISCORD_BOT_TOKEN are required for member sync"
    );
  }

  const guildCheck = await fetch(`https://discord.com/api/v10/guilds/${getGuildId()}`, {
    headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
  });

  if (!guildCheck.ok) {
    const body = await guildCheck.text().catch(() => "");
    throw new MemberSyncError(
      502,
      "Bot cannot access the configured Discord guild",
      body.slice(0, 300) ||
        "Verify DISCORD_GUILD_ID matches your server and that the bot is invited to that server."
    );
  }

  const response = await fetch(`https://discord.com/api/v10/guilds/${getGuildId()}/members?limit=1000`, {
    headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const guidance =
      response.status === 403
        ? "Discord denied member list access. Enable Server Members Intent for this bot in Discord Developer Portal -> Bot, then restart the bot/API."
        : "";
    throw new MemberSyncError(
      502,
      `Discord member sync failed (${response.status})`,
      `${body.slice(0, 300)} ${guidance}`.trim()
    );
  }

  const rolesResponse = await fetch(`https://discord.com/api/v10/guilds/${getGuildId()}/roles`, {
    headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
  });
  const rolesPayload = rolesResponse.ok ? ((await rolesResponse.json()) as DiscordRole[]) : [];
  const roleNameById = new Map<string, string>(rolesPayload.map((role) => [role.id, role.name]));

  const data = (await response.json()) as DiscordGuildMember[];
  const normalized = data
    .map((member) => {
      const id = member.user?.id?.trim();
      const username = member.user?.username?.trim();
      if (!id || !username) return null;
      const avatar = member.user?.avatar ?? null;
      const avatarExt = avatar?.startsWith("a_") ? "gif" : "png";
      const avatarUrl = avatar
        ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.${avatarExt}?size=128`
        : null;
      const guildAvatar = member.avatar ?? null;
      const guildAvatarExt = guildAvatar?.startsWith("a_") ? "gif" : "png";
      const guildAvatarUrl = guildAvatar
        ? `https://cdn.discordapp.com/guilds/${getGuildId()}/users/${id}/avatars/${guildAvatar}.${guildAvatarExt}?size=128`
        : null;
      const globalName = member.user?.global_name?.trim() || null;
      const displayName = member.nick?.trim() || globalName || username;
      const roleIds = (member.roles ?? []).filter(Boolean);
      const roleNames = roleIds.map((roleId) => roleNameById.get(roleId) ?? `role:${roleId}`);
      const joinedAtGuild = member.joined_at ?? null;
      const premiumSince = member.premium_since ?? null;
      return {
        id,
        username,
        displayName,
        globalName,
        avatarUrl,
        guildAvatarUrl,
        roleIds,
        roleNames,
        joinedAtGuild,
        premiumSince
      };
    })
    .filter(
      (
        row
      ): row is {
        id: string;
        username: string;
        displayName: string;
        globalName: string | null;
        avatarUrl: string | null;
        guildAvatarUrl: string | null;
        roleIds: string[];
        roleNames: string[];
        joinedAtGuild: string | null;
        premiumSince: string | null;
      } => Boolean(row)
    );

  const voiceDiagnostics: VoiceSyncDiagnostics = {
    ok: true,
    status: 200,
    count: 0
  };
  const voiceChannelByUserId = new Map<string, string>();

  // Fetch all voice states concurrently instead of one-at-a-time.
  const voiceResults = await Promise.all(
    normalized.map(async (member) => {
      const voiceStateResponse = await fetch(
        `https://discord.com/api/v10/guilds/${getGuildId()}/voice-states/${member.id}`,
        { headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } }
      ).catch(() => null);
      return { memberId: member.id, response: voiceStateResponse };
    })
  );

  for (const { memberId, response: voiceStateResponse } of voiceResults) {
    if (!voiceStateResponse) {
      voiceDiagnostics.ok = false;
      voiceDiagnostics.status = null;
      voiceDiagnostics.details = "Voice state request failed before Discord responded.";
      continue;
    }
    if (voiceStateResponse.status === 404) {
      continue;
    }
    if (!voiceStateResponse.ok) {
      const body = await voiceStateResponse.text().catch(() => "");
      voiceDiagnostics.ok = false;
      voiceDiagnostics.status = voiceStateResponse.status;
      if (!voiceDiagnostics.details) {
        voiceDiagnostics.details = body.slice(0, 300) || "Discord rejected voice state request.";
      }
      continue;
    }
    const voiceState = (await voiceStateResponse.json()) as DiscordVoiceState;
    const channelId = voiceState.channel_id?.trim();
    if (channelId) {
      voiceChannelByUserId.set(memberId, channelId);
      voiceDiagnostics.count += 1;
    }
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE guild_members SET in_guild = FALSE WHERE guild_id = $1`, [getGuildId()]);

    for (const member of normalized) {
      const voiceChannelId = voiceChannelByUserId.get(member.id) ?? null;
      const inVoice = Boolean(voiceChannelId);
      // Only voice state is observable here. Don't fabricate an "offline"
      // claim when the user is simply not in a voice channel — Discord's
      // online/idle/dnd presence is not pulled by this sync.
      const richPresenceText = inVoice ? "In a voice channel" : null;
      await client.query(
        `
          INSERT INTO guild_members (
            guild_id,
            discord_user_id,
            username,
            display_name,
            global_name,
            avatar_url,
            guild_avatar_url,
            role_ids,
            role_names,
            in_voice,
            voice_channel_id,
            rich_presence_text,
            joined_at_guild,
            premium_since,
            in_guild,
            last_synced_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9::text[], $10, $11, $12, $13::timestamptz, $14::timestamptz, TRUE, NOW())
          ON CONFLICT (guild_id, discord_user_id)
          DO UPDATE SET
            username = EXCLUDED.username,
            display_name = EXCLUDED.display_name,
            global_name = EXCLUDED.global_name,
            avatar_url = EXCLUDED.avatar_url,
            guild_avatar_url = EXCLUDED.guild_avatar_url,
            role_ids = EXCLUDED.role_ids,
            role_names = EXCLUDED.role_names,
            in_voice = EXCLUDED.in_voice,
            voice_channel_id = EXCLUDED.voice_channel_id,
            rich_presence_text = EXCLUDED.rich_presence_text,
            joined_at_guild = EXCLUDED.joined_at_guild,
            premium_since = EXCLUDED.premium_since,
            in_guild = TRUE,
            last_synced_at = NOW()
        `,
        [
          getGuildId(),
          member.id,
          member.username,
          member.displayName,
          member.globalName,
          member.avatarUrl,
          member.guildAvatarUrl,
          member.roleIds,
          member.roleNames,
          inVoice,
          voiceChannelId,
          richPresenceText,
          member.joinedAtGuild,
          member.premiumSince
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return { syncedMembers: normalized.length, voice: voiceDiagnostics };
}

export const membersRouter = express.Router();

membersRouter.get("/", requireSession, async (_req, res) => {
  if (!getGuildId()) {
    res.status(400).json({ error: "DISCORD_GUILD_ID is not configured" });
    return;
  }

  const members = await db.query<{
    discord_user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    guild_avatar_url: string | null;
    role_names: string[];
    in_voice: boolean;
    voice_channel_id: string | null;
    rich_presence_text: string | null;
    activity_name: string | null;
    activity_type: number | null;
    presence_status: string | null;
    banner_url: string | null;
    accent_color: number | null;
  }>(
    `
      SELECT gm.discord_user_id, gm.username, gm.display_name, gm.avatar_url, gm.guild_avatar_url,
             gm.role_names, gm.in_voice, gm.voice_channel_id, gm.rich_presence_text,
             gm.activity_name, gm.activity_type, gm.presence_status,
             COALESCE(gm.banner_url, dp.banner_url) AS banner_url,
             COALESCE(gm.accent_color, dp.accent_color) AS accent_color
      FROM guild_members gm
      LEFT JOIN users u ON u.discord_user_id = gm.discord_user_id
      LEFT JOIN discord_profiles dp ON dp.user_id = u.id
      WHERE gm.guild_id = $1 AND gm.in_guild = TRUE
      ORDER BY gm.username ASC
      LIMIT 2000
    `,
    [getGuildId()]
  );

  res.json({
    members: members.rows.map((row) => ({
      discordUserId: row.discord_user_id,
      username: row.username,
      displayName: row.display_name ?? row.username,
      avatarUrl: row.guild_avatar_url ?? row.avatar_url,
      roleNames: row.role_names,
      inVoice: row.in_voice,
      voiceChannelId: row.voice_channel_id,
      // Precedence: live game/stream activity > voice text > nothing.
      richPresenceText: activityText(row.activity_name, row.activity_type) ?? row.rich_presence_text,
      activityName: row.activity_name,
      activityType: row.activity_type,
      presenceStatus: row.presence_status,
      bannerUrl: row.banner_url,
      accentColor: row.accent_color
    }))
  });
});

// ── Bot-only: push Discord presence (online/idle/dnd/offline) ───────────────
// Called by the bot from its PresenceUpdate gateway listener. Bot is the only
// component with the privileged GuildPresences intent enabled.
membersRouter.post("/presence/:discordUserId", requireBotSecret, async (req, res) => {
  const guildId = getGuildId();
  if (!guildId) {
    res.status(400).json({ error: "DISCORD_GUILD_ID is not configured" });
    return;
  }
  const discordUserId = String(req.params.discordUserId ?? "");
  if (!/^\d{15,25}$/.test(discordUserId)) {
    res.status(400).json({ error: "Invalid discord user id" });
    return;
  }
  const status = req.body?.status;
  if (typeof status !== "string" || !PRESENCE_STATUSES.has(status)) {
    res.status(400).json({ error: "status must be one of online|idle|dnd|offline" });
    return;
  }
  const activityNameRaw = req.body?.activityName;
  const activityName =
    typeof activityNameRaw === "string" && activityNameRaw.trim().length > 0
      ? activityNameRaw.trim().slice(0, 120)
      : null;
  const activityTypeRaw = req.body?.activityType;
  const activityType = typeof activityTypeRaw === "number" ? activityTypeRaw : null;

  const result = await db.query(
    `
      UPDATE guild_members
      SET presence_status = $1,
          activity_name = $4,
          activity_type = $5,
          last_synced_at = NOW()
      WHERE guild_id = $2 AND discord_user_id = $3
    `,
    [status, guildId, discordUserId, activityName, activityType]
  );
  broadcast("members-changed");
  res.json({ ok: true, updated: result.rowCount ?? 0 });
});

membersRouter.post("/sync", requireSession, async (_req, res) => {
  try {
    const result = await syncGuildMembers();
    res.json(result);
  } catch (error) {
    if (error instanceof MemberSyncError) {
      res.status(error.status).json({ error: error.message, details: error.details });
      return;
    }
    throw error;
  }
});

// ── GET /members/:discordUserId/profile ──────────────────────────────────────
// Aggregated islander profile (CONTRACT P). Session-gated like the other member
// reads. Honors users.steam_visibility: when the target hid their library
// (visibility = 'private'), steamHidden is true and the steam-derived sections
// (topGames / achievements) are omitted.

// Nuggie rank tiers (lifetime-earned thresholds, ascending). Mirrors
// MILESTONE_TIERS in lib/nuggiesAchievements.ts; the highest threshold the
// user's lifetime-earned crosses is their tier. Kept local to avoid coupling
// this read route to the achievements engine.
const NUGGIE_TIERS: Array<{ threshold: number; label: string }> = [
  { threshold: 500, label: "TUTORIAL ISLAND" },
  { threshold: 2_000, label: "SIDEKICK" },
  { threshold: 5_000, label: "REGULAR" },
  { threshold: 15_000, label: "RISING STAR" },
  { threshold: 40_000, label: "A-LISTER" },
  { threshold: 100_000, label: "KING OF THE HILL" },
  { threshold: 250_000, label: "BIG BOSS" },
  { threshold: 750_000, label: "MR. WORLDWIDE" }
];

function nuggieTierFor(lifetimeEarned: number): string | null {
  let tier: string | null = null;
  for (const t of NUGGIE_TIERS) {
    if (lifetimeEarned >= t.threshold) tier = t.label;
  }
  return tier;
}

// Short human summary for a recent activity event. No reusable server-side
// helper exists (routes/activity.ts builds its label client-side), so map the
// known event-type prefixes to a one-liner.
function summarizeEvent(eventType: string, payload: Record<string, unknown>): string {
  const gameName = typeof payload.gameName === "string" ? payload.gameName : null;
  const label = typeof payload.label === "string" ? payload.label : null;
  if (eventType.startsWith("achievement.")) {
    return label ? `Unlocked ${label}` : "Unlocked an achievement";
  }
  if (eventType.startsWith("milestone.")) {
    return label ? `Reached ${label}` : "Reached a new milestone";
  }
  if (eventType === "game_night.game_picked") {
    return gameName ? `Picked ${gameName} for game night` : "Picked a game for game night";
  }
  if (eventType.startsWith("game_night.")) {
    return "Joined a game night";
  }
  if (eventType.startsWith("steam.")) {
    return gameName ? `Played ${gameName}` : "Steam activity";
  }
  if (eventType.startsWith("news.")) {
    return gameName ? `${gameName} news` : "Patch notes";
  }
  if (eventType === "forum_thread_created") {
    const title = typeof payload.title === "string" ? payload.title : null;
    return title ? `Started "${title}"` : "Started a forum thread";
  }
  if (eventType === "forum_reply_created") {
    const title = typeof payload.threadTitle === "string" ? payload.threadTitle : null;
    return title ? `Replied to "${title}"` : "Replied in the forums";
  }
  if (eventType === "forum.reactions_milestone") {
    const count = typeof payload.count === "number" ? payload.count : 0;
    return `A post hit ${count} reactions`;
  }
  if (eventType === "member.joined") {
    return "Joined the island 🌴";
  }
  if (eventType === "nuggies.daily_claimed") {
    const amount = typeof payload.amount === "number" ? payload.amount : 0;
    return `Claimed daily ₦${amount.toLocaleString()}`;
  }
  if (eventType === "casino.big_win") {
    const net = typeof payload.net === "number" ? payload.net : 0;
    return `Won big — +₦${net.toLocaleString()}`;
  }
  if (eventType === "nuggies.loan_accepted") {
    const principal = typeof payload.principal === "number" ? payload.principal : 0;
    return `Took a ₦${principal.toLocaleString()} loan`;
  }
  if (eventType === "nuggies.loan_repaid") {
    const amount = typeof payload.amount === "number" ? payload.amount : 0;
    return `Repaid a ₦${amount.toLocaleString()} loan`;
  }
  return "Activity on the island";
}

membersRouter.get("/:discordUserId/profile", requireSession, async (req, res) => {
  const guildId = getGuildId();
  if (!guildId) {
    res.status(400).json({ error: "DISCORD_GUILD_ID is not configured" });
    return;
  }
  const discordUserId = String(req.params.discordUserId ?? "");
  if (!/^\d{15,25}$/.test(discordUserId)) {
    res.status(400).json({ error: "Invalid discord user id" });
    return;
  }

  const baseResult = await db.query<{
    user_id: string;
    display_name: string | null;
    global_name: string | null;
    username: string | null;
    avatar_url: string | null;
    banner_url: string | null;
    accent_color: number | null;
    banner_checked_at: string | null;
    profile_blurb: string | null;
    role_names: string[] | null;
    joined_at_guild: string | null;
    premium_since: string | null;
    presence_status: string | null;
    in_voice: boolean | null;
    rich_presence_text: string | null;
    activity_name: string | null;
    activity_type: number | null;
    steam_id64: string | null;
    steam_persona_name: string | null;
    steam_avatar_url: string | null;
    steam_profile_url: string | null;
    steam_persona_state: number | null;
    steam_game_extra_info: string | null;
    steam_level: number | null;
    steam_time_created: string | null;
    steam_visibility: string;
  }>(
    `
      SELECT
        u.id::text AS user_id,
        gm.display_name,
        COALESCE(gm.global_name, dp.global_name) AS global_name,
        dp.username,
        COALESCE(gm.guild_avatar_url, gm.avatar_url, dp.avatar_url) AS avatar_url,
        COALESCE(gm.banner_url, dp.banner_url) AS banner_url,
        COALESCE(gm.accent_color, dp.accent_color) AS accent_color,
        gm.banner_checked_at,
        dp.profile_blurb,
        gm.role_names,
        gm.joined_at_guild,
        gm.premium_since,
        gm.presence_status,
        gm.in_voice,
        gm.rich_presence_text,
        gm.activity_name,
        gm.activity_type,
        sl.steam_id64,
        sl.persona_name AS steam_persona_name,
        sl.steam_avatar_url,
        sl.profile_url AS steam_profile_url,
        sl.persona_state AS steam_persona_state,
        CASE
          WHEN sl.game_app_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM steam_game_exclusions e
            WHERE e.user_id = u.id AND e.app_id = sl.game_app_id
          ) THEN NULL
          ELSE sl.game_extra_info
        END AS steam_game_extra_info,
        sl.steam_level,
        sl.time_created AS steam_time_created,
        u.steam_visibility
      FROM users u
      LEFT JOIN discord_profiles dp ON dp.user_id = u.id
      LEFT JOIN steam_links sl ON sl.user_id = u.id
      LEFT JOIN guild_members gm
        ON gm.discord_user_id = u.discord_user_id
       AND gm.guild_id = $2
       AND gm.in_guild = TRUE
      WHERE u.discord_user_id = $1
    `,
    [discordUserId, guildId]
  );
  const base = baseResult.rows[0];
  if (!base) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  const userId = BigInt(base.user_id);
  const steamLinked = Boolean(base.steam_id64);
  const steamHidden = base.steam_visibility === "private";

  // Lazy banner/accent backfill: the bulk member sync can't see a user's global
  // banner — only GET /users/:id returns it. Fetch best-effort on profile view,
  // at most once a week per member (banner_checked_at gate). Mutates `base` so
  // the response below reflects a fresh pull.
  let bannerUrl = base.banner_url;
  let accentColor = base.accent_color;
  const bannerStale =
    !base.banner_checked_at ||
    Date.now() - new Date(base.banner_checked_at).getTime() > 7 * 24 * 60 * 60 * 1000;
  if (env.DISCORD_BOT_TOKEN && bannerStale) {
    const fetched = await fetchDiscordUserBanner(discordUserId);
    if (fetched) {
      bannerUrl = fetched.bannerUrl ?? bannerUrl;
      accentColor = fetched.accentColor ?? accentColor;
    }
    await db.query(
      `UPDATE guild_members SET banner_url = $3, accent_color = $4, banner_checked_at = NOW()
       WHERE guild_id = $1 AND discord_user_id = $2`,
      [guildId, discordUserId, fetched?.bannerUrl ?? null, fetched?.accentColor ?? accentColor ?? null]
    );
  }

  const [activityResult, nuggiesResult, topGamesResult, achievementsResult] = await Promise.all([
    db.query<{ event_type: string; created_at: string; payload: Record<string, unknown> | null }>(
      `
        SELECT ae.event_type, ae.created_at, ae.payload
        FROM activity_events ae
        WHERE ae.actor_user_id = $1
          AND (
            ae.target_app_id IS NULL
            OR (ae.event_type NOT LIKE 'steam.%' AND ae.event_type NOT LIKE 'achievement.steam%')
            OR (
              (SELECT u2.steam_visibility FROM users u2 WHERE u2.id = $1) <> 'private'
              AND NOT EXISTS (
                SELECT 1 FROM steam_game_exclusions e
                WHERE e.user_id = $1 AND e.app_id = ae.target_app_id
              )
            )
          )
        ORDER BY ae.created_at DESC
        LIMIT 10
      `,
      [userId]
    ),
    db.query<{
      balance: string | null;
      lifetime_earned: string;
      title_name: string | null;
    }>(
      `
        SELECT
          nb.balance,
          COALESCE((
            SELECT SUM(amount) FROM nuggies_transactions
            WHERE user_id = $1 AND amount > 0
          ), 0)::text AS lifetime_earned,
          t.name AS title_name
        FROM (SELECT $1::bigint AS uid) _
        LEFT JOIN nuggies_balances nb ON nb.user_id = _.uid
        LEFT JOIN LATERAL (
          SELECT s.name
          FROM nuggies_inventory i
          INNER JOIN nuggies_shop_items s ON s.id = i.item_id
          WHERE i.user_id = _.uid AND i.equipped = TRUE AND s.item_type = 'title'
          LIMIT 1
        ) t ON TRUE
      `,
      [userId]
    ),
    steamHidden
      ? Promise.resolve({ rows: [] as Array<{ app_id: number; name: string; header_image_url: string | null; playtime_forever: number; playtime_2weeks: number }> })
      : db.query<{
          app_id: number;
          name: string;
          header_image_url: string | null;
          playtime_forever: number;
          playtime_2weeks: number;
        }>(
          `
            SELECT
              g.app_id,
              g.name,
              g.header_image_url,
              ug.playtime_minutes AS playtime_forever,
              ug.playtime_2weeks
            FROM shareable_user_games ug
            INNER JOIN games g ON g.app_id = ug.app_id
            WHERE ug.user_id = $1
            ORDER BY ug.playtime_minutes DESC, g.name ASC
            LIMIT 6
          `,
          [userId]
        ),
    steamHidden
      ? Promise.resolve({ rows: [] as Array<{ total_unlocked: string; app_id: number; name: string; completion_pct: number }> })
      : db.query<{ total_unlocked: string; app_id: number; name: string; completion_pct: number }>(
          `
            SELECT
              p.app_id,
              g.name,
              p.completion_pct,
              SUM(COALESCE(p.achievements_unlocked, 0)) OVER () AS total_unlocked
            FROM shareable_user_game_progress p
            INNER JOIN games g ON g.app_id = p.app_id
            WHERE p.user_id = $1
              AND p.achievements_total > 0
            ORDER BY p.completion_pct DESC NULLS LAST, g.name ASC
            LIMIT 6
          `,
          [userId]
        )
  ]);

  const nuggiesRow = nuggiesResult.rows[0];
  const balance = parseInt(nuggiesRow?.balance ?? "0", 10);
  const lifetimeEarned = parseInt(nuggiesRow?.lifetime_earned ?? "0", 10);

  const totalUnlocked = achievementsResult.rows[0]
    ? parseInt(achievementsResult.rows[0].total_unlocked, 10)
    : 0;

  res.json({
    discordUserId,
    displayName: base.display_name ?? base.global_name ?? base.username ?? "Crew member",
    globalName: base.global_name,
    avatarUrl: base.avatar_url,
    bannerUrl,
    accentColor,
    profileBlurb: base.profile_blurb,
    roleNames: base.role_names ?? [],
    joinedAtGuild: base.joined_at_guild,
    premiumSince: base.premium_since,
    presence: {
      status: base.presence_status,
      inVoice: Boolean(base.in_voice),
      richPresenceText: activityText(base.activity_name, base.activity_type) ?? base.rich_presence_text
    },
    steamLinked,
    steamHidden,
    steam:
      steamLinked && !steamHidden
        ? {
            personaName: base.steam_persona_name,
            avatarUrl: base.steam_avatar_url,
            profileUrl: base.steam_profile_url,
            personaState: base.steam_persona_state,
            inGame: base.steam_game_extra_info,
            level: base.steam_level,
            accountCreated: base.steam_time_created
          }
        : null,
    topGames: topGamesResult.rows.map((row) => ({
      appId: row.app_id,
      name: row.name,
      headerImageUrl: row.header_image_url,
      playtimeForever: row.playtime_forever,
      playtime2Weeks: row.playtime_2weeks
    })),
    recentActivity: activityResult.rows.map((row) => ({
      eventType: row.event_type,
      createdAt: row.created_at,
      summary: summarizeEvent(row.event_type, row.payload ?? {}),
      // Raw payload so the client can deep-link rows (e.g. forum threadId/postId).
      payload: row.payload ?? {}
    })),
    nuggies: {
      balance,
      tier: nuggieTierFor(lifetimeEarned),
      lifetimeEarned,
      equippedTitle: nuggiesRow?.title_name ?? null
    },
    achievements: {
      totalUnlocked,
      showcase: achievementsResult.rows.map((row) => ({
        appId: row.app_id,
        name: row.name,
        completionPct: row.completion_pct
      }))
    }
  });
});
