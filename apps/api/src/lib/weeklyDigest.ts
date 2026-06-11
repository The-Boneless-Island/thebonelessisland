import { db } from "../db/client.js";

export type DigestPayload = {
  weekStart: string;
  generatedAt: string;
  attendance: {
    totalRsvps: number;
    nights: Array<{ title: string; scheduledFor: string; attendees: number }>;
  };
  played: Array<{
    appId: number;
    name: string;
    headerImageUrl: string | null;
    crewMinutes2Weeks: number;
  }>;
  queued: Array<{
    appId: number;
    name: string;
    headerImageUrl: string | null;
    wishlisters: number;
  }>;
  highlights: Array<{ kind: string; text: string }>;
};

/** Current ISO week start (Monday, UTC) as a YYYY-MM-DD date string. */
function currentIsoWeekStart(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // getUTCDay: 0=Sun..6=Sat. Shift so Monday is the start of the week.
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

type NightRow = { title: string; scheduled_for: string; attendees: number };
type PlayedRow = {
  app_id: number;
  name: string;
  header_image_url: string | null;
  crew_minutes_2weeks: number;
};
type QueuedRow = {
  app_id: number;
  name: string;
  header_image_url: string | null;
  wishlisters: number;
};
type HighlightRow = {
  event_type: string;
  actor_display_name: string | null;
  actor_username: string | null;
  target_display_name: string | null;
  target_username: string | null;
  app_name: string | null;
  payload: Record<string, unknown> | null;
};

function highlightText(row: HighlightRow): string {
  const actor = row.actor_display_name ?? row.actor_username ?? "A crew member";
  const target = row.target_display_name ?? row.target_username ?? "a crewmate";
  const game = row.app_name ?? "a game";
  const type = row.event_type;

  if (type === "game_night.created") {
    const title = typeof row.payload?.title === "string" ? row.payload.title : "a game night";
    return `${actor} charted a new game night: ${title}.`;
  }
  if (type === "game_night.rsvp_joined") return `${actor} hopped aboard a game night.`;
  if (type === "game_night.game_picked") return `${game} got picked for game night.`;
  if (type.startsWith("achievement.")) return `${actor} unlocked an achievement in ${game}.`;
  if (type.startsWith("milestone.")) return `${actor} hit a milestone.`;
  if (type.startsWith("steam.")) return `${actor} synced fresh tides from ${game}.`;
  if (type.startsWith("news.")) return `Fresh news washed ashore for ${game}.`;
  if (target && type.includes("friend")) return `${actor} drifted closer to ${target}.`;
  return `${actor} stirred the lagoon.`;
}

/**
 * Compute this week's Tide digest, persist it (UPSERT on week_start), and
 * return the full DigestPayload per CONTRACT T.
 */
export async function buildAndStoreWeeklyDigest(): Promise<DigestPayload> {
  const weekStart = currentIsoWeekStart();
  const generatedAt = new Date().toISOString();

  // Attendance: nights scheduled in the last 7 days, with RSVP counts.
  const nightsResult = await db.query<NightRow>(
    `
      SELECT
        gn.title,
        gn.scheduled_for,
        COUNT(gna.user_id)::int AS attendees
      FROM game_nights gn
      LEFT JOIN game_night_attendees gna ON gna.game_night_id = gn.id
      WHERE gn.scheduled_for >= NOW() - INTERVAL '7 days'
        AND gn.scheduled_for < NOW()
      GROUP BY gn.id, gn.title, gn.scheduled_for
      ORDER BY gn.scheduled_for DESC
    `
  );
  const nights = nightsResult.rows.map((row) => ({
    title: row.title,
    scheduledFor: row.scheduled_for,
    attendees: row.attendees
  }));
  const totalRsvps = nights.reduce((sum, night) => sum + night.attendees, 0);

  // Played: top games by crew playtime over the last fortnight.
  const playedResult = await db.query<PlayedRow>(
    `
      SELECT
        ug.app_id,
        g.name,
        g.header_image_url,
        SUM(ug.playtime_2weeks)::int AS crew_minutes_2weeks
      FROM user_games ug
      INNER JOIN games g ON g.app_id = ug.app_id
      WHERE ug.playtime_2weeks > 0
      GROUP BY ug.app_id, g.name, g.header_image_url
      ORDER BY crew_minutes_2weeks DESC
      LIMIT 5
    `
  );
  const played = playedResult.rows.map((row) => ({
    appId: row.app_id,
    name: row.name,
    headerImageUrl: row.header_image_url,
    crewMinutes2Weeks: row.crew_minutes_2weeks
  }));

  // Queued: most-wishlisted apps across the crew.
  const queuedResult = await db.query<QueuedRow>(
    `
      SELECT
        uw.app_id,
        g.name,
        g.header_image_url,
        COUNT(DISTINCT uw.user_id)::int AS wishlisters
      FROM user_wishlists uw
      INNER JOIN games g ON g.app_id = uw.app_id
      GROUP BY uw.app_id, g.name, g.header_image_url
      ORDER BY wishlisters DESC, uw.app_id ASC
      LIMIT 5
    `
  );
  const queued = queuedResult.rows.map((row) => ({
    appId: row.app_id,
    name: row.name,
    headerImageUrl: row.header_image_url,
    wishlisters: row.wishlisters
  }));

  // Highlights: a few notable activity events from the last week.
  const highlightsResult = await db.query<HighlightRow>(
    `
      SELECT
        ae.event_type,
        actor_gm.display_name AS actor_display_name,
        actor_dp.username AS actor_username,
        target_gm.display_name AS target_display_name,
        target_dp.username AS target_username,
        g.name AS app_name,
        ae.payload
      FROM activity_events ae
      LEFT JOIN users actor_user ON actor_user.id = ae.actor_user_id
      LEFT JOIN discord_profiles actor_dp ON actor_dp.user_id = actor_user.id
      LEFT JOIN guild_members actor_gm ON actor_gm.discord_user_id = actor_user.discord_user_id
      LEFT JOIN users target_user ON target_user.id = ae.target_user_id
      LEFT JOIN discord_profiles target_dp ON target_dp.user_id = target_user.id
      LEFT JOIN guild_members target_gm ON target_gm.discord_user_id = target_user.discord_user_id
      LEFT JOIN games g ON g.app_id = ae.target_app_id
      WHERE ae.created_at >= NOW() - INTERVAL '7 days'
      ORDER BY ae.created_at DESC
      LIMIT 6
    `
  );
  const highlights = highlightsResult.rows.map((row) => ({
    kind: row.event_type,
    text: highlightText(row)
  }));

  const payload: DigestPayload = {
    weekStart,
    generatedAt,
    attendance: { totalRsvps, nights },
    played,
    queued,
    highlights
  };

  await db.query(
    `
      INSERT INTO weekly_digests (week_start, generated_at, payload)
      VALUES ($1::date, $2::timestamptz, $3::jsonb)
      ON CONFLICT (week_start)
      DO UPDATE SET
        payload = EXCLUDED.payload,
        generated_at = EXCLUDED.generated_at
    `,
    [weekStart, generatedAt, JSON.stringify(payload)]
  );

  return payload;
}

/** Return the most recent stored digest payload, or null when none exist. */
export async function getLatestDigest(): Promise<DigestPayload | null> {
  const result = await db.query<{ payload: DigestPayload }>(
    `
      SELECT payload
      FROM weekly_digests
      ORDER BY week_start DESC
      LIMIT 1
    `
  );
  return result.rows[0]?.payload ?? null;
}
