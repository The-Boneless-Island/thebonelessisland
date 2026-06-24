import express from "express";
import { type AuditScope } from "@island/shared";
import { db } from "../db/client.js";
import { requireBotOrSession, requireParentRole } from "../lib/auth.js";
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
  if (eventType === "game_night.game_picked" || eventType.startsWith("achievement.")) {
    return "achievements";
  }
  if (eventType.startsWith("milestone.")) return "milestones";
  if (eventType.startsWith("forum")) return "forums";
  if (eventType.startsWith("casino.") || eventType.startsWith("nuggies.")) return "nuggies";
  if (eventType.startsWith("member.")) return "friends";
  if (eventType.startsWith("game_night.")) return "friends";
  if (eventType.startsWith("steam.")) return "milestones";
  if (eventType.startsWith("news.") || eventType.startsWith("admin.")) return "patches";
  return "milestones";
}

function mapActivityRow(row: ActivityRow) {
  return {
    id: row.id,
    eventType: row.event_type,
    category: categorize(row.event_type),
    createdAt: row.created_at,
    actor: row.actor_discord_user_id
      ? {
          discordUserId: row.actor_discord_user_id,
          displayName: row.actor_display_name ?? row.actor_username ?? "Crew member",
          avatarUrl: row.actor_avatar_url,
        }
      : null,
    target: row.target_discord_user_id
      ? {
          discordUserId: row.target_discord_user_id,
          displayName: row.target_display_name ?? row.target_username ?? "Crew member",
          avatarUrl: row.target_avatar_url,
        }
      : null,
    game: row.target_app_id
      ? {
          appId: row.target_app_id,
          name: row.target_app_name ?? `App ${row.target_app_id}`,
          headerImageUrl: row.target_header_image_url,
        }
      : null,
    gameNightId: row.target_game_night_id,
    payload: row.payload ?? {},
  };
}

// Crew-facing feed only — admin ops stay in /activity/admin/audit.
const USER_ACTIVITY_EXCLUDE_SQL = `
  ae.event_type NOT LIKE 'admin.%'
  AND ae.event_type NOT LIKE 'game_night.admin_%'
  AND ae.event_type NOT IN (
    'nuggies.admin_adjustment',
    'nuggies.attendance_awarded',
    'nuggies.shop_item_changed'
  )
`;

const ACTIVITY_SELECT = `
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
`;

function scopeSql(scope: AuditScope): string | null {
  switch (scope) {
    case "admin":
      return `(ae.event_type LIKE 'admin.%'
        OR ae.event_type LIKE 'game_night.admin_%'
        OR ae.event_type LIKE 'news.card_%'
        OR ae.event_type IN ('nuggies.admin_adjustment', 'nuggies.attendance_awarded', 'nuggies.shop_item_changed'))`;
    case "economy":
      return `ae.event_type IN (
        'nuggies.admin_adjustment', 'nuggies.attendance_awarded', 'nuggies.shop_item_changed',
        'nuggies.loan_accepted', 'nuggies.loan_repaid', 'nuggies.daily_claimed', 'casino.big_win'
      )`;
    case "community":
      return `(ae.event_type NOT LIKE 'admin.%'
        AND ae.event_type NOT LIKE 'game_night.admin_%'
        AND ae.event_type NOT LIKE 'news.card_%'
        AND ae.event_type NOT IN ('nuggies.admin_adjustment', 'nuggies.attendance_awarded', 'nuggies.shop_item_changed'))`;
    default:
      return null;
  }
}

function parseCursor(raw: unknown): { createdAt: string; id: string } | null {
  if (typeof raw !== "string" || !raw.includes("|")) return null;
  const [createdAt, id] = raw.split("|");
  if (!createdAt || !id) return null;
  return { createdAt, id };
}

function encodeCursor(createdAt: string, id: string): string {
  return `${createdAt}|${id}`;
}

// ── Parent-only admin audit (Entra-style filters) ─────────────────────────────

activityRouter.get("/admin/audit", requireParentRole, async (req, res) => {
  const scopeRaw = String(req.query.scope ?? "admin");
  const scope: AuditScope =
    scopeRaw === "economy" || scopeRaw === "moderation" || scopeRaw === "community" || scopeRaw === "all"
      ? scopeRaw
      : "admin";

  const limitParam = Number(req.query.limit);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 100) : 50;

  const eventType = typeof req.query.eventType === "string" && req.query.eventType ? req.query.eventType : null;
  const actorDiscordUserId =
    typeof req.query.actorDiscordUserId === "string" && req.query.actorDiscordUserId
      ? req.query.actorDiscordUserId
      : null;
  const since = typeof req.query.since === "string" && req.query.since ? req.query.since : null;
  const until = typeof req.query.until === "string" && req.query.until ? req.query.until : null;
  const q = typeof req.query.q === "string" && req.query.q.trim() ? `%${req.query.q.trim()}%` : null;
  const cursor = parseCursor(req.query.cursor);

  const entries: Array<
    | { kind: "activity"; createdAt: string; cursorId: string; event: ReturnType<typeof mapActivityRow> }
    | {
        kind: "mod";
        createdAt: string;
        cursorId: string;
        mod: {
          id: number;
          action: string;
          notes: string | null;
          createdAt: string;
          moderatorDisplayName: string;
          targetThreadTitle: string | null;
          targetThreadId: number | null;
          targetPostId: number | null;
          targetUserDisplayName: string | null;
        };
      }
  > = [];

  if (scope !== "moderation") {
    const conditions: string[] = ["TRUE"];
    const params: unknown[] = [];
    let n = 0;

    const scopeFilter = scopeSql(scope);
    if (scopeFilter) conditions.push(scopeFilter);

    if (eventType) {
      n += 1;
      conditions.push(`ae.event_type = $${n}`);
      params.push(eventType);
    }
    if (actorDiscordUserId) {
      n += 1;
      conditions.push(`actor_user.discord_user_id = $${n}`);
      params.push(actorDiscordUserId);
    }
    if (since) {
      n += 1;
      conditions.push(`ae.created_at >= $${n}::timestamptz`);
      params.push(since);
    }
    if (until) {
      n += 1;
      conditions.push(`ae.created_at <= $${n}::timestamptz`);
      params.push(until);
    }
    if (q) {
      n += 1;
      conditions.push(`(ae.event_type ILIKE $${n} OR ae.payload::text ILIKE $${n})`);
      params.push(q);
    }
    if (cursor) {
      n += 1;
      conditions.push(`(ae.created_at, ae.id) < ($${n}::timestamptz, $${n + 1}::bigint)`);
      params.push(cursor.createdAt, cursor.id);
      n += 1;
    }

    n += 1;
    params.push(limit + 1);

    const result = await db.query<ActivityRow>(
      `${ACTIVITY_SELECT}
       WHERE ${conditions.join(" AND ")}
       ORDER BY ae.created_at DESC, ae.id DESC
       LIMIT $${n}`,
      params
    );

    const visible = await filterHiddenSteamEvents(result.rows);
    for (const row of visible) {
      entries.push({
        kind: "activity",
        createdAt: row.created_at,
        cursorId: row.id,
        event: mapActivityRow(row),
      });
    }
  }

  if (scope === "moderation" || scope === "all") {
    const modConditions: string[] = ["TRUE"];
    const modParams: unknown[] = [];
    let m = 0;

    if (since) {
      m += 1;
      modConditions.push(`l.created_at >= $${m}::timestamptz`);
      modParams.push(since);
    }
    if (until) {
      m += 1;
      modConditions.push(`l.created_at <= $${m}::timestamptz`);
      modParams.push(until);
    }
    if (q) {
      m += 1;
      modConditions.push(
        `(l.action ILIKE $${m} OR l.notes ILIKE $${m} OR t.title ILIKE $${m} OR COALESCE(tudp.global_name, tudp.username) ILIKE $${m})`
      );
      modParams.push(q);
    }
    if (cursor && scope === "moderation") {
      m += 1;
      modConditions.push(`(l.created_at, l.id) < ($${m}::timestamptz, $${m + 1}::bigint)`);
      modParams.push(cursor.createdAt, cursor.id);
      m += 1;
    }

    m += 1;
    modParams.push(limit + 1);

    const modResult = await db.query<{
      id: string;
      action: string;
      notes: string | null;
      created_at: string;
      mod_display: string;
      target_thread_title: string | null;
      target_thread_id: string | null;
      target_post_id: string | null;
      target_user_display: string | null;
    }>(
      `SELECT l.id, l.action, l.notes, l.created_at,
              COALESCE(mdp.global_name, mdp.username) AS mod_display,
              t.title AS target_thread_title, t.id::text AS target_thread_id,
              l.target_post_id::text AS target_post_id,
              COALESCE(tudp.global_name, tudp.username) AS target_user_display
       FROM forum_mod_log l
       INNER JOIN discord_profiles mdp ON mdp.user_id = l.moderator_user_id
       LEFT JOIN forum_threads t ON t.id = l.target_thread_id
       LEFT JOIN discord_profiles tudp ON tudp.user_id = l.target_user_id
       WHERE ${modConditions.join(" AND ")}
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT $${m}`,
      modParams
    );

    for (const row of modResult.rows) {
      entries.push({
        kind: "mod",
        createdAt: row.created_at,
        cursorId: row.id,
        mod: {
          id: parseInt(row.id, 10),
          action: row.action,
          notes: row.notes,
          createdAt: row.created_at,
          moderatorDisplayName: row.mod_display,
          targetThreadTitle: row.target_thread_title,
          targetThreadId: row.target_thread_id ? parseInt(row.target_thread_id, 10) : null,
          targetPostId: row.target_post_id ? parseInt(row.target_post_id, 10) : null,
          targetUserDisplayName: row.target_user_display,
        },
      });
    }
  }

  entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || Number(b.cursorId) - Number(a.cursorId));
  const page = entries.slice(0, limit);
  const hasMore = entries.length > limit;
  const last = page[page.length - 1];

  res.json({
    entries: page.map(({ cursorId: _c, ...rest }) => rest),
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.cursorId) : null,
  });
});

// ── Crew activity feed (unchanged) ────────────────────────────────────────────

activityRouter.get("/", async (req, res) => {
  const limitParam = Number(req.query.limit);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 100) : 50;

  const result = await db.query<ActivityRow>(
    `${ACTIVITY_SELECT}
     WHERE ${USER_ACTIVITY_EXCLUDE_SQL}
     ORDER BY ae.created_at DESC
     LIMIT $1::int`,
    [limit]
  );

  const visibleRows = await filterHiddenSteamEvents(result.rows);

  res.json({
    events: visibleRows.map((row) => mapActivityRow(row)),
  });
});
