import { db } from "../../db/client.js";

/** Best-effort link ai_game_title to a crew-library Steam app_id. */
export async function linkNewsToGame(newsId: number, gameTitle: string | null): Promise<number | null> {
  const title = (gameTitle ?? "").trim();
  if (title.length < 2) return null;

  const r = await db.query<{ app_id: number }>(
    `
      SELECT g.app_id
        FROM games g
       WHERE LOWER(g.name) = LOWER($1)
          OR g.name ILIKE $2
       ORDER BY (
         SELECT COUNT(DISTINCT ug.user_id)
           FROM shareable_user_games ug
          WHERE ug.app_id = g.app_id
       ) DESC
       LIMIT 1
    `,
    [title, `${title}%`]
  );

  const appId = r.rows[0]?.app_id ?? null;
  if (!appId) return null;

  await db.query(
    `UPDATE general_news SET linked_app_id = $2 WHERE id = $1 AND linked_app_id IS NULL`,
    [newsId, appId]
  );
  return appId;
}
