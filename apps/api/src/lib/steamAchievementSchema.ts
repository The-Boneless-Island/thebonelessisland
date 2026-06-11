import { env } from "../config.js";
import { db } from "../db/client.js";

// Per-game achievement schema (names/descriptions/icons via GetSchemaForGame)
// plus global rarity (GetGlobalAchievementPercentagesForApp). Both free and
// keyed by app, so we cache into game_achievements and refresh lazily. No
// per-user data here — this is the game's achievement catalogue.

type SchemaAchievement = {
  name?: string; // api_name
  displayName?: string;
  description?: string;
  icon?: string; // unlocked icon URL
  icongray?: string; // locked icon URL
  hidden?: number;
};

const SCHEMA_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function syncAchievementSchema(appId: number): Promise<{ ok: boolean; count: number }> {
  if (!env.STEAM_WEB_API_KEY) return { ok: false, count: 0 };

  // Skip if we synced this app recently.
  const existing = await db.query<{ synced_at: string }>(
    `SELECT MAX(synced_at) AS synced_at FROM game_achievements WHERE app_id = $1`,
    [appId]
  );
  const lastSynced = existing.rows[0]?.synced_at ? new Date(existing.rows[0].synced_at).getTime() : 0;
  if (lastSynced && Date.now() - lastSynced < SCHEMA_TTL_MS) {
    return { ok: true, count: 0 };
  }

  const schemaUrl =
    `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/` +
    `?key=${env.STEAM_WEB_API_KEY}&appid=${appId}&l=en`;
  const schemaResp = await fetch(schemaUrl).catch(() => null);
  if (!schemaResp?.ok) return { ok: false, count: 0 };
  const schemaData = (await schemaResp.json().catch(() => null)) as {
    game?: { availableGameStats?: { achievements?: SchemaAchievement[] } };
  } | null;
  const achievements = schemaData?.game?.availableGameStats?.achievements ?? [];
  if (achievements.length === 0) return { ok: true, count: 0 };

  // Global rarity percentages keyed by api_name.
  const rarityByName = new Map<string, number>();
  const statsUrl =
    `https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/` +
    `?gameid=${appId}`;
  const statsResp = await fetch(statsUrl).catch(() => null);
  if (statsResp?.ok) {
    const statsData = (await statsResp.json().catch(() => null)) as {
      achievementpercentages?: { achievements?: Array<{ name?: string; percent?: number }> };
    } | null;
    for (const a of statsData?.achievementpercentages?.achievements ?? []) {
      if (a.name && typeof a.percent === "number") rarityByName.set(a.name, a.percent);
    }
  }

  let count = 0;
  for (const a of achievements) {
    if (!a.name) continue;
    await db.query(
      `
        INSERT INTO game_achievements
          (app_id, api_name, display_name, description, icon_url, icon_gray_url, hidden, global_unlock_pct, synced_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (app_id, api_name) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          description = EXCLUDED.description,
          icon_url = EXCLUDED.icon_url,
          icon_gray_url = EXCLUDED.icon_gray_url,
          hidden = EXCLUDED.hidden,
          global_unlock_pct = COALESCE(EXCLUDED.global_unlock_pct, game_achievements.global_unlock_pct),
          synced_at = NOW()
      `,
      [
        appId,
        a.name,
        a.displayName ?? null,
        a.description ?? null,
        a.icon ?? null,
        a.icongray ?? null,
        a.hidden === 1,
        rarityByName.get(a.name) ?? null
      ]
    );
    count += 1;
  }
  return { ok: true, count };
}
