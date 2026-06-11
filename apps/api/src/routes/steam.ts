import express from "express";
import { z } from "zod";
import { env } from "../config.js";
import { db } from "../db/client.js";
import { recordEvent } from "../lib/activityEvents.js";
import { requireParentRole, requireSession } from "../lib/auth.js";
import { enrichGameMetadataFromSteam, enrichMissingGameImages } from "../lib/gameCatalogEnrichment.js";
import { syncAchievementSchema } from "../lib/steamAchievementSchema.js";
import { ingestNewsForApps } from "../lib/gameNewsIngestion.js";
import { ensureSettingsLoaded, getAISetting, getGuildId } from "../lib/serverSettings.js";
import { applyTransaction } from "../lib/nuggiesLedger.js";

const linkSchema = z.object({
  steamId64: z.string().min(10)
});

export const steamRouter = express.Router();

const STEAM_OPENID_PATHS = new Set(["/openid/start", "/openid/return"]);

steamRouter.use((req, res, next) => {
  if (STEAM_OPENID_PATHS.has(req.path)) {
    next();
    return;
  }
  requireSession(req, res, next);
});

type SteamWishlistItem = {
  appid: number;
  priority: number;
  dateAdded: number | null;
};

type SyncWishlistResult =
  | { ok: true; syncedItems: number }
  | { ok: false; status: number | null; reason: string; retryAfterSeconds?: number };

async function fetchSteamWishlistItems(steamId64: string): Promise<{
  ok: boolean;
  status: number | null;
  items: SteamWishlistItem[];
  reason?: string;
  retryAfterSeconds?: number;
}> {
  if (!env.STEAM_WEB_API_KEY) {
    return { ok: false, status: null, items: [], reason: "Missing STEAM_WEB_API_KEY in environment" };
  }

  const url = `https://api.steampowered.com/IWishlistService/GetWishlist/v1/?key=${env.STEAM_WEB_API_KEY}&steamid=${steamId64}`;
  const response = await fetch(url).catch(() => null);
  if (!response) {
    return { ok: false, status: null, items: [], reason: "Steam wishlist request failed" };
  }
  if (response.status === 429) {
    const retryAfterSeconds = parseInt(response.headers.get("Retry-After") ?? "60", 10);
    return { ok: false, status: 429, items: [], reason: "Steam wishlist rate limited", retryAfterSeconds };
  }
  if (!response.ok) {
    return { ok: false, status: response.status, items: [], reason: `Steam wishlist request returned ${response.status}` };
  }

  const data = (await response.json().catch(() => null)) as
    | { response?: { items?: Array<{ appid?: number; priority?: number; date_added?: number }> } }
    | null;

  const rawItems = data?.response?.items ?? [];
  const items: SteamWishlistItem[] = rawItems
    .map((item) => ({
      appid: typeof item.appid === "number" ? item.appid : 0,
      priority: typeof item.priority === "number" ? item.priority : 0,
      dateAdded: typeof item.date_added === "number" ? item.date_added : null
    }))
    .filter((item) => item.appid > 0);

  return { ok: true, status: 200, items };
}

async function syncWishlistForUser(userId: string, steamId64: string): Promise<SyncWishlistResult> {
  const fetched = await fetchSteamWishlistItems(steamId64);
  if (!fetched.ok) {
    return { ok: false, status: fetched.status, reason: fetched.reason ?? "Wishlist sync failed", retryAfterSeconds: fetched.retryAfterSeconds };
  }

  const items = fetched.items;
  const appIds = items.map((item) => item.appid);

  if (appIds.length > 0) {
    await db.query(
      `
        INSERT INTO games (app_id, name)
        SELECT t.appid, 'app-' || t.appid::text
        FROM UNNEST($1::int[]) AS t(appid)
        ON CONFLICT (app_id) DO NOTHING
      `,
      [appIds]
    );

    // Bulk upsert: build parallel value arrays and pass as typed arrays
    const wishlistUserIds = items.map(() => userId);
    const wishlistAppIds = items.map((i) => i.appid);
    const wishlistPriorities = items.map((i) => i.priority);
    const wishlistAddedAts = items.map((i) =>
      i.dateAdded ? new Date(i.dateAdded * 1000).toISOString() : null
    );

    await db.query(
      `
        INSERT INTO user_wishlists (user_id, app_id, priority, added_at, synced_at)
        SELECT
          u::bigint,
          a::int,
          p::int,
          d::timestamptz,
          NOW()
        FROM
          UNNEST($1::text[], $2::int[], $3::int[], $4::text[]) AS t(u, a, p, d)
        ON CONFLICT (user_id, app_id)
        DO UPDATE SET
          priority   = EXCLUDED.priority,
          added_at   = EXCLUDED.added_at,
          synced_at  = NOW()
      `,
      [wishlistUserIds, wishlistAppIds, wishlistPriorities, wishlistAddedAts]
    );

    await db.query(
      `DELETE FROM user_wishlists WHERE user_id = $1 AND app_id <> ALL($2::int[])`,
      [userId, appIds]
    );

    // Enrich all wishlist items that are missing metadata or an image.
    // Steam's appdetails endpoint supports batches; we chunk at 50 to stay
    // well within unofficial limits and avoid overly long query strings.
    const enrichTargets = await db.query<{ app_id: number }>(
      `
        SELECT app_id
        FROM games
        WHERE app_id = ANY($1::int[])
          AND (metadata_updated_at IS NULL OR header_image_url IS NULL)
        ORDER BY app_id ASC
      `,
      [appIds]
    );
    const enrichIds = enrichTargets.rows.map((row) => row.app_id);
    for (let i = 0; i < enrichIds.length; i += 50) {
      const chunk = enrichIds.slice(i, i + 50);
      await enrichGameMetadataFromSteam(chunk);
      await enrichMissingGameImages(chunk);
    }
  } else {
    await db.query(`DELETE FROM user_wishlists WHERE user_id = $1`, [userId]);
  }

  return { ok: true, syncedItems: items.length };
}

steamRouter.post("/link", async (req, res) => {
  const { steamId64 } = linkSchema.parse(req.body);
  const discordUserId = String(res.locals.userId);

  const insertResult = await db.query<{ xmax: string }>(
    `
      INSERT INTO steam_links (user_id, steam_id64)
      SELECT id, $2 FROM users WHERE discord_user_id = $1
      ON CONFLICT (user_id)
      DO UPDATE SET steam_id64 = EXCLUDED.steam_id64, linked_at = NOW()
      RETURNING (xmax = 0) AS is_new_link
    `,
    [discordUserId, steamId64]
  );

  void recordEvent({ eventType: "steam.linked", actorDiscordUserId: discordUserId });

  // First-time Steam link bonus
  const isNewLink = (insertResult.rows[0] as unknown as { is_new_link: boolean })?.is_new_link;
  if (isNewLink) {
    void (async () => {
      try {
        await ensureSettingsLoaded();
        const raw = getAISetting("nuggies_first_link_amount");
        const amount = raw ? parseInt(raw, 10) : 150;
        await applyTransaction({
          discordUserId,
          amount,
          type: "first_link",
          reason: "First Steam account link bonus",
          referenceId: "first_steam_link",
          skipDailyCapCheck: true,
        });
      } catch {
        // Best-effort: opted-out users or errors silently skipped
      }
    })();
  }

  res.json({ ok: true });
});

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const STEAM_CLAIMED_ID_REGEX = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

function apiBaseUrlFromRequest(req: express.Request): string {
  const forwardedProto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim();
  const forwardedHost = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim();
  const protocol = forwardedProto || req.protocol;
  const host = forwardedHost || req.get("host");
  return `${protocol}://${host}`;
}

steamRouter.get("/openid/start", (req, res) => {
  if (!req.session?.userId) {
    res.redirect(buildWebRedirect("error", "not_authenticated"));
    return;
  }
  const apiBase = apiBaseUrlFromRequest(req);
  const returnTo = `${apiBase}/steam/openid/return`;
  const realm = apiBase;
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": realm,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select"
  });
  res.redirect(`${STEAM_OPENID_ENDPOINT}?${params.toString()}`);
});

async function verifySteamOpenIdAssertion(query: Record<string, unknown>): Promise<{ steamId64: string } | { error: string }> {
  const verifyParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") {
      verifyParams.append(key, value);
    } else if (Array.isArray(value)) {
      verifyParams.append(key, String(value[0] ?? ""));
    }
  }
  verifyParams.set("openid.mode", "check_authentication");

  const response = await fetch(STEAM_OPENID_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: verifyParams.toString()
  }).catch(() => null);

  if (!response?.ok) {
    return { error: "Steam openid verification request failed" };
  }

  const body = await response.text();
  if (!/is_valid\s*:\s*true/i.test(body)) {
    return { error: "Steam openid assertion was not valid" };
  }

  const claimedId =
    typeof query["openid.claimed_id"] === "string"
      ? (query["openid.claimed_id"] as string)
      : typeof query["openid.identity"] === "string"
        ? (query["openid.identity"] as string)
        : "";

  const match = claimedId.match(STEAM_CLAIMED_ID_REGEX);
  if (!match) {
    return { error: "Steam openid response did not contain a SteamID64" };
  }
  return { steamId64: match[1] };
}

function buildWebRedirect(status: "linked" | "error", reason?: string): string {
  const url = new URL(env.WEB_ORIGIN);
  url.searchParams.set("steam", status);
  if (reason) {
    url.searchParams.set("steamReason", reason);
  }
  return url.toString();
}

steamRouter.get("/openid/return", async (req, res) => {
  if (!req.session?.userId) {
    res.redirect(buildWebRedirect("error", "not_authenticated"));
    return;
  }
  const discordUserId = String(req.session.userId);
  const mode = typeof req.query["openid.mode"] === "string" ? req.query["openid.mode"] : "";

  if (mode !== "id_res") {
    res.redirect(buildWebRedirect("error", mode === "cancel" ? "cancelled" : "invalid_mode"));
    return;
  }

  const verification = await verifySteamOpenIdAssertion(req.query as Record<string, unknown>);
  if ("error" in verification) {
    res.redirect(buildWebRedirect("error", "verification_failed"));
    return;
  }

  await db.query(
    `
      INSERT INTO steam_links (user_id, steam_id64)
      SELECT id, $2 FROM users WHERE discord_user_id = $1
      ON CONFLICT (user_id)
      DO UPDATE SET steam_id64 = EXCLUDED.steam_id64, linked_at = NOW()
    `,
    [discordUserId, verification.steamId64]
  );

  void recordEvent({
    eventType: "steam.linked",
    actorDiscordUserId: discordUserId,
    payload: { via: "openid" }
  });

  res.redirect(buildWebRedirect("linked"));
});

steamRouter.post("/unlink", async (_req, res) => {
  const discordUserId = String(res.locals.userId);
  await db.query(
    `DELETE FROM steam_links WHERE user_id = (SELECT id FROM users WHERE discord_user_id = $1)`,
    [discordUserId]
  );
  void recordEvent({ eventType: "steam.unlinked", actorDiscordUserId: discordUserId });
  res.json({ ok: true });
});

const OWNED_GAMES_COOLDOWN_MS = 30 * 60 * 1000;
const RECENT_GAMES_COOLDOWN_MS = 4 * 60 * 1000;
// In-memory per-user cooldown for recent-games sync. The web fires this every
// 5 min per tab plus on refocus, so a lightweight module-scope gate avoids
// hammering the Steam API without needing a DB column.
const recentGamesLastSyncByUser = new Map<string, number>();
const GROUPS_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const ACHIEVEMENTS_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const ACHIEVEMENT_TOP_N = 15;

type SteamGroup = { gid: string; name?: string };

async function fetchSteamGroups(steamId64: string): Promise<{ ok: boolean; groups: SteamGroup[]; reason?: string }> {
  if (!env.STEAM_WEB_API_KEY) {
    return { ok: false, groups: [], reason: "Missing STEAM_WEB_API_KEY" };
  }
  const url = `https://api.steampowered.com/ISteamUser/GetUserGroupList/v1/?key=${env.STEAM_WEB_API_KEY}&steamid=${steamId64}`;
  const response = await fetch(url).catch(() => null);
  if (!response?.ok) {
    return { ok: false, groups: [], reason: `GetUserGroupList returned ${response?.status ?? "no response"}` };
  }
  const data = (await response.json().catch(() => null)) as {
    response?: { success?: boolean; groups?: Array<{ gid: string }> };
  } | null;
  if (!data?.response?.success) {
    return { ok: false, groups: [], reason: "Steam returned success=false (private profile?)" };
  }
  const groups = (data.response.groups ?? [])
    .map((g) => ({ gid: String(g.gid) }))
    .filter((g) => g.gid.length > 0);
  return { ok: true, groups };
}

type AchievementsResult =
  | { ok: true; unlocked: number; total: number; completionPct: number }
  | { ok: false; hasStatsApi: boolean; reason: string };

async function fetchAchievementsForApp(steamId64: string, appId: number): Promise<AchievementsResult> {
  if (!env.STEAM_WEB_API_KEY) {
    return { ok: false, hasStatsApi: true, reason: "Missing STEAM_WEB_API_KEY" };
  }
  const url =
    `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/` +
    `?key=${env.STEAM_WEB_API_KEY}&steamid=${steamId64}&appid=${appId}`;
  const response = await fetch(url).catch(() => null);
  if (!response) {
    return { ok: false, hasStatsApi: true, reason: "no response" };
  }
  // Steam returns 400 for "no stats" games — treat as permanent skip.
  if (response.status === 400) {
    return { ok: false, hasStatsApi: false, reason: "App has no stats API" };
  }
  if (response.status === 403) {
    return { ok: false, hasStatsApi: true, reason: "Profile private" };
  }
  if (!response.ok) {
    return { ok: false, hasStatsApi: true, reason: `Steam returned ${response.status}` };
  }
  const data = (await response.json().catch(() => null)) as {
    playerstats?: { success?: boolean; error?: string; achievements?: Array<{ achieved: number }> };
  } | null;
  if (!data?.playerstats?.success) {
    const reason = data?.playerstats?.error ?? "Steam returned success=false";
    const hasStatsApi = !/no stats/i.test(reason);
    return { ok: false, hasStatsApi, reason };
  }
  const achievements = data.playerstats.achievements ?? [];
  const total = achievements.length;
  const unlocked = achievements.filter((a) => a.achieved === 1).length;
  const completionPct = total > 0 ? Math.round((unlocked / total) * 10000) / 100 : 0;
  return { ok: true, unlocked, total, completionPct };
}

type ProfileContextSyncResult = {
  groupsSynced: number;
  groupsSkipped: boolean;
  achievementsSynced: number;
  achievementsSkippedNoStats: number;
  achievementsCooldownActive: boolean;
};

async function runProfileContextSync(userId: string, steamId64: string): Promise<ProfileContextSyncResult> {
  const cooldownRow = await db.query<{ groups_synced_at: string | null; achievements_synced_at: string | null }>(
    `SELECT groups_synced_at, achievements_synced_at FROM steam_links WHERE user_id = $1`,
    [userId]
  );
  const now = Date.now();
  const lastGroups = cooldownRow.rows[0]?.groups_synced_at ? new Date(cooldownRow.rows[0].groups_synced_at).getTime() : 0;
  const lastAch = cooldownRow.rows[0]?.achievements_synced_at ? new Date(cooldownRow.rows[0].achievements_synced_at).getTime() : 0;
  const groupsDue = now - lastGroups >= GROUPS_COOLDOWN_MS;
  const achDue = now - lastAch >= ACHIEVEMENTS_COOLDOWN_MS;

  const result: ProfileContextSyncResult = {
    groupsSynced: 0,
    groupsSkipped: !groupsDue,
    achievementsSynced: 0,
    achievementsSkippedNoStats: 0,
    achievementsCooldownActive: !achDue
  };

  if (groupsDue) {
    const groupsResult = await fetchSteamGroups(steamId64);
    if (groupsResult.ok) {
      // Replace-style sync: delete rows for this user, re-insert current set.
      await db.query(`DELETE FROM user_steam_groups WHERE user_id = $1`, [userId]);
      for (const g of groupsResult.groups) {
        await db.query(
          `INSERT INTO user_steam_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [userId, g.gid]
        );
      }
      result.groupsSynced = groupsResult.groups.length;
    }
    await db.query(`UPDATE steam_links SET groups_synced_at = NOW() WHERE user_id = $1`, [userId]);
  }

  if (achDue) {
    const topGames = await db.query<{ app_id: number }>(
      `
        SELECT ug.app_id
        FROM user_games ug
        LEFT JOIN user_game_progress p ON p.user_id = ug.user_id AND p.app_id = ug.app_id
        WHERE ug.user_id = $1
          AND ug.playtime_minutes > 0
          AND COALESCE(p.has_stats_api, TRUE) = TRUE
        ORDER BY ug.playtime_minutes DESC
        LIMIT $2
      `,
      [userId, ACHIEVEMENT_TOP_N]
    );

    // Pre-fetch prior unlocked counts + game names for the candidate apps in a
    // single query so we can diff per-app and emit progress activity events
    // without an extra round-trip inside the throttled loop. A null prior value
    // (no existing progress row) is treated as a baseline — we skip emitting on
    // the first sync to avoid flooding the feed.
    const candidateAppIds = topGames.rows.map((row) => row.app_id);
    const priorUnlockedByApp = new Map<number, number>();
    const gameNameByApp = new Map<number, string>();
    let actorDiscordUserId: string | null = null;
    if (candidateAppIds.length > 0) {
      const priorRows = await db.query<{ app_id: number; achievements_unlocked: number | null; name: string }>(
        `
          SELECT g.app_id,
                 p.achievements_unlocked,
                 g.name
          FROM games g
          LEFT JOIN user_game_progress p
            ON p.app_id = g.app_id AND p.user_id = $1
          WHERE g.app_id = ANY($2::int[])
        `,
        [userId, candidateAppIds]
      );
      for (const prior of priorRows.rows) {
        if (prior.achievements_unlocked != null) {
          priorUnlockedByApp.set(prior.app_id, prior.achievements_unlocked);
        }
        gameNameByApp.set(prior.app_id, prior.name);
      }
      const actorRow = await db.query<{ discord_user_id: string }>(
        `SELECT discord_user_id FROM users WHERE id = $1`,
        [userId]
      );
      actorDiscordUserId = actorRow.rows[0]?.discord_user_id ?? null;
    }

    for (const row of topGames.rows) {
      const r = await fetchAchievementsForApp(steamId64, row.app_id);
      if (r.ok) {
        await db.query(
          `
            INSERT INTO user_game_progress (user_id, app_id, achievements_unlocked, achievements_total, completion_pct, has_stats_api, last_synced_at)
            VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
            ON CONFLICT (user_id, app_id) DO UPDATE SET
              achievements_unlocked = EXCLUDED.achievements_unlocked,
              achievements_total = EXCLUDED.achievements_total,
              completion_pct = EXCLUDED.completion_pct,
              has_stats_api = TRUE,
              last_synced_at = NOW()
          `,
          [userId, row.app_id, r.unlocked, r.total, r.completionPct]
        );
        result.achievementsSynced++;

        // Diff against the prior unlocked count. Only emit when a baseline
        // existed (prior was non-null) and the count actually increased — this
        // skips the first-ever sync and any no-change re-syncs.
        const priorUnlocked = priorUnlockedByApp.get(row.app_id);
        if (priorUnlocked != null && actorDiscordUserId) {
          const delta = r.unlocked - priorUnlocked;
          if (delta > 0) {
            void recordEvent({
              eventType: "achievement.steam_progress",
              actorDiscordUserId,
              targetAppId: row.app_id,
              payload: {
                appId: row.app_id,
                gameName: gameNameByApp.get(row.app_id) ?? `app-${row.app_id}`,
                unlockedDelta: delta,
                newUnlocked: r.unlocked,
                total: r.total
              }
            });
          }
        }
      } else if (!r.hasStatsApi) {
        await db.query(
          `
            INSERT INTO user_game_progress (user_id, app_id, has_stats_api, last_synced_at)
            VALUES ($1, $2, FALSE, NOW())
            ON CONFLICT (user_id, app_id) DO UPDATE SET
              has_stats_api = FALSE,
              last_synced_at = NOW()
          `,
          [userId, row.app_id]
        );
        result.achievementsSkippedNoStats++;
      }
      // Throttle: Steam tolerates ~1 req/sec sustained.
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await db.query(`UPDATE steam_links SET achievements_synced_at = NOW() WHERE user_id = $1`, [userId]);
  }

  return result;
}

steamRouter.get("/profile-context-stats", requireParentRole, async (_req, res) => {
  const result = await db.query<{
    total_linked: number;
    groups_synced_users: number;
    achievements_synced_users: number;
    total_groups: number;
    total_progress_rows: number;
    last_groups_synced_at: string | null;
    last_achievements_synced_at: string | null;
  }>(
    `
      SELECT
        (SELECT COUNT(*) FROM steam_links)::int AS total_linked,
        (SELECT COUNT(*) FROM steam_links WHERE groups_synced_at IS NOT NULL)::int AS groups_synced_users,
        (SELECT COUNT(*) FROM steam_links WHERE achievements_synced_at IS NOT NULL)::int AS achievements_synced_users,
        (SELECT COUNT(*) FROM user_steam_groups)::int AS total_groups,
        (SELECT COUNT(*) FROM user_game_progress WHERE has_stats_api = TRUE)::int AS total_progress_rows,
        (SELECT MAX(groups_synced_at) FROM steam_links) AS last_groups_synced_at,
        (SELECT MAX(achievements_synced_at) FROM steam_links) AS last_achievements_synced_at
    `
  );
  res.json(result.rows[0]);
});

steamRouter.post("/sync-profile-context", async (_req, res) => {
  const discordUserId = String(res.locals.userId);
  const link = await db.query<{ user_id: string; steam_id64: string }>(
    `
      SELECT sl.user_id, sl.steam_id64
      FROM steam_links sl
      INNER JOIN users u ON u.id = sl.user_id
      WHERE u.discord_user_id = $1
    `,
    [discordUserId]
  );
  if (!link.rows[0]) {
    res.status(400).json({ error: "No Steam account linked" });
    return;
  }
  try {
    const result = await runProfileContextSync(link.rows[0].user_id, link.rows[0].steam_id64);
    res.json(result);
  } catch (error) {
    console.error("Profile context sync failed", error);
    res.status(502).json({ error: "Unable to sync Steam profile context right now" });
  }
});


type SyncOwnedGamesResult =
  | { ok: true; syncedGames: number; privateLibrary: boolean; wishlist?: SyncWishlistResult }
  | { ok: false; rateLimited?: boolean; retryAfterSeconds?: number; reason: string };

/**
 * Sync a single user's owned Steam games into games/user_games, refresh the
 * steam_links.last_synced_at marker, and fan out the usual side effects (top-8
 * news ingest, profile-context backfill, wishlist sync). Reusable from both the
 * POST /sync-owned-games route and the syncAllOwnedGames cron pass.
 *
 * By default the wishlist sync is fire-and-forget; pass opts.awaitWishlist to
 * await it and surface its result (the interactive route needs this so the web
 * client can show wishlist status).
 */
export async function syncOwnedGamesForUser(
  userIdInternal: string,
  steamId64: string,
  opts?: { awaitWishlist?: boolean }
): Promise<SyncOwnedGamesResult> {
  if (!env.STEAM_WEB_API_KEY) {
    return { ok: false, reason: "Missing STEAM_WEB_API_KEY in environment" };
  }

  const apiUrl =
    "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/" +
    `?key=${env.STEAM_WEB_API_KEY}&steamid=${steamId64}&include_appinfo=1&include_played_free_games=1`;
  const steamResponse = await fetch(apiUrl);

  if (steamResponse.status === 429) {
    const retryAfterSeconds = parseInt(steamResponse.headers.get("Retry-After") ?? "60", 10);
    return { ok: false, rateLimited: true, retryAfterSeconds, reason: "Steam API rate limited" };
  }

  if (!steamResponse.ok) {
    return { ok: false, reason: "Steam API request failed" };
  }

  const steamJson = (await steamResponse.json()) as {
    response?: {
      game_count?: number;
      games?: Array<{ appid: number; name: string; playtime_forever?: number; playtime_2weeks?: number }>;
    };
  };

  if (!steamJson.response) {
    return { ok: false, reason: "Steam API response format was invalid" };
  }

  const games = steamJson.response.games ?? [];
  // When "Game details" privacy is not Public, Steam omits game_count and games
  // entirely (response is {}). Detect that so callers can explain the empty
  // library instead of silently succeeding with 0 games.
  const privateLibrary = steamJson.response.game_count === undefined && games.length === 0;

  for (const game of games) {
    await db.query(
      `
        INSERT INTO games (app_id, name)
        VALUES ($1, $2)
        ON CONFLICT (app_id) DO UPDATE SET name = EXCLUDED.name
      `,
      [game.appid, game.name]
    );
    await db.query(
      `
        INSERT INTO user_games (user_id, app_id, playtime_minutes, playtime_2weeks)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, app_id)
        DO UPDATE SET
          playtime_minutes = EXCLUDED.playtime_minutes,
          playtime_2weeks  = EXCLUDED.playtime_2weeks,
          last_played_at   = CASE WHEN EXCLUDED.playtime_2weeks > 0 THEN NOW() ELSE user_games.last_played_at END
      `,
      [userIdInternal, game.appid, game.playtime_forever ?? 0, game.playtime_2weeks ?? 0]
    );
  }

  await db.query(`UPDATE steam_links SET last_synced_at = NOW() WHERE user_id = $1`, [userIdInternal]);

  const topAppIds = games
    .sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0))
    .slice(0, 8)
    .map((g) => g.appid);
  if (topAppIds.length > 0) {
    void ingestNewsForApps(topAppIds, { maxApps: 8 }).catch(() => {});
  }

  // Fire-and-forget profile-context backfill (groups + achievements). Runs its
  // own 24h cooldown internally, so safe to invoke on every owned-games sync.
  void runProfileContextSync(userIdInternal, steamId64).catch((error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Profile-context sync threw during owned-games sync:", msg);
  });

  let wishlist: SyncWishlistResult | undefined;
  if (opts?.awaitWishlist) {
    wishlist = await syncWishlistForUser(userIdInternal, steamId64).catch((error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Wishlist sync threw during owned-games sync:", msg, error);
      return { ok: false, status: null, reason: msg } as SyncWishlistResult;
    });
  } else {
    void syncWishlistForUser(userIdInternal, steamId64).catch((error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Wishlist sync threw during owned-games sync:", msg, error);
    });
  }

  return { ok: true, syncedGames: games.length, privateLibrary, wishlist };
}

/**
 * Server-side automatic pass: sync owned games for every linked user whose
 * library has never been synced or is past the cooldown window. Runs gently
 * (~1s between users, per-user try/catch) so a single failure or rate-limit
 * doesn't abort the batch. Wishlist sync is fire-and-forget here.
 */
export async function syncAllOwnedGames(): Promise<{ usersSynced: number }> {
  const cooldownSeconds = Math.ceil(OWNED_GAMES_COOLDOWN_MS / 1000);
  const due = await db.query<{ user_id: string; steam_id64: string }>(
    `
      SELECT user_id, steam_id64
      FROM steam_links
      WHERE last_synced_at IS NULL
         OR last_synced_at < NOW() - ($1 || ' seconds')::interval
    `,
    [cooldownSeconds]
  );

  let usersSynced = 0;
  for (const row of due.rows) {
    try {
      const result = await syncOwnedGamesForUser(row.user_id, row.steam_id64);
      if (result.ok) {
        usersSynced += 1;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Automatic owned-games sync failed for user ${row.user_id}:`, msg);
    }
    // Gentle pacing between users to stay under Steam's rate limits.
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return { usersSynced };
}

steamRouter.post("/sync-owned-games", async (_req, res) => {
  const discordUserId = String(res.locals.userId);
  const link = await db.query<{ user_id: string; steam_id64: string; last_synced_at: string | null }>(
    `
      SELECT sl.user_id, sl.steam_id64, sl.last_synced_at
      FROM steam_links sl
      INNER JOIN users u ON u.id = sl.user_id
      WHERE u.discord_user_id = $1
    `,
    [discordUserId]
  );
  if (!link.rows[0]) {
    res.status(400).json({ error: "No Steam account linked" });
    return;
  }

  if (!env.STEAM_WEB_API_KEY) {
    res.status(400).json({ error: "Missing STEAM_WEB_API_KEY in environment" });
    return;
  }

  const lastSynced = link.rows[0].last_synced_at ? new Date(link.rows[0].last_synced_at).getTime() : 0;
  const msSinceSync = Date.now() - lastSynced;
  if (msSinceSync < OWNED_GAMES_COOLDOWN_MS) {
    const retryAfterSecs = Math.ceil((OWNED_GAMES_COOLDOWN_MS - msSinceSync) / 1000);
    res.setHeader("Retry-After", String(retryAfterSecs));
    res.status(429).json({ error: "Sync cooldown active", retryAfterSeconds: retryAfterSecs });
    return;
  }

  try {
    const result = await syncOwnedGamesForUser(link.rows[0].user_id, link.rows[0].steam_id64, { awaitWishlist: true });

    if (!result.ok) {
      if (result.rateLimited) {
        const retryAfter = String(result.retryAfterSeconds ?? 60);
        res.setHeader("Retry-After", retryAfter);
        res.status(429).json({ error: "Steam API rate limited", retryAfterSeconds: parseInt(retryAfter, 10) });
        return;
      }
      res.status(502).json({ error: result.reason });
      return;
    }

    res.json({
      syncedGames: result.syncedGames,
      privateLibrary: result.privateLibrary,
      wishlist: result.wishlist?.ok
        ? { ok: true, syncedItems: result.wishlist.syncedItems }
        : { ok: false, status: result.wishlist?.status ?? null, reason: result.wishlist?.reason ?? "Wishlist sync failed" }
    });
  } catch (error) {
    console.error("Steam sync failed", error);
    res.status(502).json({ error: "Unable to sync Steam games right now" });
  }
});

steamRouter.post("/sync-wishlist", async (_req, res) => {
  const discordUserId = String(res.locals.userId);
  const link = await db.query<{ user_id: string; steam_id64: string; last_synced_at: string | null }>(
    `
      SELECT sl.user_id, sl.steam_id64, sl.last_synced_at
      FROM steam_links sl
      INNER JOIN users u ON u.id = sl.user_id
      WHERE u.discord_user_id = $1
    `,
    [discordUserId]
  );
  if (!link.rows[0]) {
    res.status(400).json({ error: "No Steam account linked" });
    return;
  }

  if (!env.STEAM_WEB_API_KEY) {
    res.status(400).json({ error: "Missing STEAM_WEB_API_KEY in environment" });
    return;
  }

  const lastSynced = link.rows[0].last_synced_at ? new Date(link.rows[0].last_synced_at).getTime() : 0;
  const msSinceSync = Date.now() - lastSynced;
  if (msSinceSync < OWNED_GAMES_COOLDOWN_MS) {
    const retryAfterSecs = Math.ceil((OWNED_GAMES_COOLDOWN_MS - msSinceSync) / 1000);
    res.setHeader("Retry-After", String(retryAfterSecs));
    res.status(429).json({ error: "Sync cooldown active", retryAfterSeconds: retryAfterSecs });
    return;
  }

  try {
    const result = await syncWishlistForUser(link.rows[0].user_id, link.rows[0].steam_id64);
    if (!result.ok) {
      if (result.status === 429) {
        const retryAfter = String(result.retryAfterSeconds ?? 60);
        res.setHeader("Retry-After", retryAfter);
        res.status(429).json({ error: "Steam API rate limited", retryAfterSeconds: parseInt(retryAfter, 10) });
        return;
      }
      res.status(502).json({ error: result.reason, status: result.status });
      return;
    }
    res.json({ syncedItems: result.syncedItems });
  } catch (error) {
    console.error("Wishlist sync failed", error);
    res.status(502).json({ error: "Unable to sync Steam wishlist right now" });
  }
});

steamRouter.post("/sync-recent-games", async (_req, res) => {
  const discordUserId = String(res.locals.userId);
  const link = await db.query<{ user_id: string; steam_id64: string }>(
    `
      SELECT sl.user_id, sl.steam_id64
      FROM steam_links sl
      INNER JOIN users u ON u.id = sl.user_id
      WHERE u.discord_user_id = $1
    `,
    [discordUserId]
  );
  if (!link.rows[0]) {
    res.status(400).json({ error: "No Steam account linked" });
    return;
  }
  if (!env.STEAM_WEB_API_KEY) {
    res.status(400).json({ error: "Missing STEAM_WEB_API_KEY in environment" });
    return;
  }

  const lastRecentSync = recentGamesLastSyncByUser.get(discordUserId) ?? 0;
  const msSinceRecentSync = Date.now() - lastRecentSync;
  if (msSinceRecentSync < RECENT_GAMES_COOLDOWN_MS) {
    const retryAfterSecs = Math.ceil((RECENT_GAMES_COOLDOWN_MS - msSinceRecentSync) / 1000);
    res.setHeader("Retry-After", String(retryAfterSecs));
    res.status(429).json({ error: "Sync cooldown active", retryAfterSeconds: retryAfterSecs });
    return;
  }
  recentGamesLastSyncByUser.set(discordUserId, Date.now());

  try {
    const url =
      `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/` +
      `?key=${env.STEAM_WEB_API_KEY}&steamid=${link.rows[0].steam_id64}&count=20`;
    const response = await fetch(url);

    if (!response.ok) {
      res.status(502).json({ error: `Steam API returned ${response.status}` });
      return;
    }

    const json = (await response.json()) as {
      response?: {
        total_count?: number;
        games?: Array<{ appid: number; name: string; playtime_2weeks: number; playtime_forever: number }>;
      };
    };

    const games = json.response?.games ?? [];

    for (const game of games) {
      // Ensure the game row exists
      await db.query(
        `INSERT INTO games (app_id, name) VALUES ($1, $2) ON CONFLICT (app_id) DO UPDATE SET name = EXCLUDED.name`,
        [game.appid, game.name]
      );
      // Upsert into user_games — ensure playtime_2weeks and last_played_at are current
      await db.query(
        `
          INSERT INTO user_games (user_id, app_id, playtime_minutes, playtime_2weeks, last_played_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (user_id, app_id)
          DO UPDATE SET
            playtime_minutes = GREATEST(user_games.playtime_minutes, EXCLUDED.playtime_minutes),
            playtime_2weeks  = EXCLUDED.playtime_2weeks,
            last_played_at   = NOW()
        `,
        [link.rows[0].user_id, game.appid, game.playtime_forever, game.playtime_2weeks]
      );
    }

    // Reset playtime_2weeks to 0 for games not in the recent list (they weren't played this week)
    if (games.length > 0) {
      const recentAppIds = games.map((g) => g.appid);
      await db.query(
        `
          UPDATE user_games
          SET playtime_2weeks = 0
          WHERE user_id = $1
            AND app_id <> ALL($2::int[])
            AND playtime_2weeks > 0
        `,
        [link.rows[0].user_id, recentAppIds]
      );
    } else {
      // Nothing played recently — zero out all 2-week playtime for this user
      await db.query(
        `UPDATE user_games SET playtime_2weeks = 0 WHERE user_id = $1 AND playtime_2weeks > 0`,
        [link.rows[0].user_id]
      );
    }

    res.json({ syncedGames: games.length, recentGames: games.map((g) => ({ appId: g.appid, name: g.name, playtime2Weeks: g.playtime_2weeks })) });
  } catch (error) {
    console.error("Recent games sync failed", error);
    res.status(502).json({ error: "Unable to sync recent games right now" });
  }
});

steamRouter.get("/my-games", async (_req, res) => {
  const discordUserId = String(res.locals.userId);
  const result = await db.query<{ app_id: number; name: string }>(
    `
      SELECT g.app_id, g.name
      FROM users u
      INNER JOIN user_games ug ON ug.user_id = u.id
      INNER JOIN games g ON g.app_id = ug.app_id
      WHERE u.discord_user_id = $1
      ORDER BY g.name ASC
      LIMIT 5000
    `,
    [discordUserId]
  );

  res.json({
    games: result.rows.map((row) => ({
      appId: row.app_id,
      name: row.name
    }))
  });
});

type CrewGameOwnerJson = {
  discordUserId: string;
  displayName: string;
  avatarUrl: string | null;
};

type CrewGameRow = {
  app_id: number;
  name: string;
  is_single_player: boolean;
  is_online_coop: boolean;
  is_lan_coop: boolean;
  is_shared_split_coop: boolean;
  is_online_pvp: boolean;
  is_mmo: boolean;
  mp_max_players_approx: number | null;
  price_final_cents: number | null;
  price_discount_pct: number | null;
  is_free: boolean;
  release_coming_soon: boolean;
  release_date_text: string | null;
  developers: string[];
  tags: string[];
  header_image_url: string | null;
  owner_count: number;
  owners: CrewGameOwnerJson[];
};

steamRouter.get("/crew-games", async (req, res) => {
  if (!getGuildId()) {
    res.status(400).json({ error: "DISCORD_GUILD_ID is not configured" });
    return;
  }

  const minOwnersRaw = Number(req.query.minOwners);
  const minOwners = Number.isInteger(minOwnersRaw) && minOwnersRaw > 0 ? minOwnersRaw : 1;

  const baseQuery = async (): Promise<CrewGameRow[]> => {
    const result = await db.query<CrewGameRow>(
      `
        SELECT
          g.app_id,
          g.name,
          g.is_single_player,
          g.is_online_coop,
          g.is_lan_coop,
          g.is_shared_split_coop,
          g.is_online_pvp,
          g.is_mmo,
          g.mp_max_players_approx,
          g.price_final_cents,
          g.price_discount_pct,
          g.is_free,
          g.release_coming_soon,
          g.release_date_text,
          g.developers,
          g.tags,
          g.header_image_url,
          COUNT(DISTINCT u.id)::int AS owner_count,
          COALESCE(
            JSON_AGG(
              JSONB_BUILD_OBJECT(
                'discordUserId', u.discord_user_id,
                'displayName', COALESCE(gm.display_name, gm.username, dp.username),
                'avatarUrl', COALESCE(gm.avatar_url, dp.avatar_url)
              )
              ORDER BY COALESCE(gm.display_name, gm.username, dp.username) ASC
            ),
            '[]'::json
          ) AS owners
        FROM shareable_user_games ug
        INNER JOIN games g ON g.app_id = ug.app_id
        INNER JOIN users u ON u.id = ug.user_id
        INNER JOIN guild_members gm
          ON gm.discord_user_id = u.discord_user_id
         AND gm.guild_id = $1
         AND gm.in_guild = TRUE
        LEFT JOIN discord_profiles dp ON dp.user_id = u.id
        GROUP BY
          g.app_id,
          g.name,
          g.is_single_player,
          g.is_online_coop,
          g.is_lan_coop,
          g.is_shared_split_coop,
          g.is_online_pvp,
          g.is_mmo,
          g.mp_max_players_approx,
          g.developers,
          g.tags,
          g.header_image_url
        HAVING COUNT(DISTINCT u.id) >= $2::int
        ORDER BY owner_count DESC, g.name ASC
        LIMIT 1000
      `,
      [getGuildId(), minOwners]
    );
    return result.rows;
  };

  const rows = await baseQuery();

  res.json({
    games: rows.map((row) => ({
      appId: row.app_id,
      name: row.name,
      isSinglePlayer: row.is_single_player,
      isOnlineCoop: row.is_online_coop,
      isLanCoop: row.is_lan_coop,
      isSharedSplitCoop: row.is_shared_split_coop,
      isOnlinePvp: row.is_online_pvp,
      isMmo: row.is_mmo,
      mpMaxPlayersApprox: row.mp_max_players_approx,
      maxPlayers: row.mp_max_players_approx,
      medianSessionMinutes: null,
      priceFinalCents: row.price_final_cents,
      priceDiscountPct: row.price_discount_pct,
      isFree: row.is_free,
      releaseComingSoon: row.release_coming_soon,
      releaseDateText: row.release_date_text,
      developers: row.developers,
      tags: row.tags,
      headerImageUrl: row.header_image_url,
      ownerCount: row.owner_count,
      owners: row.owners
    }))
  });

  // Fire-and-forget catalog enrichment for cold rows. Up to 50 cold games means
  // serial external fetches, so we never await it — the next request picks up
  // the enriched data once it lands.
  const missingMetadataIds = rows
    .filter((row) => row.developers.length === 0 && row.tags.length === 0)
    .slice(0, 50)
    .map((row) => row.app_id);
  const missingImageIds = rows
    .filter((row) => !row.header_image_url)
    .slice(0, 50)
    .map((row) => row.app_id);

  void Promise.all([
    enrichGameMetadataFromSteam(missingMetadataIds),
    enrichMissingGameImages(missingImageIds)
  ]).catch((error: unknown) => {
    console.error("crew-games enrichment failed", error);
  });
});

type CrewWishlistRow = {
  app_id: number;
  name: string;
  is_single_player: boolean;
  is_online_coop: boolean;
  is_lan_coop: boolean;
  is_shared_split_coop: boolean;
  is_online_pvp: boolean;
  is_mmo: boolean;
  mp_max_players_approx: number | null;
  price_final_cents: number | null;
  price_discount_pct: number | null;
  is_free: boolean;
  developers: string[];
  tags: string[];
  header_image_url: string | null;
  hype_count: number;
  earliest_added_at: string | null;
  wishlisted_by: CrewGameOwnerJson[];
};

steamRouter.get("/crew-wishlist", async (req, res) => {
  if (!getGuildId()) {
    res.status(400).json({ error: "DISCORD_GUILD_ID is not configured" });
    return;
  }

  const minHypeRaw = Number(req.query.minHype);
  const minHype = Number.isInteger(minHypeRaw) && minHypeRaw > 0 ? minHypeRaw : 1;

  const baseQuery = async (): Promise<CrewWishlistRow[]> => {
    const result = await db.query<CrewWishlistRow>(
      `
        SELECT
          g.app_id,
          g.name,
          g.is_single_player,
          g.is_online_coop,
          g.is_lan_coop,
          g.is_shared_split_coop,
          g.is_online_pvp,
          g.is_mmo,
          g.mp_max_players_approx,
          g.price_final_cents,
          g.price_discount_pct,
          g.is_free,
          g.developers,
          g.tags,
          g.header_image_url,
          COUNT(DISTINCT u.id)::int AS hype_count,
          MIN(uw.added_at) AS earliest_added_at,
          COALESCE(
            JSON_AGG(
              JSONB_BUILD_OBJECT(
                'discordUserId', u.discord_user_id,
                'displayName', COALESCE(gm.display_name, gm.username, dp.username),
                'avatarUrl', COALESCE(gm.avatar_url, dp.avatar_url)
              )
              ORDER BY COALESCE(gm.display_name, gm.username, dp.username) ASC
            ),
            '[]'::json
          ) AS wishlisted_by
        FROM shareable_user_wishlists uw
        INNER JOIN games g ON g.app_id = uw.app_id
        INNER JOIN users u ON u.id = uw.user_id
        INNER JOIN guild_members gm
          ON gm.discord_user_id = u.discord_user_id
         AND gm.guild_id = $1
         AND gm.in_guild = TRUE
        LEFT JOIN discord_profiles dp ON dp.user_id = u.id
        GROUP BY
          g.app_id,
          g.name,
          g.is_single_player,
          g.is_online_coop,
          g.is_lan_coop,
          g.is_shared_split_coop,
          g.is_online_pvp,
          g.is_mmo,
          g.mp_max_players_approx,
          g.price_final_cents,
          g.price_discount_pct,
          g.is_free,
          g.developers,
          g.tags,
          g.header_image_url
        HAVING COUNT(DISTINCT u.id) >= $2::int
        ORDER BY hype_count DESC, earliest_added_at ASC NULLS LAST, g.name ASC
        LIMIT 200
      `,
      [getGuildId(), minHype]
    );
    return result.rows;
  };

  const rows = await baseQuery();

  res.json({
    games: rows.map((row) => ({
      appId: row.app_id,
      name: row.name,
      isSinglePlayer: row.is_single_player,
      isOnlineCoop: row.is_online_coop,
      isLanCoop: row.is_lan_coop,
      isSharedSplitCoop: row.is_shared_split_coop,
      isOnlinePvp: row.is_online_pvp,
      isMmo: row.is_mmo,
      mpMaxPlayersApprox: row.mp_max_players_approx,
      maxPlayers: row.mp_max_players_approx,
      medianSessionMinutes: null,
      priceFinalCents: row.price_final_cents,
      priceDiscountPct: row.price_discount_pct,
      isFree: row.is_free,
      developers: row.developers,
      tags: row.tags,
      headerImageUrl: row.header_image_url,
      hypeCount: row.hype_count,
      earliestAddedAt: row.earliest_added_at,
      wishlistedBy: row.wishlisted_by
    }))
  });

  // Fire-and-forget catalog enrichment for cold rows. Up to 50 cold games means
  // serial external fetches, so we never await it — the next request picks up
  // the enriched data once it lands.
  const missingMetadataIds = rows
    .filter((row) => row.developers.length === 0 && row.tags.length === 0)
    .slice(0, 50)
    .map((row) => row.app_id);
  const missingImageIds = rows
    .filter((row) => !row.header_image_url)
    .slice(0, 50)
    .map((row) => row.app_id);

  void Promise.all([
    enrichGameMetadataFromSteam(missingMetadataIds),
    enrichMissingGameImages(missingImageIds)
  ]).catch((error: unknown) => {
    console.error("crew-wishlist enrichment failed", error);
  });
});

type CrewAchievementMemberJson = {
  discordUserId: string;
  displayName: string;
  avatarUrl: string | null;
  unlocked: number;
  total: number;
  completionPct: number;
};

type CrewAchievementRow = {
  app_id: number;
  name: string;
  header_image_url: string | null;
  member_count: number;
  crew_unlocked: number;
  crew_total: number;
  members: CrewAchievementMemberJson[];
};

steamRouter.get("/crew-achievements", async (_req, res) => {
  if (!getGuildId()) {
    res.status(400).json({ error: "DISCORD_GUILD_ID is not configured" });
    return;
  }

  const result = await db.query<CrewAchievementRow>(
    `
      SELECT
        g.app_id,
        g.name,
        g.header_image_url,
        COUNT(DISTINCT u.id)::int AS member_count,
        COALESCE(SUM(p.achievements_unlocked), 0)::int AS crew_unlocked,
        MAX(p.achievements_total)::int AS crew_total,
        COALESCE(
          JSON_AGG(
            JSONB_BUILD_OBJECT(
              'discordUserId', u.discord_user_id,
              'displayName', COALESCE(gm.display_name, gm.username, dp.username),
              'avatarUrl', COALESCE(gm.avatar_url, dp.avatar_url),
              'unlocked', p.achievements_unlocked,
              'total', p.achievements_total,
              'completionPct', p.completion_pct
            )
            ORDER BY p.completion_pct DESC, COALESCE(gm.display_name, gm.username, dp.username) ASC
          ),
          '[]'::json
        ) AS members
      FROM shareable_user_game_progress p
      INNER JOIN games g ON g.app_id = p.app_id
      INNER JOIN users u ON u.id = p.user_id
      INNER JOIN guild_members gm
        ON gm.discord_user_id = u.discord_user_id
       AND gm.guild_id = $1
       AND gm.in_guild = TRUE
      LEFT JOIN discord_profiles dp ON dp.user_id = u.id
      WHERE p.achievements_total > 0
      GROUP BY g.app_id, g.name, g.header_image_url
      HAVING COUNT(DISTINCT u.id) >= 1
      ORDER BY member_count DESC, crew_unlocked DESC, g.name ASC
      LIMIT 60
    `,
    [getGuildId()]
  );

  res.json({
    games: result.rows.map((row) => ({
      appId: row.app_id,
      name: row.name,
      headerImageUrl: row.header_image_url,
      crewUnlocked: row.crew_unlocked,
      crewTotal: row.crew_total,
      members: row.members
    }))
  });
});

type CrewTrendingRow = {
  app_id: number;
  name: string;
  header_image_url: string | null;
  total_minutes_2weeks: number;
  players: number;
  top_player_name: string | null;
  top_player_minutes: number | null;
};

steamRouter.get("/crew-trending", async (_req, res) => {
  if (!getGuildId()) {
    res.status(400).json({ error: "DISCORD_GUILD_ID is not configured" });
    return;
  }

  const result = await db.query<CrewTrendingRow>(
    `
      SELECT
        g.app_id,
        g.name,
        g.header_image_url,
        COALESCE(SUM(ug.playtime_2weeks), 0)::int AS total_minutes_2weeks,
        COUNT(DISTINCT u.id) FILTER (WHERE ug.playtime_2weeks > 0)::int AS players,
        (
          SELECT COALESCE(gm2.display_name, gm2.username, dp2.username)
          FROM shareable_user_games ug2
          INNER JOIN users u2 ON u2.id = ug2.user_id
          INNER JOIN guild_members gm2
            ON gm2.discord_user_id = u2.discord_user_id
           AND gm2.guild_id = $1
           AND gm2.in_guild = TRUE
          LEFT JOIN discord_profiles dp2 ON dp2.user_id = u2.id
          WHERE ug2.app_id = g.app_id
            AND ug2.playtime_2weeks > 0
          ORDER BY ug2.playtime_2weeks DESC
          LIMIT 1
        ) AS top_player_name,
        (
          SELECT ug2.playtime_2weeks
          FROM shareable_user_games ug2
          INNER JOIN users u2 ON u2.id = ug2.user_id
          INNER JOIN guild_members gm2
            ON gm2.discord_user_id = u2.discord_user_id
           AND gm2.guild_id = $1
           AND gm2.in_guild = TRUE
          WHERE ug2.app_id = g.app_id
            AND ug2.playtime_2weeks > 0
          ORDER BY ug2.playtime_2weeks DESC
          LIMIT 1
        ) AS top_player_minutes
      FROM shareable_user_games ug
      INNER JOIN games g ON g.app_id = ug.app_id
      INNER JOIN users u ON u.id = ug.user_id
      INNER JOIN guild_members gm
        ON gm.discord_user_id = u.discord_user_id
       AND gm.guild_id = $1
       AND gm.in_guild = TRUE
      GROUP BY g.app_id, g.name, g.header_image_url
      HAVING COALESCE(SUM(ug.playtime_2weeks), 0) > 0
      ORDER BY total_minutes_2weeks DESC, g.name ASC
      LIMIT 6
    `,
    [getGuildId()]
  );

  res.json({
    games: result.rows.map((row) => ({
      appId: row.app_id,
      name: row.name,
      headerImageUrl: row.header_image_url,
      totalMinutes2Weeks: row.total_minutes_2weeks,
      players: row.players,
      topPlayer:
        row.top_player_name != null
          ? { displayName: row.top_player_name, minutes: row.top_player_minutes ?? 0 }
          : null
    }))
  });
});

type GameDetailRow = {
  app_id: number;
  name: string;
  header_image_url: string | null;
  is_single_player: boolean;
  is_online_coop: boolean;
  is_lan_coop: boolean;
  is_shared_split_coop: boolean;
  is_online_pvp: boolean;
  is_mmo: boolean;
  mp_max_players_approx: number | null;
  price_initial_cents: number | null;
  price_final_cents: number | null;
  price_discount_pct: number | null;
  is_free: boolean;
  release_coming_soon: boolean;
  release_date_text: string | null;
  short_description: string | null;
  screenshots: Array<{ thumb: string; full: string }> | null;
  metacritic_score: number | null;
  metacritic_url: string | null;
  platform_windows: boolean | null;
  platform_mac: boolean | null;
  platform_linux: boolean | null;
  controller_support: string | null;
  historical_low_cents: number | null;
};

type GameDetailOwnerRow = {
  discord_user_id: string;
  display_name: string;
  avatar_url: string | null;
  playtime_forever: number;
  playtime_2weeks: number;
};

type GameDetailAchievementRow = {
  display_name: string;
  unlocked: number;
  total: number;
  completion_pct: number;
};

type GameDetailNewsRow = {
  title: string;
  url: string;
  published_at: string;
};

steamRouter.get("/game/:appId", async (req, res) => {
  if (!getGuildId()) {
    res.status(400).json({ error: "DISCORD_GUILD_ID is not configured" });
    return;
  }

  const appId = Number(req.params.appId);
  if (!Number.isInteger(appId) || appId <= 0) {
    res.status(400).json({ error: "appId must be a positive integer" });
    return;
  }

  const gameResult = await db.query<GameDetailRow>(
    `
      SELECT
        g.app_id,
        g.name,
        g.header_image_url,
        g.is_single_player,
        g.is_online_coop,
        g.is_lan_coop,
        g.is_shared_split_coop,
        g.is_online_pvp,
        g.is_mmo,
        g.mp_max_players_approx,
        g.price_initial_cents,
        g.price_final_cents,
        g.price_discount_pct,
        g.is_free,
        g.release_coming_soon,
        g.release_date_text,
        g.short_description,
        g.screenshots,
        g.metacritic_score,
        g.metacritic_url,
        g.platform_windows,
        g.platform_mac,
        g.platform_linux,
        g.controller_support,
        g.historical_low_cents
      FROM games g
      WHERE g.app_id = $1
    `,
    [appId]
  );
  const game = gameResult.rows[0];
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const guildId = getGuildId();

  const ownersResult = await db.query<GameDetailOwnerRow>(
    `
      SELECT
        u.discord_user_id,
        COALESCE(gm.display_name, gm.username, dp.username) AS display_name,
        COALESCE(gm.avatar_url, dp.avatar_url) AS avatar_url,
        ug.playtime_minutes AS playtime_forever,
        ug.playtime_2weeks
      FROM shareable_user_games ug
      INNER JOIN users u ON u.id = ug.user_id
      INNER JOIN guild_members gm
        ON gm.discord_user_id = u.discord_user_id
       AND gm.guild_id = $2
       AND gm.in_guild = TRUE
      LEFT JOIN discord_profiles dp ON dp.user_id = u.id
      WHERE ug.app_id = $1
      ORDER BY ug.playtime_minutes DESC, display_name ASC
    `,
    [appId, guildId]
  );

  const achievementsResult = await db.query<GameDetailAchievementRow>(
    `
      SELECT
        COALESCE(gm.display_name, gm.username, dp.username) AS display_name,
        p.achievements_unlocked AS unlocked,
        p.achievements_total AS total,
        p.completion_pct
      FROM shareable_user_game_progress p
      INNER JOIN users u ON u.id = p.user_id
      INNER JOIN guild_members gm
        ON gm.discord_user_id = u.discord_user_id
       AND gm.guild_id = $2
       AND gm.in_guild = TRUE
      LEFT JOIN discord_profiles dp ON dp.user_id = u.id
      WHERE p.app_id = $1
        AND p.achievements_total > 0
      ORDER BY p.completion_pct DESC, display_name ASC
    `,
    [appId, guildId]
  );

  const newsResult = await db.query<GameDetailNewsRow>(
    `
      SELECT title, url, published_at
      FROM game_news
      WHERE app_id = $1
      ORDER BY published_at DESC
      LIMIT 5
    `,
    [appId]
  );

  // Rarest achievements (with icons) from the cached schema. Fire-and-forget a
  // schema sync when we have nothing cached so the next view is populated.
  const achievementCatalogueResult = await db.query<{
    display_name: string | null;
    description: string | null;
    icon_url: string | null;
    global_unlock_pct: number | null;
  }>(
    `
      SELECT display_name, description, icon_url, global_unlock_pct
      FROM game_achievements
      WHERE app_id = $1 AND hidden = FALSE AND icon_url IS NOT NULL
      ORDER BY global_unlock_pct ASC NULLS LAST
      LIMIT 8
    `,
    [appId]
  );
  if (achievementCatalogueResult.rows.length === 0) {
    void syncAchievementSchema(appId).catch((error: unknown) => {
      console.error("achievement schema sync failed", error);
    });
  }

  res.json({
    appId: game.app_id,
    name: game.name,
    headerImageUrl: game.header_image_url,
    store: {
      isSinglePlayer: game.is_single_player,
      isOnlineCoop: game.is_online_coop,
      isLanCoop: game.is_lan_coop,
      isSharedSplitCoop: game.is_shared_split_coop,
      isOnlinePvp: game.is_online_pvp,
      isMmo: game.is_mmo,
      mpMaxPlayersApprox: game.mp_max_players_approx,
      priceInitialCents: game.price_initial_cents,
      priceFinalCents: game.price_final_cents,
      priceDiscountPct: game.price_discount_pct,
      isFree: game.is_free,
      releaseComingSoon: game.release_coming_soon,
      releaseDateText: game.release_date_text,
      shortDescription: game.short_description,
      screenshots: Array.isArray(game.screenshots) ? game.screenshots : [],
      metacriticScore: game.metacritic_score,
      metacriticUrl: game.metacritic_url,
      platformWindows: game.platform_windows,
      platformMac: game.platform_mac,
      platformLinux: game.platform_linux,
      controllerSupport: game.controller_support,
      historicalLowCents: game.historical_low_cents
    },
    achievementCatalogue: achievementCatalogueResult.rows.map((row) => ({
      displayName: row.display_name,
      description: row.description,
      iconUrl: row.icon_url,
      globalUnlockPct: row.global_unlock_pct
    })),
    owners: ownersResult.rows.map((row) => ({
      discordUserId: row.discord_user_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      playtimeForever: row.playtime_forever,
      playtime2Weeks: row.playtime_2weeks
    })),
    achievements: achievementsResult.rows.map((row) => ({
      displayName: row.display_name,
      unlocked: row.unlocked,
      total: row.total,
      completionPct: row.completion_pct
    })),
    news: newsResult.rows.map((row) => ({
      title: row.title,
      url: row.url,
      publishedAt: row.published_at
    }))
  });
});
