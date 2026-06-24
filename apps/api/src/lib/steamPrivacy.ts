import { db } from "../db/client.js";

export async function isGameShareableByUserId(userId: number | bigint, appId: number): Promise<boolean> {
  const result = await db.query<{ ok: boolean }>(
    `
      SELECT TRUE AS ok
      FROM users u
      WHERE u.id = $1
        AND u.steam_visibility <> 'private'
        AND NOT EXISTS (
          SELECT 1 FROM steam_game_exclusions e
          WHERE e.user_id = $1 AND e.app_id = $2
        )
      LIMIT 1
    `,
    [userId, appId]
  );
  return result.rows.length > 0;
}

type ShareablePair = { userId: number; appId: number };

async function batchShareablePairs(pairs: ShareablePair[]): Promise<Set<string>> {
  if (pairs.length === 0) return new Set();

  const userIds = pairs.map((p) => p.userId);
  const appIds = pairs.map((p) => p.appId);

  const result = await db.query<{ user_id: string; app_id: number }>(
    `
      SELECT u.id::text AS user_id, apps.app_id
      FROM unnest($1::bigint[], $2::int[]) AS apps(user_id, app_id)
      INNER JOIN users u ON u.id = apps.user_id
      WHERE u.steam_visibility <> 'private'
        AND NOT EXISTS (
          SELECT 1 FROM steam_game_exclusions e
          WHERE e.user_id = u.id AND e.app_id = apps.app_id
        )
    `,
    [userIds, appIds]
  );

  return new Set(result.rows.map((r) => `${r.user_id}:${r.app_id}`));
}

export async function filterHiddenSteamEvents<
  T extends { event_type: string; actor_user_id: number | string | null; target_app_id: number | null }
>(rows: T[]): Promise<T[]> {
  const toCheck = rows.filter(
    (r) =>
      r.target_app_id != null &&
      r.actor_user_id != null &&
      (r.event_type.startsWith("steam.") || r.event_type.startsWith("achievement.steam"))
  );
  if (toCheck.length === 0) return rows;

  const uniquePairs = new Map<string, ShareablePair>();
  for (const r of toCheck) {
    const key = `${r.actor_user_id}:${r.target_app_id}`;
    if (!uniquePairs.has(key)) {
      uniquePairs.set(key, {
        userId: Number(r.actor_user_id),
        appId: r.target_app_id as number,
      });
    }
  }

  const shareable = await batchShareablePairs([...uniquePairs.values()]);

  return rows.filter((r) => {
    if (
      r.target_app_id != null &&
      r.actor_user_id != null &&
      (r.event_type.startsWith("steam.") || r.event_type.startsWith("achievement.steam"))
    ) {
      return shareable.has(`${r.actor_user_id}:${r.target_app_id}`);
    }
    return true;
  });
}
