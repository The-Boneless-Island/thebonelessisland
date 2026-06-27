import { env } from "../config.js";
import { db } from "../db/client.js";

export type GameImageProvider = "steam" | "cheapshark" | "igdb";
export const GAME_IMAGE_PROVIDER_PRIORITY: readonly GameImageProvider[] = ["steam", "cheapshark", "igdb"];

export async function resolveGameCoverUrl(context: {
  appId?: number | null;
  gameName?: string | null;
}): Promise<{ url: string; provider: GameImageProvider } | null> {
  const appId = context.appId ?? null;
  const gameName = (context.gameName ?? "").trim();

  if (appId) {
    const cached = await db.query<{ header_image_url: string | null; name: string }>(
      `SELECT header_image_url, name FROM games WHERE app_id = $1`,
      [appId]
    );
    const row = cached.rows[0];
    if (row?.header_image_url?.trim()) {
      return { url: row.header_image_url.trim(), provider: "steam" };
    }
    if (row?.name) {
      const steamMap = await resolveSteamImageMap([appId]);
      const steamUrl = steamMap.get(appId);
      if (steamUrl) return { url: steamUrl, provider: "steam" };
    }
  }

  const lookupName = gameName || (appId
    ? (await db.query<{ name: string }>(`SELECT name FROM games WHERE app_id = $1`, [appId])).rows[0]?.name
    : null);
  if (!lookupName?.trim()) return null;

  const candidateContext: GameImageCandidateContext = {
    appId: appId ?? 0,
    name: lookupName.trim()
  };

  for (const provider of GAME_IMAGE_PROVIDER_PRIORITY) {
    if (!isProviderEnabled(provider)) continue;
    if (provider === "steam" && appId) {
      const steamMap = await resolveSteamImageMap([appId]);
      const steamUrl = steamMap.get(appId);
      if (steamUrl) return { url: steamUrl, provider: "steam" };
      continue;
    }
    if (provider === "cheapshark") {
      const cheap = await resolveCheapSharkImage(candidateContext);
      if (cheap) return { url: cheap, provider: "cheapshark" };
    }
    if (provider === "igdb") {
      const igdb = await resolveIgdbImageByName(candidateContext.name);
      if (igdb) return { url: igdb, provider: "igdb" };
    }
  }
  return null;
}

type SteamAppDetails = {
  success?: boolean;
  data?: {
    name?: string;
    developers?: string[];
    genres?: Array<{ description?: string }>;
    categories?: Array<{ id?: number; description?: string }>;
    header_image?: string;
    short_description?: string;
    background?: string;
    background_raw?: string;
    controller_support?: string;
    screenshots?: Array<{ id?: number; path_thumbnail?: string; path_full?: string }>;
    metacritic?: { score?: number; url?: string };
    platforms?: { windows?: boolean; mac?: boolean; linux?: boolean };
    is_free?: boolean;
    price_overview?: {
      currency?: string;
      initial?: number;
      final?: number;
      discount_percent?: number;
    };
    release_date?: {
      coming_soon?: boolean;
      date?: string;
    };
  };
};

export type GameScreenshot = { thumb: string; full: string };

type CheapSharkGameResult = {
  thumb?: string;
  external?: string;
  steamAppID?: string;
};
type IgdbTokenResponse = {
  access_token?: string;
  expires_in?: number;
};
type IgdbGameSearchResult = {
  cover?: number;
};
type IgdbCoverResult = {
  image_id?: string;
};
type GameImageCandidateContext = {
  appId: number;
  name: string;
};

let igdbAccessTokenCache: { token: string; expiresAtMs: number } | null = null;

async function markImageChecked(appId: number): Promise<void> {
  await db.query(
    `
      UPDATE games
      SET header_image_checked_at = NOW()
      WHERE app_id = $1
    `,
    [appId]
  );
}

// Steam's storefront appdetails endpoint only honours a SINGLE appid per
// request — a comma-separated list returns HTTP 400. We therefore fetch one
// appid at a time with a small delay between calls to stay within the
// endpoint's unofficial IP rate limit (~200 requests / 5 min).
const APPDETAILS_REQUEST_DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Returns a record keyed by appid string. A MISSING key means the request
// failed transiently (network / 429 / 5xx) — callers must leave such rows
// unstamped so they retry. A PRESENT key with success:false means Steam has no
// public store page for that appid (delisted / region-locked / non-app) —
// callers should stamp it to stop re-fetching. A present key with success:true
// carries the data.
async function fetchSteamAppDetails(appIds: number[]): Promise<Record<string, SteamAppDetails>> {
  const out: Record<string, SteamAppDetails> = {};
  for (let i = 0; i < appIds.length; i++) {
    const appId = appIds[i];
    if (i > 0) {
      await sleep(APPDETAILS_REQUEST_DELAY_MS);
    }
    const response = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appId}&l=en&cc=us`
    ).catch(() => null);
    if (!response?.ok) {
      // Transient failure — leave the key absent so the caller retries later.
      continue;
    }
    const payload = (await response.json().catch(() => null)) as Record<string, SteamAppDetails> | null;
    const entry = payload?.[String(appId)];
    if (entry) {
      out[String(appId)] = entry;
    }
  }
  return out;
}

async function resolveSteamImageMap(appIds: number[]): Promise<Map<number, string>> {
  const detailsByAppId = await fetchSteamAppDetails(appIds);
  const imageMap = new Map<number, string>();
  for (const appId of appIds) {
    const headerImage = detailsByAppId[String(appId)]?.data?.header_image?.trim();
    if (headerImage) {
      imageMap.set(appId, headerImage);
    }
  }
  return imageMap;
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreCheapSharkCandidate(candidate: CheapSharkGameResult, gameName: string, appId: number): number {
  const normalizedTarget = normalizeForMatch(gameName);
  const normalizedExternal = normalizeForMatch(candidate.external ?? "");
  const targetWords = normalizedTarget.split(" ").filter(Boolean);
  const externalWords = new Set(normalizedExternal.split(" ").filter(Boolean));

  let score = 0;
  if (candidate.steamAppID && Number(candidate.steamAppID) === appId) {
    score += 1000;
  }
  if (normalizedExternal === normalizedTarget) {
    score += 500;
  } else if (
    normalizedExternal.length > 0 &&
    normalizedTarget.length > 0 &&
    (normalizedExternal.includes(normalizedTarget) || normalizedTarget.includes(normalizedExternal))
  ) {
    score += 250;
  }
  for (const word of targetWords) {
    if (externalWords.has(word)) {
      score += 20;
    }
  }
  return score;
}

async function resolveCheapSharkImage(context: GameImageCandidateContext): Promise<string | null> {
  const rawName = context.name.trim();
  const normalizedName = normalizeForMatch(rawName);
  const attempts = Array.from(new Set([rawName, normalizedName].filter((value) => value.length > 0)));

  const candidates: CheapSharkGameResult[] = [];
  for (const term of attempts) {
    const searchUrl = `https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(term)}&limit=25&exact=0`;
    const response = await fetch(searchUrl).catch(() => null);
    if (!response?.ok) {
      continue;
    }
    const payload = (await response.json().catch(() => [])) as CheapSharkGameResult[];
    candidates.push(...payload);
  }

  const withImages = candidates.filter((item) => Boolean(item.thumb?.trim()));
  if (!withImages.length) {
    return null;
  }

  let best: CheapSharkGameResult | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of withImages) {
    const score = scoreCheapSharkCandidate(candidate, context.name, context.appId);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best?.thumb?.trim() ?? null;
}

async function getIgdbAccessToken(): Promise<string | null> {
  if (!env.IGDB_IMAGE_FALLBACK_ENABLED) {
    return null;
  }
  if (!env.IGDB_CLIENT_ID || !env.IGDB_CLIENT_SECRET) {
    return null;
  }

  const now = Date.now();
  if (igdbAccessTokenCache && igdbAccessTokenCache.expiresAtMs > now + 15_000) {
    return igdbAccessTokenCache.token;
  }

  const body = new URLSearchParams({
    client_id: env.IGDB_CLIENT_ID,
    client_secret: env.IGDB_CLIENT_SECRET,
    grant_type: "client_credentials"
  });
  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  }).catch(() => null);
  if (!response?.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as IgdbTokenResponse | null;
  const accessToken = payload?.access_token?.trim();
  const expiresIn = payload?.expires_in ?? 0;
  if (!accessToken || expiresIn <= 0) {
    return null;
  }

  igdbAccessTokenCache = {
    token: accessToken,
    expiresAtMs: now + expiresIn * 1000
  };
  return accessToken;
}

async function resolveIgdbImageByName(gameName: string): Promise<string | null> {
  const accessToken = await getIgdbAccessToken();
  if (!accessToken) {
    return null;
  }

  const gameSearchQuery = [`search "${gameName.replaceAll('"', '\\"')}";`, "fields cover;", "limit 1;"].join(" ");
  const gamesResponse = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: {
      "Client-ID": env.IGDB_CLIENT_ID,
      Authorization: `Bearer ${accessToken}`,
      "content-type": "text/plain"
    },
    body: gameSearchQuery
  }).catch(() => null);
  if (!gamesResponse?.ok) {
    return null;
  }

  const gamePayload = (await gamesResponse.json().catch(() => [])) as IgdbGameSearchResult[];
  const coverId = gamePayload[0]?.cover;
  if (!coverId) {
    return null;
  }

  const coverQuery = [`where id = ${coverId};`, "fields image_id;", "limit 1;"].join(" ");
  const coversResponse = await fetch("https://api.igdb.com/v4/covers", {
    method: "POST",
    headers: {
      "Client-ID": env.IGDB_CLIENT_ID,
      Authorization: `Bearer ${accessToken}`,
      "content-type": "text/plain"
    },
    body: coverQuery
  }).catch(() => null);
  if (!coversResponse?.ok) {
    return null;
  }

  const coverPayload = (await coversResponse.json().catch(() => [])) as IgdbCoverResult[];
  const imageId = coverPayload[0]?.image_id?.trim();
  if (!imageId) {
    return null;
  }
  return `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`;
}

function isProviderEnabled(provider: GameImageProvider): boolean {
  if (provider === "igdb") {
    return env.IGDB_IMAGE_FALLBACK_ENABLED && Boolean(env.IGDB_CLIENT_ID) && Boolean(env.IGDB_CLIENT_SECRET);
  }
  return true;
}

type SteamCapabilityFlags = {
  isSinglePlayer: boolean;
  isOnlineCoop: boolean;
  isLanCoop: boolean;
  isSharedSplitCoop: boolean;
  isOnlinePvp: boolean;
  isMmo: boolean;
};

// Steam store category id -> capability flag (per the signed-off appdetails plan).
// Generic 1 (Multi-player) / 9 (Co-op) set no specific bool but still mark the
// game multiplayer-capable (i.e. not single-player-only).
function deriveSteamCapabilities(categories: Array<{ id?: number; description?: string }>): SteamCapabilityFlags {
  const flags: SteamCapabilityFlags = {
    isSinglePlayer: false,
    isOnlineCoop: false,
    isLanCoop: false,
    isSharedSplitCoop: false,
    isOnlinePvp: false,
    isMmo: false
  };
  for (const category of categories) {
    switch (category.id) {
      case 2:
        flags.isSinglePlayer = true;
        break;
      case 38:
        flags.isOnlineCoop = true;
        break;
      case 48:
        flags.isLanCoop = true;
        break;
      case 39:
        flags.isSharedSplitCoop = true;
        break;
      case 36:
      case 37:
      case 49:
      case 47:
        flags.isOnlinePvp = true;
        break;
      case 20:
        flags.isMmo = true;
        break;
      default:
        break;
    }
  }
  return flags;
}

// Steam release_date.date is a localized free-text string (e.g. "10 Jul, 2018",
// "Q4 2025", "Coming soon"). Parse to a timestamptz only when reasonably
// unambiguous; otherwise return null and keep the raw text.
function parseSteamReleaseDate(dateText: string | undefined | null): Date | null {
  const trimmed = dateText?.trim();
  if (!trimmed) return null;
  // Reject obvious non-dates (quarters, "Coming soon", year-only ranges).
  if (!/\d{4}/.test(trimmed) || /^q[1-4]\b/i.test(trimmed) || /coming\s+soon/i.test(trimmed)) {
    return null;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export async function enrichGameMetadataFromSteam(appIds: number[]): Promise<void> {
  if (!appIds.length) return;

  // Freshness gate: (re)fetch a row when EITHER its core metadata is stale
  // (metadata_updated_at >24h or null) OR its store details are stale
  // (store_details_checked_at >7d or null). The store-details clause guarantees
  // a one-time backfill of already-enriched rows whose metadata_updated_at is
  // recent but that never had capability/price data written.
  const fresh = await db.query<{ app_id: number }>(
    `
      SELECT app_id
      FROM games
      WHERE app_id = ANY($1::int[])
        AND metadata_updated_at IS NOT NULL
        AND metadata_updated_at > NOW() - INTERVAL '24 hours'
        AND store_details_checked_at IS NOT NULL
        AND store_details_checked_at > NOW() - INTERVAL '7 days'
    `,
    [appIds]
  );
  const freshIds = new Set(fresh.rows.map((row) => row.app_id));
  const staleIds = appIds.filter((appId) => !freshIds.has(appId));
  if (!staleIds.length) return;

  const payload = await fetchSteamAppDetails(staleIds);
  for (const appId of staleIds) {
    const appData = payload[String(appId)];
    if (appData === undefined) {
      // Transient fetch failure — leave the row unstamped so a later sweep
      // retries it.
      continue;
    }
    if (!appData.success || !appData.data) {
      // Steam has no public store page for this appid (delisted / region-locked
      // / DLC / non-app). Stamp the freshness markers so we stop re-fetching it
      // every sweep — the human-readable name still comes from the app-list
      // path (steamAppList.ts). Leave name and other fields untouched.
      await db.query(
        `
          UPDATE games
          SET store_details_checked_at = NOW(),
              metadata_updated_at = COALESCE(metadata_updated_at, NOW())
          WHERE app_id = $1
        `,
        [appId]
      );
      continue;
    }

    const data = appData.data;
    const developers = (data.developers ?? []).filter(Boolean);
    const genreTags = (data.genres ?? []).map((x) => x.description?.trim() ?? "").filter(Boolean);
    const categories = data.categories ?? [];
    const categoryTags = categories.map((x) => x.description?.trim() ?? "").filter(Boolean);
    const tags = Array.from(new Set([...genreTags, ...categoryTags]));
    const hasSteamImage = Boolean(data.header_image?.trim());

    const capabilities = deriveSteamCapabilities(categories);
    // mp_max_players_approx: Steam appdetails does not expose an explicit max
    // here, so we leave it NULL (generic multiplayer stays NULL too).
    // "Multiplayer-capable" (incl. generic categories 1/9) is derivable
    // downstream from these bools + the persisted tags; no column for it here.
    const mpMaxPlayersApprox: number | null = null;

    const price = data.price_overview;
    const isFree = data.is_free === true;
    const priceCurrency = price?.currency?.trim() || null;
    const priceInitialCents = typeof price?.initial === "number" ? price.initial : null;
    const priceFinalCents = typeof price?.final === "number" ? price.final : null;
    const priceDiscountPct = typeof price?.discount_percent === "number" ? price.discount_percent : null;

    const comingSoon = data.release_date?.coming_soon === true;
    const releaseDateText = data.release_date?.date?.trim() || null;
    const releaseDateParsed = parseSteamReleaseDate(releaseDateText);

    // Rich media (migration 050) — same response, previously discarded.
    const shortDescription = data.short_description?.trim() || null;
    const backgroundUrl = (data.background_raw ?? data.background)?.trim() || null;
    const controllerSupport = data.controller_support?.trim() || null;
    const screenshots: GameScreenshot[] = (data.screenshots ?? [])
      .map((s) => ({ thumb: s.path_thumbnail?.trim() ?? "", full: s.path_full?.trim() ?? "" }))
      .filter((s) => s.thumb && s.full)
      .slice(0, 6);
    const screenshotsJson = screenshots.length > 0 ? JSON.stringify(screenshots) : null;
    const metacriticScore =
      typeof data.metacritic?.score === "number" ? data.metacritic.score : null;
    const metacriticUrl = data.metacritic?.url?.trim() || null;
    const platformWindows = data.platforms?.windows === true;
    const platformMac = data.platforms?.mac === true;
    const platformLinux = data.platforms?.linux === true;

    await db.query(
      `
        UPDATE games
        SET
          name = COALESCE(NULLIF($2, ''), name),
          developers = $3::text[],
          tags = $4::text[],
          header_image_url = COALESCE(NULLIF($5, ''), header_image_url),
          header_image_provider = CASE
            WHEN NULLIF($5, '') IS NOT NULL THEN 'steam'
            ELSE header_image_provider
          END,
          metadata_updated_at = NOW(),
          header_image_checked_at = CASE
            WHEN $6::boolean THEN NOW()
            ELSE header_image_checked_at
          END,
          is_single_player = $7::boolean,
          is_online_coop = $8::boolean,
          is_lan_coop = $9::boolean,
          is_shared_split_coop = $10::boolean,
          is_online_pvp = $11::boolean,
          is_mmo = $12::boolean,
          mp_max_players_approx = $13::integer,
          is_free = $14::boolean,
          price_currency = $15::text,
          price_initial_cents = $16::integer,
          price_final_cents = $17::integer,
          price_discount_pct = $18::integer,
          release_coming_soon = $19::boolean,
          release_date_text = $20::text,
          release_date_parsed = $21::timestamptz,
          short_description = $22::text,
          screenshots = $23::jsonb,
          background_url = $24::text,
          metacritic_score = $25::integer,
          metacritic_url = $26::text,
          platform_windows = $27::boolean,
          platform_mac = $28::boolean,
          platform_linux = $29::boolean,
          controller_support = $30::text,
          store_details_checked_at = NOW(),
          price_checked_at = NOW()
        WHERE app_id = $1
      `,
      [
        appId,
        data.name ?? "",
        developers,
        tags,
        data.header_image ?? "",
        hasSteamImage,
        capabilities.isSinglePlayer,
        capabilities.isOnlineCoop,
        capabilities.isLanCoop,
        capabilities.isSharedSplitCoop,
        capabilities.isOnlinePvp,
        capabilities.isMmo,
        mpMaxPlayersApprox,
        isFree,
        priceCurrency,
        priceInitialCents,
        priceFinalCents,
        priceDiscountPct,
        comingSoon,
        releaseDateText,
        releaseDateParsed,
        shortDescription,
        screenshotsJson,
        backgroundUrl,
        metacriticScore,
        metacriticUrl,
        platformWindows,
        platformMac,
        platformLinux,
        controllerSupport
      ]
    );
  }
}

export async function enrichMissingGameImages(appIds: number[]): Promise<void> {
  if (!appIds.length) return;

  const games = await db.query<{ app_id: number; name: string; header_image_url: string | null }>(
    `
      SELECT app_id, name, header_image_url
      FROM games
      WHERE app_id = ANY($1::int[])
    `,
    [appIds]
  );

  // Skip rows that already have an image BEFORE any external fetch.
  const missingImageGames = games.rows.filter((game) => !game.header_image_url);

  const steamImageMap = GAME_IMAGE_PROVIDER_PRIORITY.includes("steam")
    ? await resolveSteamImageMap(missingImageGames.map((game) => game.app_id))
    : new Map<number, string>();

  const resolveImageForProvider = async (
    provider: GameImageProvider,
    context: GameImageCandidateContext
  ): Promise<string | null> => {
    if (provider === "steam") {
      return steamImageMap.get(context.appId) ?? null;
    }
    if (provider === "cheapshark") {
      return resolveCheapSharkImage(context);
    }
    if (provider === "igdb") {
      return resolveIgdbImageByName(context.name);
    }
    return null;
  };

  for (const game of missingImageGames) {
    let resolvedProvider: GameImageProvider | null = null;
    let resolvedUrl: string | null = null;
    for (const provider of GAME_IMAGE_PROVIDER_PRIORITY) {
      if (!isProviderEnabled(provider)) {
        continue;
      }
      const candidate = await resolveImageForProvider(provider, { appId: game.app_id, name: game.name });
      if (candidate) {
        resolvedProvider = provider;
        resolvedUrl = candidate;
        break;
      }
    }

    if (resolvedUrl && resolvedProvider) {
      await db.query(
        `
          UPDATE games
          SET
            header_image_url = $2,
            header_image_provider = $3,
            metadata_updated_at = NOW(),
            header_image_checked_at = NOW()
          WHERE app_id = $1
            AND (header_image_url IS NULL OR header_image_url = '')
        `,
        [game.app_id, resolvedUrl, resolvedProvider]
      );
      continue;
    }

    await markImageChecked(game.app_id);
  }
}
