// Daily snapshot of the crew's rolling 2-week playtime per app. Steam only
// reports the rolling window, so "trending up vs last fortnight" needs us to
// remember what the window looked like ~14 days ago. Scope mirrors the
// /steam/crew-trending aggregate: shareable games owned by in-guild members.

import { db } from "../db/client.js";
import { getGuildId } from "./serverSettings.js";

/** Upsert today's per-app totals. Idempotent within a day. */
export async function snapshotCrewTrending(): Promise<{ apps: number }> {
  const guildId = getGuildId();
  if (!guildId) return { apps: 0 };

  const r = await db.query(
    `
      INSERT INTO crew_trending_snapshots (app_id, total_minutes_2weeks, players, captured_on)
      SELECT
        ug.app_id,
        COALESCE(SUM(ug.playtime_2weeks), 0)::int,
        COUNT(DISTINCT ug.user_id) FILTER (WHERE ug.playtime_2weeks > 0)::int,
        CURRENT_DATE
      FROM shareable_user_games ug
      INNER JOIN users u ON u.id = ug.user_id
      INNER JOIN guild_members gm
        ON gm.discord_user_id = u.discord_user_id
       AND gm.guild_id = $1
       AND gm.in_guild = TRUE
      WHERE ug.playtime_2weeks > 0
      GROUP BY ug.app_id
      ON CONFLICT (app_id, captured_on) DO UPDATE
        SET total_minutes_2weeks = EXCLUDED.total_minutes_2weeks,
            players = EXCLUDED.players
    `,
    [guildId]
  );
  return { apps: r.rowCount ?? 0 };
}
