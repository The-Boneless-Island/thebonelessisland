import express from "express";
import { env } from "../config.js";
import { db } from "../db/client.js";
import { getGuildId } from "../lib/serverSettings.js";
import { requireBotSecret, requireSession } from "../lib/auth.js";

const PRESENCE_STATUSES = new Set(["online", "idle", "dnd", "offline"]);

type DiscordGuildMember = {
  nick?: string | null;
  roles?: string[];
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
    role_names: string[];
    in_voice: boolean;
    rich_presence_text: string | null;
    presence_status: string | null;
  }>(
    `
      SELECT discord_user_id, username, display_name, avatar_url, role_names,
             in_voice, rich_presence_text, presence_status
      FROM guild_members
      WHERE guild_id = $1 AND in_guild = TRUE
      ORDER BY username ASC
      LIMIT 2000
    `,
    [getGuildId()]
  );

  res.json({
    members: members.rows.map((row) => ({
      discordUserId: row.discord_user_id,
      username: row.username,
      displayName: row.display_name ?? row.username,
      avatarUrl: row.avatar_url,
      roleNames: row.role_names,
      inVoice: row.in_voice,
      richPresenceText: row.rich_presence_text,
      presenceStatus: row.presence_status
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

  const result = await db.query(
    `
      UPDATE guild_members
      SET presence_status = $1, last_synced_at = NOW()
      WHERE guild_id = $2 AND discord_user_id = $3
    `,
    [status, guildId, discordUserId]
  );
  res.json({ ok: true, updated: result.rowCount ?? 0 });
});

membersRouter.post("/sync", requireSession, async (_req, res) => {
  if (!getGuildId() || !env.DISCORD_BOT_TOKEN) {
    res.status(400).json({ error: "DISCORD_GUILD_ID and DISCORD_BOT_TOKEN are required for member sync" });
    return;
  }

  const guildCheck = await fetch(`https://discord.com/api/v10/guilds/${getGuildId()}`, {
    headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
  });

  if (!guildCheck.ok) {
    const body = await guildCheck.text().catch(() => "");
    res.status(502).json({
      error: "Bot cannot access the configured Discord guild",
      details:
        body.slice(0, 300) ||
        "Verify DISCORD_GUILD_ID matches your server and that the bot is invited to that server."
    });
    return;
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
    res.status(502).json({
      error: `Discord member sync failed (${response.status})`,
      details: `${body.slice(0, 300)} ${guidance}`.trim()
    });
    return;
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
      const avatarUrl = avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png` : null;
      const displayName = member.nick?.trim() || member.user?.global_name?.trim() || username;
      const roleIds = (member.roles ?? []).filter(Boolean);
      const roleNames = roleIds.map((roleId) => roleNameById.get(roleId) ?? `role:${roleId}`);
      return { id, username, displayName, avatarUrl, roleIds, roleNames };
    })
    .filter(
      (
        row
      ): row is {
        id: string;
        username: string;
        displayName: string;
        avatarUrl: string | null;
        roleIds: string[];
        roleNames: string[];
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

  for (const { memberId, response } of voiceResults) {
    if (!response) {
      voiceDiagnostics.ok = false;
      voiceDiagnostics.status = null;
      voiceDiagnostics.details = "Voice state request failed before Discord responded.";
      continue;
    }
    if (response.status === 404) {
      continue;
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      voiceDiagnostics.ok = false;
      voiceDiagnostics.status = response.status;
      if (!voiceDiagnostics.details) {
        voiceDiagnostics.details = body.slice(0, 300) || "Discord rejected voice state request.";
      }
      continue;
    }
    const voiceState = (await response.json()) as DiscordVoiceState;
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
            avatar_url,
            role_ids,
            role_names,
            in_voice,
            voice_channel_id,
            rich_presence_text,
            in_guild,
            last_synced_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::text[], $7::text[], $8, $9, $10, TRUE, NOW())
          ON CONFLICT (guild_id, discord_user_id)
          DO UPDATE SET
            username = EXCLUDED.username,
            display_name = EXCLUDED.display_name,
            avatar_url = EXCLUDED.avatar_url,
            role_ids = EXCLUDED.role_ids,
            role_names = EXCLUDED.role_names,
            in_voice = EXCLUDED.in_voice,
            voice_channel_id = EXCLUDED.voice_channel_id,
            rich_presence_text = EXCLUDED.rich_presence_text,
            in_guild = TRUE,
            last_synced_at = NOW()
        `,
        [
          getGuildId(),
          member.id,
          member.username,
          member.displayName,
          member.avatarUrl,
          member.roleIds,
          member.roleNames,
          inVoice,
          voiceChannelId,
          richPresenceText
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

  res.json({ syncedMembers: normalized.length, voice: voiceDiagnostics });
});
