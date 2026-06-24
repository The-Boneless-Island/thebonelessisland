import { db } from "../db/client.js";
import { getAISetting, getGuildId } from "./serverSettings.js";

export function patchAlertsEnabled(): boolean {
  return getAISetting("patch_alerts_enabled") === "true";
}

/** All Steam app IDs owned by at least one in-guild crew member. */
export async function resolveCrewLibraryAppIds(): Promise<number[]> {
  const guildId = getGuildId();
  if (!guildId) return [];

  const result = await db.query<{ app_id: number }>(
    `
      SELECT DISTINCT ug.app_id
      FROM shareable_user_games ug
      INNER JOIN users u ON u.id = ug.user_id
      INNER JOIN guild_members gm
        ON gm.discord_user_id = u.discord_user_id
       AND gm.guild_id = $1
       AND gm.in_guild = TRUE
      ORDER BY ug.app_id ASC
    `,
    [guildId]
  );
  return result.rows.map((row) => row.app_id);
}

export async function enqueuePatchAlert(input: {
  appId: number;
  gameName: string;
  gid: string;
  title: string;
  url: string;
  bodyPreview: string | null;
  sourceLabel: string | null;
}): Promise<void> {
  if (!patchAlertsEnabled()) return;
  if (!getAISetting("patch_notes_channel_id")?.trim()) return;

  const roles = await db.query<{ discord_role_id: string }>(
    `SELECT discord_role_id FROM patch_alert_roles WHERE app_id = $1`,
    [input.appId]
  );
  const roleIds = roles.rows.map((row) => row.discord_role_id).filter(Boolean);

  await db.query(
    `INSERT INTO bot_announcements (kind, payload) VALUES ('game.patch', $1::jsonb)`,
    [
      JSON.stringify({
        appId: input.appId,
        gameName: input.gameName,
        gid: input.gid,
        title: input.title,
        url: input.url,
        bodyPreview: input.bodyPreview,
        sourceLabel: input.sourceLabel,
        roleIds,
      }),
    ]
  );

  await db.query(
    `UPDATE game_news SET discord_announced_at = NOW() WHERE app_id = $1 AND gid = $2`,
    [input.appId, input.gid]
  );
}
