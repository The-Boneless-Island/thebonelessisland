import { env } from "../config.js";
import { db } from "../db/client.js";

// Steam player-summary sync. GetPlayerSummaries returns up to 100 players per
// call, so the whole guild's persona/avatar/in-game/account-age refreshes in a
// single request. GetSteamLevel is per-user (no batch endpoint) — done on a
// best-effort sequential pass. Read paths gate all of this on steam_visibility.

type PlayerSummary = {
  steamid: string;
  personaname?: string;
  avatarfull?: string;
  profileurl?: string;
  personastate?: number;
  gameextrainfo?: string;
  gameid?: string;
  timecreated?: number;
};

export async function syncSteamPlayerSummaries(): Promise<{ synced: number; skipped: boolean }> {
  if (!env.STEAM_WEB_API_KEY) return { synced: 0, skipped: true };

  const links = await db.query<{ user_id: string; steam_id64: string }>(
    `SELECT user_id::text AS user_id, steam_id64 FROM steam_links`
  );
  if (links.rows.length === 0) return { synced: 0, skipped: false };

  const userBySteamId = new Map(links.rows.map((r) => [r.steam_id64, r.user_id]));
  const ids = [...userBySteamId.keys()];
  let synced = 0;

  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const url =
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/` +
      `?key=${env.STEAM_WEB_API_KEY}&steamids=${batch.join(",")}`;
    const resp = await fetch(url).catch(() => null);
    if (!resp?.ok) continue;
    const data = (await resp.json().catch(() => null)) as { response?: { players?: PlayerSummary[] } } | null;
    for (const p of data?.response?.players ?? []) {
      const userId = userBySteamId.get(p.steamid);
      if (!userId) continue;
      const timeCreated = typeof p.timecreated === "number" ? new Date(p.timecreated * 1000) : null;
      const gameAppId = p.gameid ? Number(p.gameid) : null;
      await db.query(
        `
          UPDATE steam_links
          SET persona_name = $2,
              steam_avatar_url = $3,
              profile_url = $4,
              persona_state = $5,
              game_extra_info = $6,
              game_app_id = $7,
              time_created = COALESCE($8::timestamptz, time_created),
              summary_synced_at = NOW()
          WHERE user_id = $1
        `,
        [
          userId,
          p.personaname ?? null,
          p.avatarfull ?? null,
          p.profileurl ?? null,
          typeof p.personastate === "number" ? p.personastate : null,
          p.gameextrainfo ?? null,
          Number.isInteger(gameAppId) ? gameAppId : null,
          timeCreated
        ]
      );
      synced += 1;
    }
  }

  // Steam level — one call per user, best-effort.
  for (const [steamId, userId] of userBySteamId) {
    const url =
      `https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/` +
      `?key=${env.STEAM_WEB_API_KEY}&steamid=${steamId}`;
    const resp = await fetch(url).catch(() => null);
    if (!resp?.ok) continue;
    const data = (await resp.json().catch(() => null)) as { response?: { player_level?: number } } | null;
    const level = data?.response?.player_level;
    if (typeof level === "number") {
      await db.query(`UPDATE steam_links SET steam_level = $2 WHERE user_id = $1`, [userId, level]);
    }
  }

  return { synced, skipped: false };
}
