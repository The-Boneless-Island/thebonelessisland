import express from "express";
import { db } from "../db/client.js";
import { requireBotOrSession } from "../lib/auth.js";
import { filterHiddenSteamEvents } from "../lib/steamPrivacy.js";

export const activityRouter = express.Router();
activityRouter.use(requireBotOrSession);

type ActivityRow = {
  id: string;
  event_type: string;
  created_at: string;
  payload: Record<string, unknown> | null;
  actor_user_id: string | null;
  actor_discord_user_id: string | null;
  actor_username: string | null;
  actor_display_name: string | null;
  actor_avatar_url: string | null;
  target_discord_user_id: string | null;
  target_username: string | null;
  target_display_name: string | null;
  target_avatar_url: string | null;
  target_app_id: number | null;
  target_app_name: string | null;
  target_header_image_url: string | null;
  target_game_night_id: string | null;
};

type ActivityCategory =
  | "all"
  | "friends"
  | "achievements"
  | "milestones"
  | "patches"
  | "forums"
  | "nuggies";

function categorize(eventType: string): ActivityCategory {
  // Note: order matters — most-specific prefixes first.
  if (eventType === "game_night.game_picked" || eventType.startsWith("achievement.")) {
    return "achievements";
  }
  if (eventType.startsWith("milestone.")) return "milestones";
  if (eventType.startsWith("forum")) return "forums";
  if (eventType.startsWith("casino.") || eventType.startsWith("nuggies.")) return "nuggies";
  if (eventType.startsWith("member.")) return "friends";
  if (eventType.startsWith("game_night.")) return "friends";
  if (eventType.startsWith("steam.")) return "milestones";
  if (eventType.startsWith("news.")) return "patches";
  return "milestones";
}

activityRouter.get("/", async (req, res) => {
  const limitParam = Number(req.query.limit);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 100) : 50;

  const result = await db.query<ActivityRow>(
    `
      SELECT
        ae.id::text AS id,
        ae.event_type,
        ae.created_at,
        ae.payload,
        ae.actor_user_id::text AS actor_user_id,
        actor_user.discord_user_id AS actor_discord_user_id,
        actor_dp.username AS actor_username,
        actor_gm.display_name AS actor_display_name,
        actor_gm.avatar_url AS actor_avatar_url,
        target_user.discord_user_id AS target_discord_user_id,
        target_dp.username AS target_username,
        target_gm.display_name AS target_display_name,
        target_gm.avatar_url AS target_avatar_url,
        ae.target_app_id,
        target_game.name AS target_app_name,
        target_game.header_image_url AS target_header_image_url,
        ae.target_game_night_id::text AS target_game_night_id
      FROM activity_events ae
      LEFT JOIN users actor_user ON actor_user.id = ae.actor_user_id
      LEFT JOIN discord_profiles actor_dp ON actor_dp.user_id = actor_user.id
      LEFT JOIN guild_members actor_gm ON actor_gm.discord_user_id = actor_user.discord_user_id
      LEFT JOIN users target_user ON target_user.id = ae.target_user_id
      LEFT JOIN discord_profiles target_dp ON target_dp.user_id = target_user.id
      LEFT JOIN guild_members target_gm ON target_gm.discord_user_id = target_user.discord_user_id
      LEFT JOIN games target_game ON target_game.app_id = ae.target_app_id
      ORDER BY ae.created_at DESC
      LIMIT $1::int
    `,
    [limit]
  );

  // Read-time privacy backstop: drop any steam/achievement event whose game the
  // actor has since hidden (private library or per-game exclusion).
  const visibleRows = await filterHiddenSteamEvents(result.rows);

  res.json({
    events: visibleRows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      category: categorize(row.event_type),
      createdAt: row.created_at,
      actor: row.actor_discord_user_id
        ? {
            discordUserId: row.actor_discord_user_id,
            displayName: row.actor_display_name ?? row.actor_username ?? "Crew member",
            avatarUrl: row.actor_avatar_url
          }
        : null,
      target: row.target_discord_user_id
        ? {
            discordUserId: row.target_discord_user_id,
            displayName: row.target_display_name ?? row.target_username ?? "Crew member",
            avatarUrl: row.target_avatar_url
          }
        : null,
      game: row.target_app_id
        ? {
            appId: row.target_app_id,
            name: row.target_app_name ?? `App ${row.target_app_id}`,
            headerImageUrl: row.target_header_image_url
          }
        : null,
      gameNightId: row.target_game_night_id,
      payload: row.payload ?? {}
    }))
  });
});
