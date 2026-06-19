import { db } from "../db/client.js";

// Canonical "is this (member, game) shareable?" check — mirrors the SQL
// shareable_* views for code paths that can't go through them (event emission,
// read-time filters). A game is shareable when the member's library is not
// private AND the game is not individually excluded.

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

// Filter a list of activity rows down to those a viewer may see: drop any
// steam-derived, game-tied event whose (actor, app) is currently hidden.
// Defense-in-depth behind the emit-time guard in recordEvent.
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

  const shareable = new Set<string>();
  await Promise.all(
    toCheck.map(async (r) => {
      const ok = await isGameShareableByUserId(Number(r.actor_user_id), r.target_app_id as number);
      if (ok) shareable.add(`${r.actor_user_id}:${r.target_app_id}`);
    })
  );

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
