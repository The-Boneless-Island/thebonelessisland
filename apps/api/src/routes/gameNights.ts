import express from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { getGuildId, getParentRoleName } from "../lib/serverSettings.js";
import { isValidBotSecret, requireSession, requireParentRole } from "../lib/auth.js";
import { recordEvent } from "../lib/activityEvents.js";
import { broadcast } from "../lib/eventBus.js";
import { whatCanWePlay } from "../lib/recommend.js";
import { generateRecommendationBlurb } from "../lib/recommendBlurb.js";

const createGameNightSchema = z.object({
  title: z.string().trim().min(1).max(120),
  scheduledFor: z.iso.datetime(),
  attendeeIds: z.array(z.string().trim().min(1)).optional(),
  selectedAppId: z.number().int().positive().nullish(),
  // Default: the host joins as an attendee. A parent-role admin may set this
  // false to create a night for others without being counted as a player.
  joinAsHost: z.boolean().optional()
});

const setNightGameSchema = z.object({
  appId: z.number().int().positive().nullable()
});

const recommendationSchema = z.object({
  memberIds: z.array(z.string().trim().min(1)).min(1).optional(),
  sessionLength: z.enum(["short", "long", "any"]).default("any")
});

const manageAttendeesSchema = z.object({
  memberIds: z.array(z.string().trim().min(1)).min(1)
});

const adminUpdateGameNightSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    scheduledFor: z.iso.datetime().optional(),
    // null clears the locked pick; a number locks the given game.
    selectedAppId: z.number().int().positive().nullable().optional()
  })
  .refine((body) => Object.keys(body).length > 0, { message: "No fields to update" });

type AuthedUser = { id: number; discord_user_id: string };

async function getAuthedUser(discordUserId: string): Promise<AuthedUser | null> {
  const result = await db.query<AuthedUser>(
    `SELECT id, discord_user_id FROM users WHERE discord_user_id = $1`,
    [discordUserId]
  );
  return result.rows[0] ?? null;
}

async function gameExists(appId: number): Promise<boolean> {
  const result = await db.query<{ app_id: number }>(`SELECT app_id FROM games WHERE app_id = $1`, [appId]);
  return Boolean(result.rows[0]);
}

// Parent-role check usable mid-handler (the requireParentRole middleware would
// reject a non-admin host outright, but a host may set their own night's game).
async function isParentRole(discordUserId: string): Promise<boolean> {
  const guildId = getGuildId();
  if (!guildId) return false;
  const result = await db.query<{ role_names: string[] }>(
    `
      SELECT COALESCE(role_names, '{}'::text[]) AS role_names
      FROM guild_members
      WHERE guild_id = $1 AND discord_user_id = $2 AND in_guild = TRUE
      LIMIT 1
    `,
    [guildId, discordUserId]
  );
  return (result.rows[0]?.role_names ?? []).includes(getParentRoleName());
}

export const gameNightRouter = express.Router();

async function gameNightExists(id: number): Promise<boolean> {
  const result = await db.query<{ id: number }>(`SELECT id FROM game_nights WHERE id = $1`, [id]);
  return Boolean(result.rows[0]);
}

function canAccessFromSessionOrBot(req: express.Request): boolean {
  if (Boolean(req.session?.userId)) {
    return true;
  }
  return isValidBotSecret(req.get("x-island-bot-secret"));
}

async function ensureUsersForDiscordIds(discordIds: string[]): Promise<void> {
  if (!discordIds.length) return;

  await db.query(
    `
      INSERT INTO users (discord_user_id)
      SELECT UNNEST($1::text[])
      ON CONFLICT (discord_user_id) DO NOTHING
    `,
    [discordIds]
  );

  await db.query(
    `
      INSERT INTO discord_profiles (user_id, username, avatar_url)
      SELECT
        u.id,
        COALESCE(gm.username, 'member-' || u.discord_user_id),
        gm.avatar_url
      FROM users u
      LEFT JOIN guild_members gm
        ON gm.discord_user_id = u.discord_user_id
        AND gm.guild_id = $2
      WHERE u.discord_user_id = ANY($1::text[])
      ON CONFLICT (user_id)
      DO UPDATE SET
        username = EXCLUDED.username,
        avatar_url = COALESCE(EXCLUDED.avatar_url, discord_profiles.avatar_url)
    `,
    [discordIds, getGuildId()]
  );
}

async function addAttendeesByDiscordIds(gameNightId: number, discordIds: string[]): Promise<void> {
  if (!discordIds.length) return;
  await ensureUsersForDiscordIds(discordIds);

  await db.query(
    `
      INSERT INTO game_night_attendees (game_night_id, user_id)
      SELECT $1, u.id
      FROM users u
      WHERE u.discord_user_id = ANY($2::text[])
      ON CONFLICT (game_night_id, user_id) DO NOTHING
    `,
    [gameNightId, discordIds]
  );
}


gameNightRouter.get("/", requireSession, async (_req, res) => {
  const discordUserId = String(res.locals.userId);
  const user = await getAuthedUser(discordUserId);
  if (!user) {
    res.status(401).json({ error: "User not found for active session" });
    return;
  }

  // Parent-role admins can manage any night's game; computed once per request.
  const isAdmin = await isParentRole(discordUserId);

  const nights = await db.query<{
    id: number;
    title: string;
    scheduled_for: string;
    created_by_user_id: number;
    selected_game_name: string | null;
    selected_app_id: number | null;
    selected_game_image: string | null;
    selected_is_single_player: boolean | null;
    selected_is_online_coop: boolean | null;
    selected_is_lan_coop: boolean | null;
    selected_is_shared_split_coop: boolean | null;
    selected_is_online_pvp: boolean | null;
    selected_is_mmo: boolean | null;
    selected_max_players: number | null;
    selected_tags: string[] | null;
    selected_at: string | null;
    attendee_count: number;
    current_user_attending: boolean;
    attendees: Array<{ displayName: string; avatarUrl: string | null; ownsSelected: boolean }>;
  }>(
    `
      SELECT
        gn.id,
        gn.title,
        gn.scheduled_for,
        gn.created_by_user_id,
        selected_game.name AS selected_game_name,
        gn.selected_app_id,
        selected_game.header_image_url AS selected_game_image,
        selected_game.is_single_player     AS selected_is_single_player,
        selected_game.is_online_coop       AS selected_is_online_coop,
        selected_game.is_lan_coop          AS selected_is_lan_coop,
        selected_game.is_shared_split_coop AS selected_is_shared_split_coop,
        selected_game.is_online_pvp        AS selected_is_online_pvp,
        selected_game.is_mmo               AS selected_is_mmo,
        selected_game.mp_max_players_approx AS selected_max_players,
        selected_game.tags                  AS selected_tags,
        gn.selected_at,
        COUNT(gna.user_id)::int AS attendee_count,
        COALESCE(BOOL_OR(gna.user_id = $1), false) AS current_user_attending,
        (
          SELECT COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT('displayName', a.display_name, 'avatarUrl', a.avatar_url, 'ownsSelected', a.owns_selected)
              ORDER BY a.display_name ASC
            ),
            '[]'::json
          )
          FROM (
            SELECT
              COALESCE(gm.display_name, gm.username, dp.username, 'islander') AS display_name,
              COALESCE(gm.avatar_url, dp.avatar_url) AS avatar_url,
              EXISTS (
                SELECT 1 FROM shareable_user_games sug
                WHERE sug.user_id = u2.id AND sug.app_id = gn.selected_app_id
              ) AS owns_selected
            FROM game_night_attendees gna2
            INNER JOIN users u2 ON u2.id = gna2.user_id
            LEFT JOIN guild_members gm
              ON gm.discord_user_id = u2.discord_user_id
             AND gm.guild_id = $2
             AND gm.in_guild = TRUE
            LEFT JOIN discord_profiles dp ON dp.user_id = u2.id
            WHERE gna2.game_night_id = gn.id
            LIMIT 12
          ) a
        ) AS attendees
      FROM game_nights gn
      LEFT JOIN games selected_game ON selected_game.app_id = gn.selected_app_id
      LEFT JOIN game_night_attendees gna ON gna.game_night_id = gn.id
      WHERE gn.scheduled_for >= NOW() - INTERVAL '12 hours'
      GROUP BY
        gn.id,
        gn.title,
        gn.scheduled_for,
        gn.created_by_user_id,
        selected_game.app_id,
        selected_game.name,
        gn.selected_app_id,
        gn.selected_at
      ORDER BY gn.scheduled_for ASC
      LIMIT 25
    `,
    [user.id, getGuildId()]
  );

  res.json({
    gameNights: nights.rows.map((row) => ({
      id: row.id,
      title: row.title,
      scheduledFor: row.scheduled_for,
      createdByUserId: row.created_by_user_id,
      canManageGame: row.created_by_user_id === user.id || isAdmin,
      selectedGameName: row.selected_game_name,
      selectedAppId: row.selected_app_id,
      selectedGameImage: row.selected_game_image,
      selectedGameModes: row.selected_app_id
        ? {
            isSinglePlayer: Boolean(row.selected_is_single_player),
            isOnlineCoop: Boolean(row.selected_is_online_coop),
            isLanCoop: Boolean(row.selected_is_lan_coop),
            isSharedSplitCoop: Boolean(row.selected_is_shared_split_coop),
            isOnlinePvp: Boolean(row.selected_is_online_pvp),
            isMmo: Boolean(row.selected_is_mmo)
          }
        : null,
      selectedAt: row.selected_at,
      selectedMaxPlayers: row.selected_max_players,
      selectedTags: row.selected_tags ?? [],
      attendeeCount: row.attendee_count,
      currentUserAttending: row.current_user_attending,
      attendees: row.attendees
    }))
  });
});

gameNightRouter.post("/", requireSession, async (req, res) => {
  const body = createGameNightSchema.parse(req.body);
  const discordUserId = String(res.locals.userId);
  const user = await getAuthedUser(discordUserId);

  if (!user) {
    res.status(401).json({ error: "User not found for active session" });
    return;
  }

  const selectedAppId = body.selectedAppId ?? null;
  if (selectedAppId !== null && !(await gameExists(selectedAppId))) {
    res.status(400).json({ error: "Selected game not found" });
    return;
  }

  const created = await db.query<{ id: number }>(
    `
      INSERT INTO game_nights (title, scheduled_for, created_by_user_id, selected_app_id, selected_at)
      VALUES ($1, $2::timestamptz, $3, $4, CASE WHEN $4::int IS NULL THEN NULL ELSE NOW() END)
      RETURNING id
    `,
    [body.title, body.scheduledFor, user.id, selectedAppId]
  );

  const gameNightId = created.rows[0]?.id;
  if (gameNightId) {
    // Host auto-joins as an attendee unless a parent-role admin opted out.
    const hostOptsOut = body.joinAsHost === false && (await isParentRole(discordUserId));
    const attendeeIds = Array.from(
      new Set([...(body.attendeeIds ?? []), ...(hostOptsOut ? [] : [discordUserId])])
    );
    await addAttendeesByDiscordIds(gameNightId, attendeeIds);
    void recordEvent({
      eventType: "game_night.created",
      actorDiscordUserId: discordUserId,
      targetGameNightId: gameNightId,
      payload: { title: body.title, scheduledFor: body.scheduledFor }
    });
    if (selectedAppId !== null) {
      void recordEvent({
        eventType: "game_night.game_picked",
        actorDiscordUserId: discordUserId,
        targetGameNightId: gameNightId,
        targetAppId: selectedAppId,
        payload: { appId: selectedAppId }
      });
    }
    broadcast("nights-changed");
  }

  res.status(201).json({ id: gameNightId });
});

// ── Admin (Parent-only) game-night management ────────────────────────────────

// Every game night, including past/ended ones, with host + locked pick. Powers
// the admin management table (the public GET "/" only returns upcoming nights).
gameNightRouter.get("/admin/all", requireParentRole, async (_req, res) => {
  const nights = await db.query<{
    id: number;
    title: string;
    scheduled_for: string;
    created_by_user_id: number;
    host_name: string | null;
    host_avatar_url: string | null;
    selected_app_id: number | null;
    selected_game_name: string | null;
    selected_at: string | null;
    attendee_count: number;
  }>(
    `
      SELECT
        gn.id,
        gn.title,
        gn.scheduled_for,
        gn.created_by_user_id,
        COALESCE(gm.display_name, gm.username, dp.username) AS host_name,
        COALESCE(gm.avatar_url, dp.avatar_url) AS host_avatar_url,
        gn.selected_app_id,
        selected_game.name AS selected_game_name,
        gn.selected_at,
        COUNT(gna.user_id)::int AS attendee_count
      FROM game_nights gn
      LEFT JOIN users host_user ON host_user.id = gn.created_by_user_id
      LEFT JOIN guild_members gm
        ON gm.discord_user_id = host_user.discord_user_id
       AND gm.guild_id = $1
      LEFT JOIN discord_profiles dp ON dp.user_id = gn.created_by_user_id
      LEFT JOIN games selected_game ON selected_game.app_id = gn.selected_app_id
      LEFT JOIN game_night_attendees gna ON gna.game_night_id = gn.id
      GROUP BY
        gn.id,
        gn.title,
        gn.scheduled_for,
        gn.created_by_user_id,
        gm.display_name,
        gm.username,
        dp.username,
        gm.avatar_url,
        dp.avatar_url,
        gn.selected_app_id,
        selected_game.name,
        gn.selected_at
      ORDER BY gn.scheduled_for DESC
      LIMIT 200
    `,
    [getGuildId()]
  );

  const now = Date.now();
  res.json({
    gameNights: nights.rows.map((row) => ({
      id: row.id,
      title: row.title,
      scheduledFor: row.scheduled_for,
      createdByUserId: row.created_by_user_id,
      hostName: row.host_name,
      hostAvatarUrl: row.host_avatar_url,
      selectedAppId: row.selected_app_id,
      selectedGameName: row.selected_game_name,
      selectedAt: row.selected_at,
      attendeeCount: row.attendee_count,
      isPast: new Date(row.scheduled_for).getTime() < now
    }))
  });
});

gameNightRouter.patch("/:id", requireParentRole, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid game night id" });
    return;
  }
  if (!(await gameNightExists(id))) {
    res.status(404).json({ error: "Game night not found" });
    return;
  }

  const body = adminUpdateGameNightSchema.parse(req.body ?? {});

  const sets: string[] = [];
  const params: unknown[] = [id];

  if (body.title !== undefined) {
    params.push(body.title);
    sets.push(`title = $${params.length}`);
  }
  if (body.scheduledFor !== undefined) {
    params.push(body.scheduledFor);
    sets.push(`scheduled_for = $${params.length}::timestamptz`);
  }
  if (body.selectedAppId !== undefined) {
    if (body.selectedAppId === null) {
      sets.push(`selected_app_id = NULL`, `selected_at = NULL`);
    } else {
      if (!(await gameExists(body.selectedAppId))) {
        res.status(400).json({ error: "Selected game not found" });
        return;
      }
      params.push(body.selectedAppId);
      sets.push(`selected_app_id = $${params.length}`, `selected_at = NOW()`);
    }
  }

  await db.query(`UPDATE game_nights SET ${sets.join(", ")} WHERE id = $1`, params);

  void recordEvent({
    eventType: "game_night.admin_updated",
    actorDiscordUserId: String(res.locals.userId),
    targetGameNightId: id,
    payload: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.scheduledFor !== undefined ? { scheduledFor: body.scheduledFor } : {}),
      ...(body.selectedAppId !== undefined ? { selectedAppId: body.selectedAppId } : {})
    }
  });

  broadcast("nights-changed");
  res.json({ ok: true });
});

gameNightRouter.delete("/:id", requireParentRole, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid game night id" });
    return;
  }
  if (!(await gameNightExists(id))) {
    res.status(404).json({ error: "Game night not found" });
    return;
  }

  // game_night_attendees + game_night_votes cascade; activity_events set null.
  await db.query(`DELETE FROM game_nights WHERE id = $1`, [id]);

  void recordEvent({
    eventType: "game_night.admin_deleted",
    actorDiscordUserId: String(res.locals.userId),
    payload: { gameNightId: id }
  });

  broadcast("nights-changed");
  res.json({ ok: true });
});

gameNightRouter.patch("/:id/game", requireSession, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid game night id" });
    return;
  }

  const body = setNightGameSchema.parse(req.body);
  const discordUserId = String(res.locals.userId);
  const user = await getAuthedUser(discordUserId);
  if (!user) {
    res.status(401).json({ error: "User not found for active session" });
    return;
  }

  const night = await db.query<{ created_by_user_id: number }>(
    `SELECT created_by_user_id FROM game_nights WHERE id = $1`,
    [id]
  );
  const row = night.rows[0];
  if (!row) {
    res.status(404).json({ error: "Game night not found" });
    return;
  }

  // Only the host who created the night (or a parent-role admin) may set/clear
  // the game. A non-admin host can still manage their own night.
  const isHost = row.created_by_user_id === user.id;
  if (!isHost && !(await isParentRole(discordUserId))) {
    res.status(403).json({ error: "Only the host or an admin can set the game" });
    return;
  }

  if (body.appId !== null && !(await gameExists(body.appId))) {
    res.status(400).json({ error: "Selected game not found" });
    return;
  }

  await db.query(
    `
      UPDATE game_nights
         SET selected_app_id = $1,
             selected_at = CASE WHEN $1::int IS NULL THEN NULL ELSE NOW() END
       WHERE id = $2
    `,
    [body.appId, id]
  );

  if (body.appId !== null) {
    void recordEvent({
      eventType: "game_night.game_picked",
      actorDiscordUserId: discordUserId,
      targetGameNightId: id,
      targetAppId: body.appId,
      payload: { appId: body.appId }
    });
  }

  broadcast("nights-changed");
  res.json({ ok: true, selectedAppId: body.appId });
});

gameNightRouter.get("/:id/attendees", requireSession, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid game night id" });
    return;
  }

  const discordUserId = String(res.locals.userId);
  const user = await getAuthedUser(discordUserId);
  if (!user) {
    res.status(401).json({ error: "User not found for active session" });
    return;
  }

  if (!(await gameNightExists(id))) {
    res.status(404).json({ error: "Game night not found" });
    return;
  }

  const attendees = await db.query<{ discord_user_id: string; username: string }>(
    `
      SELECT u.discord_user_id, dp.username
      FROM game_night_attendees gna
      INNER JOIN users u ON u.id = gna.user_id
      INNER JOIN discord_profiles dp ON dp.user_id = u.id
      WHERE gna.game_night_id = $1
      ORDER BY dp.username ASC
    `,
    [id]
  );

  res.json({
    attendees: attendees.rows.map((row) => ({
      discordUserId: row.discord_user_id,
      username: row.username
    })),
    currentUserIsAttending: attendees.rows.some((row) => row.discord_user_id === discordUserId)
  });
});

gameNightRouter.post("/:id/attendees/me", requireSession, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid game night id" });
    return;
  }

  const discordUserId = String(res.locals.userId);
  const user = await getAuthedUser(discordUserId);
  if (!user) {
    res.status(401).json({ error: "User not found for active session" });
    return;
  }

  if (!(await gameNightExists(id))) {
    res.status(404).json({ error: "Game night not found" });
    return;
  }

  await db.query(
    `
      INSERT INTO game_night_attendees (game_night_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (game_night_id, user_id) DO NOTHING
    `,
    [id, user.id]
  );

  void recordEvent({
    eventType: "game_night.rsvp_joined",
    actorDiscordUserId: discordUserId,
    targetGameNightId: id
  });

  broadcast("nights-changed");

  res.json({ ok: true });
});

gameNightRouter.delete("/:id/attendees/me", requireSession, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid game night id" });
    return;
  }

  const discordUserId = String(res.locals.userId);
  const user = await getAuthedUser(discordUserId);
  if (!user) {
    res.status(401).json({ error: "User not found for active session" });
    return;
  }

  if (!(await gameNightExists(id))) {
    res.status(404).json({ error: "Game night not found" });
    return;
  }

  await db.query(`DELETE FROM game_night_attendees WHERE game_night_id = $1 AND user_id = $2`, [id, user.id]);

  void recordEvent({
    eventType: "game_night.rsvp_left",
    actorDiscordUserId: discordUserId,
    targetGameNightId: id
  });

  broadcast("nights-changed");

  res.json({ ok: true });
});

gameNightRouter.post("/:id/attendees", requireSession, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid game night id" });
    return;
  }

  if (!(await gameNightExists(id))) {
    res.status(404).json({ error: "Game night not found" });
    return;
  }

  const body = manageAttendeesSchema.parse(req.body);
  await addAttendeesByDiscordIds(id, body.memberIds);
  res.json({ ok: true, addedMemberIds: body.memberIds });
});

gameNightRouter.delete("/:id/attendees", requireSession, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid game night id" });
    return;
  }

  if (!(await gameNightExists(id))) {
    res.status(404).json({ error: "Game night not found" });
    return;
  }

  const body = manageAttendeesSchema.parse(req.body);
  await db.query(
    `
      DELETE FROM game_night_attendees gna
      USING users u
      WHERE gna.game_night_id = $1
        AND gna.user_id = u.id
        AND u.discord_user_id = ANY($2::text[])
    `,
    [id, body.memberIds]
  );

  res.json({ ok: true, removedMemberIds: body.memberIds });
});

gameNightRouter.post("/:id/recommendations", async (req, res) => {
  if (!canAccessFromSessionOrBot(req)) {
    res.status(401).json({ error: "Not authorized to access game night recommendations" });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid game night id" });
    return;
  }

  const body = recommendationSchema.parse(req.body ?? {});
  if (!(await gameNightExists(id))) {
    res.status(404).json({ error: "Game night not found" });
    return;
  }

  let memberIds = body.memberIds ?? [];

  if (memberIds.length === 0) {
    const attendees = await db.query<{ discord_user_id: string }>(
      `
        SELECT u.discord_user_id
        FROM game_night_attendees gna
        INNER JOIN users u ON u.id = gna.user_id
        WHERE gna.game_night_id = $1
      `,
      [id]
    );
    memberIds = attendees.rows.map((row) => row.discord_user_id);
  }

  if (memberIds.length === 0) {
    const voters = await db.query<{ discord_user_id: string }>(
      `
        SELECT DISTINCT u.discord_user_id
        FROM game_night_votes gnv
        INNER JOIN users u ON u.id = gnv.user_id
        WHERE gnv.game_night_id = $1
      `,
      [id]
    );
    memberIds = voters.rows.map((row) => row.discord_user_id);
  }

  if (memberIds.length === 0) {
    res.status(400).json({ error: "No member IDs provided and no attendees/voters found for this game night" });
    return;
  }

  const recommendations = await whatCanWePlay({
    memberIds,
    sessionLength: body.sessionLength,
    maxGroupSize: memberIds.length
  });

  // Attach an AI blurb to the top pick
  let topBlurb: string | null = null;
  if (recommendations[0]) {
    topBlurb = await generateRecommendationBlurb(recommendations[0], memberIds.length).catch(() => null);
  }

  const enriched = recommendations.map((r, i) => ({
    ...r,
    blurb: i === 0 ? (topBlurb ?? r.reason) : r.reason
  }));

  res.json({
    source: body.memberIds?.length ? "request-member-ids" : "night-attendees-or-voters",
    memberIds,
    recommendations: enriched
  });
});
