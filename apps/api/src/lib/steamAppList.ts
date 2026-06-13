import { env } from "../config.js";
import { db } from "../db/client.js";

// Steam's storefront appdetails endpoint only accepts a SINGLE appid per
// request — a comma-separated list returns HTTP 400 — so it cannot bulk-resolve
// names. IStoreService/GetAppList/v1 returns the full appid -> name catalog
// (paginated), which is the reliable bulk source for human-readable names. We
// cache it in memory and refresh daily; lookups are then instant and
// rate-limit free, and it even names apps whose store page enrichment fails.
//
// This is the fast path for names. Rich store data (price, tags, art, capability
// flags) still comes from gameCatalogEnrichment's per-app appdetails calls,
// which ALSO write the name — so when no STEAM_WEB_API_KEY is configured (the
// GetAppList endpoint is key-gated) names still resolve via that slower path.

type StoreAppListResponse = {
  response?: {
    apps?: Array<{ appid?: number; name?: string }>;
    have_more_results?: boolean;
    last_appid?: number;
  };
};

// GetAppList caps a page at 50k entries; the live catalog is a few hundred
// thousand apps, so MAX_PAGES is a generous safety bound against a runaway loop.
const PAGE_SIZE = 50_000;
const MAX_PAGES = 30;

let appNameMap: Map<number, string> | null = null;
let loadedAtMs = 0;
let inFlight: Promise<void> | null = null;

const TTL_MS = 24 * 60 * 60 * 1000;

function isStale(): boolean {
  return !appNameMap || appNameMap.size === 0 || Date.now() - loadedAtMs > TTL_MS;
}

/**
 * (Re)load the full Steam app-list into the in-memory map. Refresh is skipped
 * when a fresh map already exists unless `force` is set. Concurrent callers
 * share a single in-flight fetch. Returns the number of cached app names.
 */
export async function refreshSteamAppList(force = false): Promise<number> {
  if (!force && !isStale()) {
    return appNameMap?.size ?? 0;
  }
  if (inFlight) {
    await inFlight;
    return appNameMap?.size ?? 0;
  }

  inFlight = (async () => {
    // GetAppList is key-gated. Without a key the bulk path is unavailable;
    // per-app appdetails enrichment (gameCatalogEnrichment) still resolves names.
    if (!env.STEAM_WEB_API_KEY) {
      return;
    }
    const next = new Map<number, string>();
    let lastAppId = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const url =
        `https://api.steampowered.com/IStoreService/GetAppList/v1/` +
        `?key=${env.STEAM_WEB_API_KEY}` +
        `&include_games=true&include_dlc=true` +
        `&max_results=${PAGE_SIZE}` +
        (lastAppId > 0 ? `&last_appid=${lastAppId}` : "");
      const response = await fetch(url).catch(() => null);
      if (!response?.ok) {
        break;
      }
      const payload = (await response.json().catch(() => null)) as StoreAppListResponse | null;
      const apps = payload?.response?.apps ?? [];
      for (const app of apps) {
        const id = typeof app.appid === "number" ? app.appid : null;
        const name = app.name?.trim();
        if (id && id > 0 && name) {
          next.set(id, name);
        }
      }
      // Advance the cursor only while Steam reports more pages AND the cursor
      // strictly moves forward — guards against an infinite loop on a stuck
      // last_appid.
      const cursor = payload?.response?.last_appid;
      if (!payload?.response?.have_more_results || apps.length === 0) {
        break;
      }
      if (typeof cursor !== "number" || cursor <= lastAppId) {
        break;
      }
      lastAppId = cursor;
    }
    // Only swap in a non-empty result so a malformed/partial response never
    // wipes a previously-good cache.
    if (next.size > 0) {
      appNameMap = next;
      loadedAtMs = Date.now();
    }
  })().finally(() => {
    inFlight = null;
  });

  await inFlight;
  return appNameMap?.size ?? 0;
}

async function ensureSteamAppListLoaded(): Promise<void> {
  if (isStale()) {
    await refreshSteamAppList();
  }
}

/** In-memory lookup of an appid's human-readable name. Null when unknown. */
export function lookupSteamAppName(appId: number): string | null {
  return appNameMap?.get(appId) ?? null;
}

/**
 * Resolve placeholder ('app-<id>') names for the given appids from the cached
 * app-list and write the real names. Only rows still holding the placeholder
 * are updated, so a previously-resolved real name is never clobbered. Names
 * come from the in-memory map (no per-app HTTP), so this is cheap. Returns the
 * number of rows whose name was resolved.
 */
export async function resolveGameNamesFromAppList(appIds: number[]): Promise<number> {
  if (!appIds.length) {
    return 0;
  }
  await ensureSteamAppListLoaded();

  const ids: number[] = [];
  const names: string[] = [];
  for (const appId of appIds) {
    const name = lookupSteamAppName(appId);
    if (name) {
      ids.push(appId);
      names.push(name);
    }
  }
  if (!ids.length) {
    return 0;
  }

  const result = await db.query(
    `
      UPDATE games AS g
      SET name = v.name
      FROM UNNEST($1::int[], $2::text[]) AS v(app_id, name)
      WHERE g.app_id = v.app_id
        AND g.name ~ '^app-[0-9]+$'
    `,
    [ids, names]
  );
  return result.rowCount ?? 0;
}

/**
 * Safety-net sweep: resolve any game row still holding the 'app-<id>'
 * placeholder name (e.g. wishlist items, whose Steam API returns appids only,
 * or rows whose store page failed enrichment). Bounded per run. Cheap — names
 * resolve from the cached app-list with no per-app HTTP. Returns rows fixed.
 */
export async function repairMissingGameNames(limit = 200): Promise<number> {
  const rows = await db.query<{ app_id: number }>(
    `SELECT app_id FROM games WHERE name ~ '^app-[0-9]+$' ORDER BY app_id ASC LIMIT $1`,
    [limit]
  );
  if (!rows.rows.length) {
    return 0;
  }
  return resolveGameNamesFromAppList(rows.rows.map((row) => row.app_id));
}
