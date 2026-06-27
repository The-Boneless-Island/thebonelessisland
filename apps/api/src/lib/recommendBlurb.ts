import { RecommendedGame, SITE_BRAND_NAME } from "@island/shared";
import { db } from "../db/client.js";
import { AIDisabledError, AINotConfiguredError, getAIProviderForTask } from "./ai/index.js";

type GameMeta = {
  tags: string[];
  // Real capability signal (migration 045). max_players / median_session_minutes
  // were always fabricated, so the blurb context now uses honest fields instead.
  is_single_player: boolean;
  is_online_coop: boolean;
  is_lan_coop: boolean;
  is_shared_split_coop: boolean;
  is_online_pvp: boolean;
  is_mmo: boolean;
  mp_max_players_approx: number | null;
};

type RecentPlayer = {
  display_name: string;
  playtime_2weeks: number;
};

// In-memory blurb cache keyed by "appId:ownerCount".
// Crew composition changes slowly; 30 min TTL avoids repeated AI calls for
// the same recommendation across multiple users loading the page.
const BLURB_TTL_MS = 30 * 60 * 1000;
const blurbCache = new Map<string, { blurb: string; expiresAt: number }>();

function blurbCacheKey(appId: number, ownerCount: number): string {
  return `${appId}:${ownerCount}`;
}

/**
 * Generates a natural-language blurb for the top recommendation using the active AI provider.
 * Results are cached in memory for 30 minutes per (game, owner count) pair.
 * Returns null if AI is disabled or not configured — caller falls back to the rule-based reason.
 */
export async function generateRecommendationBlurb(
  top: RecommendedGame,
  allMembers: number
): Promise<string | null> {
  const cacheKey = blurbCacheKey(top.appId, top.owners);
  const cached = blurbCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.blurb;
  }

  let ai;
  try {
    ai = getAIProviderForTask("light");
  } catch (err) {
    if (err instanceof AIDisabledError || err instanceof AINotConfiguredError) {
      return null;
    }
    throw err;
  }

  const [metaResult, recentResult] = await Promise.all([
    db.query<GameMeta>(
      `SELECT tags, is_single_player, is_online_coop, is_lan_coop,
              is_shared_split_coop, is_online_pvp, is_mmo, mp_max_players_approx
       FROM games WHERE app_id = $1`,
      [top.appId]
    ),
    db.query<RecentPlayer>(
      `SELECT COALESCE(gm.display_name, gm.username, 'someone') AS display_name, ug.playtime_2weeks
       FROM shareable_user_games ug
       INNER JOIN users u ON u.id = ug.user_id
       LEFT JOIN guild_members gm ON gm.discord_user_id = u.discord_user_id AND gm.in_guild = TRUE
       WHERE ug.app_id = $1 AND ug.playtime_2weeks > 0
       ORDER BY ug.playtime_2weeks DESC LIMIT 3`,
      [top.appId]
    )
  ]);

  const meta = metaResult.rows[0];
  const tags = meta?.tags ?? [];

  // Describe real multiplayer capability instead of the old fake session/player
  // stats. Order roughly from most-social to least.
  const capabilityLabel = meta?.is_mmo
    ? "MMO"
    : meta?.is_online_pvp
      ? "online PvP"
      : meta?.is_online_coop
        ? "online co-op"
        : meta?.is_lan_coop
          ? "LAN co-op"
          : meta?.is_shared_split_coop
            ? "couch/split-screen co-op"
            : tags.some((tag) => /multi-?player|co-?op/i.test(tag))
              ? "multiplayer"
              : meta?.is_single_player
                ? "single-player"
                : "co-op friendly";

  const playerCapNote =
    meta?.mp_max_players_approx != null ? `up to ${meta.mp_max_players_approx} players` : null;

  const ownershipNote =
    top.nearMatchMissingMembers === 0
      ? `all ${allMembers} own it`
      : `${top.owners}/${allMembers} own it`;

  const recentNote =
    recentResult.rows.length > 0
      ? recentResult.rows
          .map((r) => `${r.display_name}(${Math.round((r.playtime_2weeks / 60) * 10) / 10}h)`)
          .join(" ")
      : null;

  // Compact context — tokens are precious for a one-sentence output
  const context = [
    `${top.name} · ${ownershipNote} · ${capabilityLabel}${playerCapNote ? ` · ${playerCapNote}` : ""}`,
    tags.length ? `Tags: ${tags.slice(0, 6).join(", ")}` : null,
    recentNote ? `Crew played recently: ${recentNote}` : null
  ]
    .filter(Boolean)
    .join("\n");

  const result = await ai.complete(
    [
      {
        role: "system",
        content:
          `Write one-sentence recommendation blurbs for ${SITE_BRAND_NAME} gaming community. Casual gamer tone, specific, no quotes, no corporate speak.`
      },
      {
        role: "user",
        content: `One-sentence blurb for this crew pick:\n${context}`
      }
    ],
    { maxTokens: 80 }
  );

  const blurb = result.text.trim().replace(/^["']|["']$/g, "") || null;

  if (blurb) {
    blurbCache.set(cacheKey, { blurb, expiresAt: Date.now() + BLURB_TTL_MS });
  }

  return blurb;
}
