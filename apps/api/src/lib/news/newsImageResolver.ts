import { db } from "../../db/client.js";
import { resolveEntityLogoUrl } from "./newsEntityLogo.js";
import { resolveGameCoverUrl } from "../gameCatalogEnrichment.js";
import { extractImageFromHtml } from "./newsImageHtml.js";
import { verifyImageUrl } from "./newsImageVerify.js";
import { resolveHeroImage } from "./ogImage.js";

/** Branded island cover — absolute last resort so every card has art. */
export const NEWS_DEFAULT_COVER_PATH = "/art/trail/tbi_island_overhead_mstrail_1.webp";

export type NewsImageSource =
  | "feed"
  | "og"
  | "twitter"
  | "description"
  | "sibling"
  | "steam"
  | "cheapshark"
  | "igdb"
  | "entity_igdb"
  | "wikipedia"
  | "default"
  | "none";

export type ResolvedNewsImage = {
  url: string;
  source: NewsImageSource;
  width: number | null;
  height: number | null;
};

type NewsImageRow = {
  id: number;
  url: string;
  title: string;
  ai_title: string | null;
  ai_tags: string[];
  contents: string | null;
  image_url: string | null;
  image_source: string | null;
  linked_app_id: number | null;
  ai_game_title: string | null;
  ai_story_fingerprint: string | null;
  published_at: string;
};

function isIslandDefaultCover(row: Pick<NewsImageRow, "image_url" | "image_source">): boolean {
  return (
    row.image_source === "default" ||
    row.image_url === NEWS_DEFAULT_COVER_PATH ||
    (row.image_url?.endsWith(NEWS_DEFAULT_COVER_PATH) ?? false)
  );
}

async function loadNewsImageRow(id: number): Promise<NewsImageRow | null> {
  const r = await db.query<NewsImageRow>(
    `
      SELECT id, url, title, ai_title, ai_tags, contents, image_url, image_source, linked_app_id,
             ai_game_title, ai_story_fingerprint, published_at::text
        FROM general_news
       WHERE id = $1
    `,
    [id]
  );
  return r.rows[0] ?? null;
}

async function findSiblingCover(row: NewsImageRow): Promise<string | null> {
  if (row.ai_story_fingerprint) {
    const fp = await db.query<{ image_url: string }>(
      `
        SELECT image_url
          FROM general_news
         WHERE id <> $1
           AND image_url IS NOT NULL
           AND ai_story_fingerprint = $2
           AND ai_relevance_score > 0
         ORDER BY image_width DESC NULLS LAST, ai_relevance_score DESC
         LIMIT 1
      `,
      [row.id, row.ai_story_fingerprint]
    );
    if (fp.rows[0]?.image_url) return fp.rows[0].image_url;
  }

  if (row.linked_app_id) {
    const game = await db.query<{ image_url: string }>(
      `
        SELECT image_url
          FROM general_news
         WHERE id <> $1
           AND image_url IS NOT NULL
           AND linked_app_id = $2
           AND published_at >= $3::timestamptz - INTERVAL '21 days'
           AND published_at <= $3::timestamptz + INTERVAL '21 days'
         ORDER BY image_width DESC NULLS LAST, ai_relevance_score DESC NULLS LAST
         LIMIT 1
      `,
      [row.id, row.linked_app_id, row.published_at]
    );
    if (game.rows[0]?.image_url) return game.rows[0].image_url;
  }

  return null;
}

async function tryUrl(
  candidate: string | null | undefined,
  baseUrl?: string
): Promise<{ url: string; width: number | null; height: number | null } | null> {
  if (!candidate?.trim()) return null;
  let absolute = candidate.trim();
  try {
    absolute = new URL(absolute, baseUrl).toString();
  } catch {
    return null;
  }
  if (!(await verifyImageUrl(absolute))) return null;
  return { url: absolute, width: null, height: null };
}

async function resolveGameCover(row: NewsImageRow): Promise<{ url: string; source: NewsImageSource } | null> {
  const cover = await resolveGameCoverUrl({
    appId: row.linked_app_id,
    gameName: row.ai_game_title
  });
  if (!cover) return null;
  const verified = await tryUrl(cover.url);
  if (!verified) return null;
  const source: NewsImageSource =
    cover.provider === "igdb" ? "igdb" : cover.provider === "cheapshark" ? "cheapshark" : "steam";
  return { url: verified.url, source };
}

async function resolveEntityCover(
  row: NewsImageRow
): Promise<{ url: string; source: NewsImageSource } | null> {
  const entity = await resolveEntityLogoUrl({
    title: row.title,
    aiTitle: row.ai_title,
    aiGameTitle: row.ai_game_title,
    aiTags: row.ai_tags,
    storyFingerprint: row.ai_story_fingerprint
  });
  if (!entity) return null;
  const verified = await tryUrl(entity.url);
  if (!verified) return null;
  return { url: verified.url, source: entity.source };
}

/**
 * Resolve a cover through the full fallback ladder (no AI generation).
 * Island default is only used when no related art or entity logo can be found.
 */
export async function resolveNewsArticleImage(row: NewsImageRow): Promise<ResolvedNewsImage> {
  if (row.image_url && !isIslandDefaultCover(row)) {
    const existing = await tryUrl(row.image_url, row.url);
    if (existing) {
      return {
        url: existing.url,
        source: (row.image_source as NewsImageSource) || "feed",
        width: null,
        height: null
      };
    }
  }

  const og = await resolveHeroImage(row.url);
  if (og?.url && (await verifyImageUrl(og.url))) {
    return {
      url: og.url,
      source: og.source === "twitter" ? "twitter" : "og",
      width: og.width,
      height: og.height
    };
  }

  const fromBody = extractImageFromHtml(row.contents);
  const bodyHit = await tryUrl(fromBody, row.url);
  if (bodyHit) {
    return { url: bodyHit.url, source: "description", width: null, height: null };
  }

  const sibling = await findSiblingCover(row);
  const siblingHit = await tryUrl(sibling, row.url);
  if (siblingHit) {
    return { url: siblingHit.url, source: "sibling", width: null, height: null };
  }

  const gameCover = await resolveGameCover(row);
  if (gameCover) {
    return { url: gameCover.url, source: gameCover.source, width: null, height: null };
  }

  const entityCover = await resolveEntityCover(row);
  if (entityCover) {
    return { url: entityCover.url, source: entityCover.source, width: null, height: null };
  }

  return {
    url: NEWS_DEFAULT_COVER_PATH,
    source: "default",
    width: null,
    height: null
  };
}

export async function persistNewsArticleImage(id: number): Promise<ResolvedNewsImage | null> {
  const row = await loadNewsImageRow(id);
  if (!row) return null;

  const resolved = await resolveNewsArticleImage(row);
  await db.query(
    `
      UPDATE general_news
         SET image_url = $2,
             image_source = $3,
             image_width = $4,
             image_height = $5,
             image_resolved_at = NOW()
       WHERE id = $1
    `,
    [id, resolved.url, resolved.source, resolved.width, resolved.height]
  );
  return resolved;
}

export async function resolveNewsImagesForIds(ids: number[]): Promise<{ resolved: number; scanned: number }> {
  if (ids.length === 0) return { resolved: 0, scanned: 0 };
  let resolved = 0;
  for (const id of ids) {
    try {
      const before = await loadNewsImageRow(id);
      const after = await persistNewsArticleImage(id);
      if (
        after &&
        (!before?.image_url ||
          before.image_url !== after.url ||
          isIslandDefaultCover(before))
      ) {
        resolved++;
      }
    } catch (err) {
      console.warn(`[news-images] resolve failed for id=${id}:`, err);
    }
  }
  return { resolved, scanned: ids.length };
}

/** Rows still missing a verified cover (null URL or never resolved). */
export async function countNewsImagesMissing(): Promise<number> {
  const r = await db.query<{ c: string }>(
    `
      SELECT COUNT(*)::text AS c
        FROM general_news
       WHERE image_url IS NULL
          OR image_resolved_at IS NULL
    `
  );
  return parseInt(r.rows[0]?.c ?? "0", 10);
}

/** Live feed cards still on the generic island placeholder or unresolved. */
export async function countLiveCardsMissingImages(): Promise<number> {
  const r = await db.query<{ c: string }>(
    `
      SELECT COUNT(*)::text AS c
        FROM general_news
       WHERE ai_curated_at IS NOT NULL
         AND ai_relevance_score > 0
         AND ai_validation_failed = FALSE
         AND (
           image_url IS NULL
           OR image_resolved_at IS NULL
           OR image_source = 'default'
         )
    `
  );
  return parseInt(r.rows[0]?.c ?? "0", 10);
}

/**
 * Backfill covers for rows missing resolution. Prioritizes live cards, then recent.
 */
export async function backfillMissingNewsImages(
  maxRows = 50
): Promise<{ scanned: number; resolved: number; remaining: number }> {
  const candidates = await db.query<{ id: number }>(
    `
      SELECT id
        FROM general_news
       WHERE image_url IS NULL
          OR image_resolved_at IS NULL
          OR image_source = 'default'
       ORDER BY
         (ai_curated_at IS NOT NULL AND ai_relevance_score > 0 AND ai_validation_failed = FALSE) DESC,
         published_at DESC
       LIMIT $1
    `,
    [maxRows]
  );
  const { scanned, resolved } = await resolveNewsImagesForIds(candidates.rows.map((r) => r.id));
  const remaining = await countNewsImagesMissing();
  return { scanned, resolved, remaining };
}
