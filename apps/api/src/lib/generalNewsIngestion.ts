import { db } from "../db/client.js";
import { AIDisabledError, AINotConfiguredError, getAIProvider } from "./ai/index.js";
import { getAiCostTotalUsd } from "./ai/usageTally.js";
import { PROVIDERS } from "./news/providers/index.js";
import type { FeedItem, NewsSourceRow } from "./news/providers/index.js";
import {
  absorbAsSibling,
  embedText,
  findSimilarPrimary,
  isEmbeddingColumnAvailable,
  setEmbedding,
  backfillEmbeddings,
  countMissingEmbeddings
} from "./news/embeddings.js";
import { linkNewsToGame } from "./news/gameLinking.js";
import { applyPreFilter } from "./news/newsPreFilter.js";
import { isFreshCorpusMode, retireStaleUncuratedBacklog } from "./news/newsBacklog.js";
import { withNewsPipelineLock } from "./news/newsPipelineLock.js";
import { getIngestMaxAgeDays } from "./news/newsPipelineDiagnostics.js";
import { shouldTriggerBackgroundIngest } from "./news/newsRetention.js";
import { reportCurationPassOutcome, setLastBatchDiagnostics } from "./news/newsCurationHealth.js";
import { resolveHeroImage } from "./news/ogImage.js";
import {
  recordSourceCurated,
  recordSourceFetchError,
  recordSourceFetchSuccess,
  recordSourceValidationFail
} from "./news/sourceQuality.js";
import { isRepairableValidation, tryValidationRepair } from "./news/validationRepair.js";
import { getAISetting } from "./serverSettings.js";

// ── Types ─────────────────────────────────────────────────────────────────────

// FeedItem is now imported from the providers module so every provider and the
// orchestrator share one shape. Keep `type FeedItem` re-exported here so the
// rest of this file's signatures don't churn.
export type { FeedItem };

type GeneralCurationResult = {
  id: string; // external_id
  relevanceScore: number;
  label: "top_news" | "community" | "personal";
  spoilerWarning: boolean;
  title: string;        // rewritten headline (v3)
  summary: string;
  whyMatters: string;   // mandatory Why This Matters to Boneless Island (v3)
  sources: string[];    // sibling URLs from the batch (v3)
  subtitle: string;
  tags: string[];
  gameTitle: string | null;
  duplicate?: boolean;
  // Semantic fingerprint for merge clustering (v3.2). Normalized lowercase
  // "entity:event-topic", e.g. "poe2:1-0-launch", "ea:layoffs-2026q1".
  storyFingerprint?: string;
  // Merge-into-existing-story fields (v3.1): when the AI determines this new
  // article is a follow-up update to an already-curated card, it sets
  // mergesIntoExistingId to that primary's external_id and provides updated
  // fields synthesizing both the existing summary and the new info. The new
  // article itself is treated as a duplicate (no card emitted).
  mergesIntoExistingId?: string | null;
  updatedTitle?: string;
  updatedSubtitle?: string;
  updatedSummary?: string;
  updatedWhyMatters?: string;
  updatedSources?: string[];
  updatedStoryFingerprint?: string;
};

// Compact projection of an already-curated primary story, supplied to the AI
// as merge context. Allows new articles to be folded into existing cards
// instead of spawning duplicate coverage. Fingerprint replaces the previous
// regex-derived cluster key — AI matches new articles against this on its
// side.
type ExistingPrimary = {
  externalId: string;
  title: string;
  subtitle: string | null;
  summaryPreview: string;
  publishedAt: string;
  sources: string[];
  fingerprint: string | null;
};

type ValidationError =
  | "missing_title"
  | "summary_too_short"
  | "summary_too_long"
  | "missing_why_matters"
  | "missing_sources"
  | "invalid_source_urls";

const MAX_RETRIES_PER_ARTICLE = 2;
const MAX_RETRY_ROUNDS_PER_CYCLE = 2;

// ── Outlet name blocklist ──────────────────────────────────────────────────
// Populated dynamically from news_source_registry at the start of every
// ingestion run. Prevents the AI curator from emitting an outlet name as an
// article tag (e.g. "PC Gamer" / "Polygon" / "r/Games" are not topics).

const OUTLET_TAG_BLOCKLIST = new Set<string>();

async function refreshOutletBlocklist(): Promise<void> {
  const r = await db.query<{ name: string }>(
    `SELECT name FROM news_source_registry`
  );
  OUTLET_TAG_BLOCKLIST.clear();
  for (const row of r.rows) OUTLET_TAG_BLOCKLIST.add(row.name.toLowerCase());
}

// Taxonomy allowlists — only these values are accepted for each category
const ALLOWED_CONTENT_TYPES = new Set([
  "News", "Patch Notes", "Announcement", "Review", "Preview",
  "Opinion", "Interview", "Feature", "Rumor"
]);
const ALLOWED_GENRES = new Set([
  "FPS", "RPG", "Strategy", "Horror", "Platformer", "Survival",
  "Battle Royale", "MOBA", "Racing", "Puzzle", "Fighting", "Sim", "MMO"
]);
const ALLOWED_PLATFORMS = new Set([
  "PC", "PlayStation", "Xbox", "Nintendo", "Mobile", "VR"
]);

/** Fetch lowercased set of all crew game + studio names for Crew Pick tag validation. */
async function getCrewEntityNames(): Promise<Set<string>> {
  const result = await db.query<{ name: string }>(
    `SELECT DISTINCT LOWER(g.name) AS name FROM shareable_user_games ug INNER JOIN games g ON g.app_id = ug.app_id
     UNION
     SELECT DISTINCT LOWER(d) AS name FROM shareable_user_games ug
     INNER JOIN games g ON g.app_id = ug.app_id,
     UNNEST(g.developers) AS d`
  );
  return new Set(result.rows.map((r) => r.name));
}

/**
 * Strip tags that don't belong to the taxonomy allowlist.
 * Crew Pick tags (game/studio names) are validated against crewNames.
 * Pass an empty Set when crew names aren't available.
 */
function sanitizeTags(tags: string[], crewNames: Set<string> = new Set()): string[] {
  const result = tags.filter((t) => {
    const trimmed = t.trim();
    const lower = trimmed.toLowerCase();
    if (!lower) return false;
    if (OUTLET_TAG_BLOCKLIST.has(lower)) return false;
    if (ALLOWED_CONTENT_TYPES.has(trimmed)) return true;
    if (ALLOWED_GENRES.has(trimmed)) return true;
    if (ALLOWED_PLATFORMS.has(trimmed)) return true;
    if (crewNames.has(lower)) return true;
    return false;
  });
  if (result.length !== tags.length) {
    const dropped = tags.filter((t) => !result.includes(t));
    console.log(`[generalNews] sanitizeTags: dropped [${dropped.join("|")}] → kept [${result.join("|")}]`);
  }
  return result;
}

// Bedrock tends to truncate large JSON batches — keep batches smaller there.
function curationBatchSize(): number {
  return (getAISetting("ai_provider") ?? "").toLowerCase() === "bedrock" ? 2 : 6;
}
function curationPoolSize(): number {
  return curationBatchSize() * 3;
}
function curationMaxTokens(batchLen: number): number {
  const provider = (getAISetting("ai_provider") ?? "").toLowerCase();
  if (provider === "bedrock") {
    return Math.min(8192, Math.max(4096, batchLen * 3500));
  }
  return Math.min(16384, Math.max(8192, batchLen * 2800));
}
// Cluster-candidate window: articles within this window are eligible for
// content-overlap merging. AI still judges actual content overlap.
const CLUSTER_WINDOW = "14 days";

let lastIngestedAt = 0;
const INGEST_COOLDOWN_MS = 60 * 60 * 1000;

// ── Tag Matching ──────────────────────────────────────────────────────────────

/** Fetch crew game tags (genres, categories) weighted by ownership. Requires 2+ owners. */
async function getCrewGameTags(): Promise<string[]> {
  const result = await db.query<{ tag: string }>(
    `
      SELECT LOWER(TRIM(t)) AS tag, COUNT(DISTINCT ug.user_id) AS owners
      FROM shareable_user_games ug
      INNER JOIN games g ON g.app_id = ug.app_id,
      UNNEST(g.tags) AS t
      GROUP BY LOWER(TRIM(t))
      HAVING COUNT(DISTINCT ug.user_id) >= 2
      ORDER BY owners DESC
      LIMIT 60
    `
  );
  return result.rows.map((r) => r.tag);
}

/** Fetch distinct game names owned by any crew member. */
async function getCrewGameNames(): Promise<string[]> {
  const result = await db.query<{ name: string }>(
    `
      SELECT DISTINCT LOWER(g.name) AS name
      FROM shareable_user_games ug
      INNER JOIN games g ON g.app_id = ug.app_id
    `
  );
  return result.rows.map((r) => r.name);
}

// Deterministic key used to pre-group candidate sibling articles before AI sees
// them. The AI still decides whether two articles in the same group are truly
// the same story — this only ensures siblings land in the same batch.
function extractClusterKey(row: RawGeneral): string {
  const gameMatches = (row.matched_tags ?? []).filter(
    (t) => typeof t === "string" && (/[A-Z]/.test(t) || t.length >= 4)
  );
  const bestGame = gameMatches.sort((a, b) => b.length - a.length)[0];
  if (bestGame) {
    return bestGame.toLowerCase();
  }
  const phrases = row.title.match(/[A-Z][a-zA-Z0-9']+(?:\s+[A-Z][a-zA-Z0-9']+){1,4}/g) ?? [];
  const bestPhrase = phrases.sort((a, b) => b.length - a.length)[0];
  if (bestPhrase) {
    return bestPhrase.toLowerCase();
  }
  return `__loner__:${row.external_id}`;
}

// Lookback window for fetching already-curated primary stories used as merge
// context. Wider than CLUSTER_WINDOW so follow-up articles can still find a
// recent parent card to absorb into.
const MERGE_LOOKBACK_WINDOW = "21 days";

// Cap on how many recent primary cards we surface to the AI as merge
// candidates. Each entry is small (~150 chars title+subtitle+fingerprint), so
// 40 fits in well under 5K tokens and caches across batches in a curation run.
const MERGE_CANDIDATE_LIMIT = 40;

/**
 * Fetch the most-recent already-curated primary stories within the merge
 * lookback window — regardless of cluster key. The AI uses the per-story
 * fingerprint (or title fallback for legacy rows) to spot follow-up updates
 * and merge them into the existing card.
 *
 * Filter happens AI-side rather than SQL-side because cross-game industry
 * stories ("EA layoffs", "Epic acquires Y") don't share a regex cluster key
 * with the new article that updates them.
 */
async function fetchRecentPrimaries(): Promise<ExistingPrimary[]> {
  const rows = await db.query<{
    external_id: string;
    ai_title: string | null;
    title: string;
    ai_subtitle: string | null;
    ai_summary: string | null;
    ai_sources: string[] | null;
    ai_story_fingerprint: string | null;
    published_at: string;
  }>(
    `
      SELECT external_id, ai_title, title, ai_subtitle, ai_summary, ai_sources,
             ai_story_fingerprint, published_at
        FROM general_news
       WHERE ai_curated_at IS NOT NULL
         AND ai_relevance_score IS NOT NULL
         AND ai_relevance_score > 0
         AND ai_summary IS NOT NULL
         AND ai_validation_failed = FALSE
         AND published_at > NOW() - INTERVAL '${MERGE_LOOKBACK_WINDOW}'
       ORDER BY published_at DESC
       LIMIT $1
    `,
    [MERGE_CANDIDATE_LIMIT]
  );

  return rows.rows.map((r) => ({
    externalId: r.external_id,
    title: r.ai_title ?? r.title,
    subtitle: r.ai_subtitle,
    summaryPreview: (r.ai_summary ?? "").slice(0, 280),
    publishedAt: new Date(r.published_at).toISOString(),
    sources: Array.isArray(r.ai_sources) ? r.ai_sources : [],
    fingerprint: r.ai_story_fingerprint
  }));
}

// Cheap AI pre-clustering pass. Assigns a storyFingerprint to every uncurated
// article BEFORE batching, so siblings about the same news cycle land in the
// same batch even when the title-regex heuristic would produce divergent keys
// (e.g. "ARC Raiders Shifts to Six-Month Cadence" vs "Arc Raiders Is Dropping
// Monthly Updates" — both must end up as `arc-raiders:cadence-shift-2026`).
// Fingerprints are persisted to DB so they survive a curation crash or a
// follow-up re-curate.
async function assignStoryFingerprints(
  rows: RawGeneral[]
): Promise<Map<string, string>> {
  if (rows.length === 0) return new Map();
  // Cost guard: if the pool fits in a single batch, the main curation prompt
  // already handles in-batch siblings — pre-clustering adds an AI call with no
  // batching benefit. Skip and let the main pass handle dedup. (Cross-pass
  // fingerprint matching still works via DB-persisted prints from earlier
  // batches in the same run.)
  if (rows.length <= curationBatchSize()) return new Map();

  const ai = getAIProvider();
  const payload = rows.map((r) => ({ id: r.external_id, title: r.title }));

  const systemPrompt = `You assign a normalized story fingerprint to gaming news articles for downstream clustering.

For every article, emit a \`storyFingerprint\` in lowercase kebab-case format: \`<entity>:<event-topic>\`.

**Construction rules:**
- \`<entity>\` is the canonical short name of the central game, studio, publisher, platform, or person — lowercase, hyphens for spaces, no version numbers in the name itself: \`poe2\`, \`arc-raiders\`, \`elden-ring\`, \`ea\`, \`bungie\`, \`epic\`, \`nintendo-switch-2\`. Strip "the", articles, and outlet noise.
- \`<event-topic>\` is the short canonical handle for the news cycle: \`1-0-launch\`, \`cadence-shift-2026\`, \`layoffs-2026q1\`, \`acquisition-by-microsoft\`, \`season-12-patch\`, \`review-bombing\`. Use stable nouns. Same news cycle = same handle across outlets.
- Two articles about the SAME underlying event MUST produce the SAME fingerprint, even with different headlines, outlets, dates, or angles. Treat follow-up updates, restatements, additional sources, and refined versions as the same fingerprint.

**Examples (these are siblings — same fingerprint):**
- "ARC Raiders Shifts to Twice-Yearly Major Updates" → \`arc-raiders:cadence-shift-2026\`
- "Arc Raiders Is Dropping Monthly Updates in Favor of Longer Development Cycles" → \`arc-raiders:cadence-shift-2026\`
- "ARC Raiders Shifts to Six-Month Update Cadence" → \`arc-raiders:cadence-shift-2026\`
- "Path of Exile 2's Final Early Access Update Targets End-of-Year 1.0 Launch" → \`poe2:1-0-launch\`
- "Path of Exile 2 Director Confirms 1.0 Launch Won't Dodge Other Releases" → \`poe2:1-0-launch\`
- "Path of Exile 2 Is Streamlining Its Campaign" → \`poe2:1-0-launch\` (same launch news cycle even though aspect differs)

**Distinct events (different fingerprints):**
- "Embracer Lays Off 30%" → \`embracer:layoffs-2026\`
- "Former Embracer Devs Found New Studio" → \`embracer:ex-devs-new-studio\`

Return ONLY a JSON array, one object per input article, in the same order:

[
  { "id": "<exact input id>", "storyFingerprint": "<entity:event-topic>" }
]

No markdown fences. No commentary.`;

  const userContent = `## Articles\n\n${JSON.stringify(payload, null, 2)}\n\nReturn the JSON array.`;

  // Each item emits ~120 chars of JSON (~30 tokens). Scale max tokens to fit
  // the full batch with overhead, capped to avoid silly costs on huge pools.
  const maxTokens = Math.min(16384, Math.max(2048, rows.length * 60));

  let result;
  try {
    result = await ai.complete(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      { maxTokens, temperature: 0 }
    );
  } catch (err) {
    if (err instanceof AIDisabledError || err instanceof AINotConfiguredError) {
      return new Map();
    }
    console.warn("[generalNews] pre-cluster AI call failed:", err);
    return new Map();
  }

  let parsed: Array<{ id: string; storyFingerprint: string }>;
  try {
    parsed = parseAiJsonArray(result.text.trim()) as Array<{ id: string; storyFingerprint: string }>;
  } catch (err) {
    console.warn("[generalNews] pre-cluster JSON parse failed:", err);
    return new Map();
  }
  if (!Array.isArray(parsed)) return new Map();

  const map = new Map<string, string>();
  const byExt = new Map(rows.map((r) => [r.external_id, r]));
  for (const entry of parsed) {
    if (!entry || typeof entry.id !== "string") continue;
    const fp = (entry.storyFingerprint ?? "").trim().toLowerCase();
    if (!fp || !/^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/.test(fp)) continue;
    const row = byExt.get(entry.id);
    if (!row) continue;
    map.set(entry.id, fp);
  }

  // Persist fingerprints to DB so they outlast a curation crash and so
  // future re-curate passes start from a known cluster signal.
  if (map.size > 0) {
    const ids: number[] = [];
    const fps: string[] = [];
    for (const r of rows) {
      const fp = map.get(r.external_id);
      if (fp) {
        ids.push(r.id);
        fps.push(fp);
      }
    }
    await db.query(
      `UPDATE general_news AS gn
          SET ai_story_fingerprint = u.fp
         FROM (SELECT UNNEST($1::int[]) AS id, UNNEST($2::text[]) AS fp) AS u
        WHERE gn.id = u.id`,
      [ids, fps]
    );
  }

  const distinctFps = new Set(map.values()).size;
  console.log(
    `[generalNews] pre-clustered ${map.size}/${rows.length} articles into ${distinctFps} cluster(s)`
  );
  return map;
}

// Group rows by cluster key then pack into batches of <= batchSize, keeping
// each cluster intact when possible. Big clusters (>= batchSize) get their own
// batch(es); small clusters share. Sibling articles thus always land together,
// giving the AI the chance to merge them.
function groupAndPack(
  rows: RawGeneral[],
  batchSize: number,
  fingerprintMap?: Map<string, string>
): RawGeneral[][] {
  const groups = new Map<string, RawGeneral[]>();
  for (const r of rows) {
    const fp = fingerprintMap?.get(r.external_id);
    const key = fp ?? extractClusterKey(r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const sortedGroups = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
  const batches: RawGeneral[][] = [];
  let current: RawGeneral[] = [];
  for (const [, members] of sortedGroups) {
    if (members.length >= batchSize) {
      if (current.length > 0) {
        batches.push(current);
        current = [];
      }
      for (let i = 0; i < members.length; i += batchSize) {
        batches.push(members.slice(i, i + batchSize));
      }
      continue;
    }
    if (current.length + members.length > batchSize) {
      batches.push(current);
      current = [];
    }
    current.push(...members);
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

// ── Provider Dispatch ─────────────────────────────────────────────────────────
// Every enabled news_source_registry row is dispatched to its NewsProvider.
// Per-source status (last_fetched_at, last_error) is persisted so the admin UI
// can surface dead/misconfigured sources.

async function markSourceFetched(id: string, itemCount: number): Promise<void> {
  await recordSourceFetchSuccess(id, itemCount);
}

async function markSourceError(id: string, error: string): Promise<void> {
  await recordSourceFetchError(id, error);
}

async function fetchFromRegistry(crewTags: string[], gameNames: string[]): Promise<FeedItem[]> {
  const sources = await db.query<NewsSourceRow>(
    `SELECT id::text, kind, slug, name, identifier, enabled, is_preset, config,
            last_fetched_at, last_error
       FROM news_source_registry
      WHERE enabled = TRUE
      ORDER BY kind, name`
  );

  const fetches = sources.rows.map(async (s) => {
    const provider = PROVIDERS[s.kind];
    if (!provider) {
      console.warn(`[generalNews] no provider registered for kind=${s.kind} (slug=${s.slug})`);
      return [];
    }
    const block = provider.readinessGate();
    if (block) {
      await markSourceError(s.id, block);
      console.log(`[generalNews] skipped ${s.kind}/${s.slug}: ${block}`);
      return [];
    }
    try {
      const items = await provider.fetch(s, { crewTags, gameNames });
      await markSourceFetched(s.id, items.length);
      console.log(`[generalNews] fetched ${items.length} from ${s.kind}/${s.slug}`);
      return items;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await markSourceError(s.id, msg);
      console.warn(`[generalNews] fetch failed for ${s.kind}/${s.slug}: ${msg}`);
      return [];
    }
  });

  const results = await Promise.all(fetches);
  return results.flat();
}

// ── DB Upsert ─────────────────────────────────────────────────────────────────

async function upsertGeneralNews(items: FeedItem[]): Promise<number[]> {
  if (items.length === 0) return [];

  const insertedIds: number[] = [];
  const ingestCutoffMs = Date.now() - getIngestMaxAgeDays() * 24 * 60 * 60 * 1000;
  let skippedStale = 0;

  for (const item of items) {
    if (item.publishedAt.getTime() < ingestCutoffMs) {
      skippedStale++;
      continue;
    }
    try {
      const result = await db.query<{ id: number }>(
        `
          INSERT INTO general_news
            (source_type, source_name, external_id, title, url, contents, author,
             image_url, published_at, matched_tags)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT (source_type, external_id) DO NOTHING
          RETURNING id
        `,
        [
          item.sourceType,
          item.sourceName,
          item.externalId,
          item.title,
          item.url,
          item.contents,
          item.author,
          item.imageUrl,
          item.publishedAt.toISOString(),
          item.matchedTags
        ]
      );
      if (result.rows[0]) {
        insertedIds.push(result.rows[0].id);
      }
    } catch (err) {
      console.error("[generalNews] upsert failed for", item.externalId, err);
    }
  }

  if (skippedStale > 0) {
    console.log(
      `[generalNews] skipped ${skippedStale} feed item(s) older than ${getIngestMaxAgeDays()} days (ingest age gate)`
    );
  }

  return insertedIds;
}

/**
 * For freshly-inserted rows with no feed image, scrape the article's og:image
 * (or twitter:image) so the Hero/Cards have a large cover to show. Scrape-once:
 * sets image_resolved_at even on failure so a dead page isn't re-hit every run.
 * Best-effort and fail-open — never blocks ingestion.
 */
async function resolveMissingImages(newIds: number[]): Promise<{ scanned: number; resolved: number }> {
  if (newIds.length === 0) return { scanned: 0, resolved: 0 };
  const rows = await db.query<{ id: number; url: string }>(
    `SELECT id, url FROM general_news
      WHERE id = ANY($1::int[])
        AND image_url IS NULL
        AND image_resolved_at IS NULL`,
    [newIds]
  );
  if (rows.rows.length === 0) return { scanned: 0, resolved: 0 };

  let resolved = 0;
  for (const row of rows.rows) {
    let img: Awaited<ReturnType<typeof resolveHeroImage>> = null;
    try {
      img = await resolveHeroImage(row.url);
    } catch {
      img = null;
    }
    await db.query(
      `UPDATE general_news
          SET image_url = $1, image_source = $2, image_width = $3,
              image_height = $4, image_resolved_at = NOW()
        WHERE id = $5`,
      [img?.url ?? null, img?.source ?? "none", img?.width ?? null, img?.height ?? null, row.id]
    );
    if (img?.url) resolved++;
  }
  console.log(
    `[generalNews] og:image scrape — resolved ${resolved}/${rows.rows.length} imageless row(s)`
  );
  return { scanned: rows.rows.length, resolved };
}

/**
 * One-time backfill of cover images for already-ingested rows that never got an
 * og:image scrape (the ingest hook only touches freshly-inserted rows). Bounded
 * per call so the admin endpoint stays responsive; poll until remaining hits 0.
 */
export async function backfillMissingImages(
  maxRows = 50
): Promise<{ scanned: number; resolved: number; remaining: number }> {
  const candidates = await db.query<{ id: number }>(
    `SELECT id FROM general_news
      WHERE image_url IS NULL AND image_resolved_at IS NULL
      ORDER BY published_at DESC
      LIMIT $1`,
    [maxRows]
  );
  const { scanned, resolved } = await resolveMissingImages(candidates.rows.map((r) => r.id));
  const rem = await db.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM general_news
      WHERE image_url IS NULL AND image_resolved_at IS NULL`
  );
  return { scanned, resolved, remaining: parseInt(rem.rows[0]?.c ?? "0", 10) };
}

/**
 * For each freshly-inserted row: embed it, then check whether an existing
 * curated primary already covers the same story via cosine similarity. If
 * yes, absorb (fold URL into primary's sources, mark sibling) — that row
 * never reaches the LLM curator, saving the largest cost item. Returns the
 * subset of input IDs that were NOT absorbed and still need curation.
 */
async function embedAndCluster(newIds: number[]): Promise<{ embedded: number; absorbed: number }> {
  if (newIds.length === 0) return { embedded: 0, absorbed: 0 };
  if (!(await isEmbeddingColumnAvailable())) return { embedded: 0, absorbed: 0 };

  const rows = await db.query<{
    id: number;
    title: string;
    url: string;
    contents: string | null;
  }>(
    `SELECT id, title, url, contents
       FROM general_news
      WHERE id = ANY($1::int[]) AND embedding IS NULL`,
    [newIds]
  );

  let absorbed = 0;
  let embedded = 0;
  const remaining: number[] = [];
  for (const row of rows.rows) {
    const text = `${row.title}\n\n${(row.contents ?? "").slice(0, 1500)}`;
    const vec = await embedText(text);
    if (!vec) {
      remaining.push(row.id);
      continue;
    }
    await setEmbedding(row.id, vec);
    embedded++;

    const similar = await findSimilarPrimary(vec, row.id);
    if (similar) {
      await absorbAsSibling(row.id, row.url, similar);
      absorbed++;
      console.log(
        `[generalNews] embed-absorbed row=${row.id} into parent=${similar.external_id} (sim=${similar.similarity.toFixed(3)})`
      );
      continue;
    }
    remaining.push(row.id);
  }

  if (absorbed > 0 || embedded > 0) {
    console.log(
      `[generalNews] embed-cluster: ${embedded} embedded, ${absorbed} absorbed as siblings, ${remaining.length} sent to curator`
    );
  }
  return { embedded, absorbed };
}

// ── AI Curation for General News ─────────────────────────────────────────────

type RawGeneral = {
  id: number;
  external_id: string;
  title: string;
  url: string;
  contents: string | null;
  source_name: string;
  matched_tags: string[];
  ai_retry_count?: number;
};

async function buildCrewContext(): Promise<string> {
  const [recent, topOwned, tagFeedback, crewEntities] = await Promise.all([
    db.query<{ game_name: string; playtime_2weeks: number }>(
      `SELECT g.name AS game_name, SUM(ug.playtime_2weeks)::int AS playtime_2weeks
       FROM shareable_user_games ug
       INNER JOIN games g ON g.app_id = ug.app_id
       WHERE ug.playtime_2weeks > 0
       GROUP BY g.name
       ORDER BY playtime_2weeks DESC
       LIMIT 8`
    ),
    db.query<{ game_name: string; owners: number; tags: string[] }>(
      `SELECT g.name AS game_name, COUNT(DISTINCT ug.user_id)::int AS owners, g.tags
       FROM shareable_user_games ug
       INNER JOIN games g ON g.app_id = ug.app_id
       GROUP BY g.name, g.tags
       ORDER BY owners DESC
       LIMIT 12`
    ),
    db.query<{ tag: string; net_score: number }>(
      `SELECT UNNEST(gn.ai_tags) AS tag,
              SUM(CASE WHEN gnf.rating = 1 THEN 1.0 ELSE -0.5 END) AS net_score
       FROM general_news_feedback gnf
       JOIN general_news gn ON gn.id = gnf.news_id
       WHERE gnf.created_at > NOW() - INTERVAL '30 days'
         AND array_length(gn.ai_tags, 1) > 0
       GROUP BY tag
       HAVING ABS(SUM(CASE WHEN gnf.rating = 1 THEN 1.0 ELSE -0.5 END)) >= 0.5
       ORDER BY net_score DESC`
    ),
    db.query<{ name: string; developers: string[] }>(
      `SELECT g.name, g.developers
       FROM shareable_user_games ug
       INNER JOIN games g ON g.app_id = ug.app_id
       GROUP BY g.name, g.developers
       ORDER BY COUNT(DISTINCT ug.user_id) DESC, SUM(ug.playtime_minutes) DESC
       LIMIT 20`
    )
  ]);

  const recentStr = recent.rows
    .map((r) => `${r.game_name}(${Math.round((r.playtime_2weeks / 60) * 10) / 10}h)`)
    .join(", ");

  const ownedStr = topOwned.rows.map((r) => `${r.game_name}(${r.owners} owners)`).join(", ");

  const tagFreq: Record<string, number> = {};
  for (const row of topOwned.rows) {
    for (const tag of row.tags ?? []) {
      tagFreq[tag] = (tagFreq[tag] ?? 0) + row.owners;
    }
  }
  const topTagsStr = Object.entries(tagFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([t]) => t)
    .join(", ");

  const likedTags = tagFeedback.rows.filter((r) => r.net_score > 0).map((r) => r.tag).slice(0, 8);
  const dislikedTags = tagFeedback.rows.filter((r) => r.net_score < 0).map((r) => r.tag).slice(0, 5);

  const gameNames = crewEntities.rows.map((r) => r.name).join(", ");
  const studioNames = [...new Set(crewEntities.rows.flatMap((r) => r.developers ?? []))]
    .slice(0, 15)
    .join(", ");

  return [
    `Playing this week: ${recentStr || "none"}`,
    `Top owned games: ${ownedStr || "none"}`,
    `Crew genre tags: ${topTagsStr || "none"}`,
    likedTags.length > 0 ? `Crew has upvoted articles about: ${likedTags.join(", ")}` : "",
    dislikedTags.length > 0 ? `Crew has downvoted articles about: ${dislikedTags.join(", ")}` : "",
    "",
    `Crew Pick tags (use as Crew Pick tag when article is directly about them):`,
    `Games: ${gameNames || "none"}`,
    `Studios: ${studioNames || "none"}`
  ]
    .filter((line) => line !== "")
    .join("\n");
}

// Locate the first balanced top-level JSON array in `text`. Tolerates any
// leading prose ("## Existing Stories\n\n[...]"), trailing fence, or extra
// commentary the model may emit when it strays from "return ONLY a JSON array".
// Returns the substring including the outer brackets, or the original text
// when no array can be located (parse will error and the caller can decide).
function extractJsonArray(text: string): string {
  const start = text.indexOf("[");
  if (start < 0) return text;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (inString) {
      if (ch === "\\") { escaped = true; continue; }
      if (ch === "\"") { inString = false; }
      continue;
    }
    if (ch === "\"") { inString = true; continue; }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text; // no balanced close — return as-is so parser surfaces the issue
}

// Parse AI JSON output, tolerating control characters that Anthropic sometimes
// emits inside string literals. First tries strict JSON.parse; if that fails,
// walks the text, escaping control chars inside string literals (`"..."`) only.
function parseAiJsonArray(text: string): unknown {
  const candidate = extractJsonArray(text);
  try {
    return JSON.parse(candidate);
  } catch {
    // Fallback: rebuild a sanitized copy
    let out = "";
    let inString = false;
    let escaped = false;
    for (let i = 0; i < candidate.length; i++) {
      const code = candidate.charCodeAt(i);
      const ch = candidate[i];
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (inString && ch === "\\") {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === "\"") {
        inString = !inString;
        out += ch;
        continue;
      }
      if (inString && code < 0x20) {
        if (code === 0x0a) out += "\\n";
        else if (code === 0x0d) out += "\\r";
        else if (code === 0x09) out += "\\t";
        // drop other control chars silently
        continue;
      }
      out += ch;
    }
    return JSON.parse(out);
  }
}

async function curateBatchOnce(
  items: RawGeneral[],
  crewContext: string,
  existingPrimaries: ExistingPrimary[] = [],
  retryReminder?: string
): Promise<GeneralCurationResult[]> {
  const ai = getAIProvider();

  const payload = items.map((it, batchIndex) => ({
    batchIndex,
    id: it.external_id,
    source: it.source_name,
    url: it.url,
    cluster: extractClusterKey(it),
    title: it.title,
    excerpt: it.contents ? it.contents.slice(0, 800) + (it.contents.length > 800 ? "…" : "") : ""
  }));

  const existingPayload = existingPrimaries.map((p) => ({
    existingId: p.externalId,
    fingerprint: p.fingerprint,
    title: p.title,
    subtitle: p.subtitle,
    publishedAt: p.publishedAt,
    sources: p.sources,
    summaryPreview: p.summaryPreview
  }));

  const systemPrompt = `# Role

You are a gaming news editor curating stories for the Boneless Island Discord community. For each news item provided (title + snippet, plus the source URL), you produce a structured four-section article output every time.

Your job is to surface what matters to this specific community — the games they play together, updates affecting those games, and industry news that shapes their experience. The Crew context below describes the games Boneless Island members own, play frequently, have played recently, and have wishlisted (pulled from Steam account syncs). Prioritize news about those games, but include everything — tangential industry news and culturally relevant stories still get full treatment.

# Output sections (every article, every time)

## 1. Rewritten Title

Write a new headline. Do NOT copy the original title.

The rewritten title must:
- State clearly what happened.
- Surface the most important outcome or change.
- Use plain, direct language — no clickbait, no hype, no ellipsis drama.

## 2. Summary

Write a complete summary. Aim for COMPLETENESS of information, not a word count — include every unique fact, figure, quote, date, name, and distinct source angle from all clustered articles. Do not pad to fill space, and do not drop details to stay short. Hard cap: 1350 words (most stories need far fewer). Cover:
- What happened
- Who is affected (players, developers, platforms, regions)
- Why it happened (if known)
- What is changing (features, pricing, timelines, policies, releases)
- When it takes effect
- Any background context needed to understand the impact

Don't sacrifice detail for brevity. If a gamer deciding how to respond would care about it, include it. Label speculation clearly — don't present assumptions as facts.

Write so any gamer can follow it, even one who doesn't play this game. Use plain language; reach for jargon only when it adds real precision, and when you do, briefly explain it inline the first time — e.g. "a roguelite (a run-based game where you restart with small permanent upgrades)".

Use a mix of flowing prose paragraphs AND bullet points. Use bullets for concrete facts, specs, or list-shaped information (release dates, platforms, feature lists, pricing tiers, patch line items, performance numbers). Use prose for context, narrative, and synthesis. Format bullets as plain markdown — each bullet on its own line, prefixed with \`- \`. Separate prose paragraphs with a blank line. Separate a prose paragraph from an adjacent bullet block with a blank line.

You work only from the source excerpts in this batch. Synthesize across articles in the batch when multiple cover the same story. Do NOT speculate beyond what the excerpts state. If sources are thin and you can only reliably restate the headline, do exactly that — pad nothing.

## 3. Why This Matters to Boneless Island

Write 1–2 short sentences as a direct, practical explanation — not a general commentary. This section is MANDATORY for every non-duplicate article.

Always connect it to Boneless Island, even if the connection is thin or requires thought. Be specific about how this affects:
- What people play
- How they play it
- Whether they need to act or pay attention soon

Do NOT use phrases like "this is exciting," "this could be impactful," or any generic framing. Write like you're telling a friend who plays in this server, not filing a press release.

If no direct connection to the community's games exists, explain the industry impact and why Boneless Island should track it — what broader context or business shift makes it relevant to gaming or how the community operates.

If the news is breaking, frame it with urgency — signal that immediate attention matters. For evergreen analysis or updates, use standard treatment.

## 4. Sources

List 1 or more source URLs. Pull URLs ONLY from the \`url\` fields of articles in this batch — do not invent URLs.

When this article is the PRIMARY of a multi-article cluster (other articles in the batch cover the same event), include the URLs of every sibling in that cluster PLUS your own article's URL — aim for 2+ sources total. When this article stands alone in the batch, the Sources list contains just your own URL.

# Multi-source synthesis — CRITICAL

Each payload item carries a \`cluster\` value. Items sharing a cluster value are PRE-GROUPED CANDIDATES for the same story (matched on the same game or named entity). Treat them as siblings unless the content clearly covers DIFFERENT events.

Two articles are the SAME STORY when they cover the same announcement, patch, controversy, release, or event — even from different angles, different outlets, or different publication dates within a couple of weeks of each other.

**Examples that ARE duplicates (merge):**
- "PoE2 Announces Roadmap" + "PoE2 1.0 Likely End of 2026" (same announcement, different framing)
- "Studio X laid off 30%" + "Studio X reveals layoffs in financial filing" (same event, different source)
- "New CoD: Black Ops 7 Multiplayer Update Released" + "Treyarch Patches BO7 Spawn System" (same patch, different headlines)

**Examples that are NOT duplicates (keep separate):**
- "Studio X laid off 30%" + "Former Studio X devs announce new studio" (separate events, even if related)
- Initial DLC reveal + 6-month-later DLC release (different news cycles)
- Game's launch announcement + a later review of that same game (different content types)

**For each cluster:**
- Pick the richest-detail article as the PRIMARY.
- Synthesize ALL unique information from every sibling — quotes, numbers, dates, features, developer comments, follow-up reactions — into the primary's \`summary\`. The primary should be richer than any individual source article.
- Mark all OTHER siblings with \`duplicate: true\` and EMPTY \`summary\` / \`whyMatters\` / \`sources\`. They still need a \`subtitle\` and \`tags\`.
- In the primary's \`sources\` array, include the URL of EVERY sibling in the cluster PLUS the primary's own URL. Aim for 2+ URLs when the cluster has multiple articles.

For truly unique articles (cluster of size 1): summarize that single source.

# Story fingerprint — REQUIRED on every article

For every article in this batch, emit \`storyFingerprint\`: a normalized lowercase kebab-case tag combining the primary entity and the event topic. Format: \`<entity>:<event-topic>\`. The fingerprint must be deterministic — two articles about the SAME story must produce the SAME fingerprint, even if they have different headlines, source outlets, or publication dates.

**Construction rules:**
- \`<entity>\` is the canonical short name of the central game, studio, publisher, platform, or person — lowercase, hyphens for spaces, no version numbers in the name itself: \`poe2\`, \`elden-ring\`, \`ea\`, \`bungie\`, \`epic\`, \`nintendo-switch-2\`, \`larian\`. Strip "the", articles, and outlet noise.
- \`<event-topic>\` is the short canonical handle for the news cycle: \`1-0-launch\`, \`layoffs-2026q1\`, \`acquisition-by-microsoft\`, \`season-12-patch\`, \`review-bombing\`, \`engine-upgrade\`. Use stable nouns, not adjectives — same story = same handle across outlets.
- Disambiguate same-entity simultaneous stories with the event-topic. \`poe2:1-0-launch\` vs \`poe2:economy-patch\` are different stories.
- When the article is industry-wide with no single game (e.g. studio layoffs), use the studio/publisher as the entity: \`embracer:layoffs-2026\`, \`ea:earnings-q4\`.
- When no clear entity exists (rare: industry essay), fall back to topic only: \`industry:console-pricing-trend\`.

**Examples:**
- "Path of Exile 2's Final Early Access Update Targets End-of-Year 1.0 Launch" → \`poe2:1-0-launch\`
- "Path of Exile 2 Director Confirms 1.0 Launch Won't Dodge Other Releases—Except GTA 6" → \`poe2:1-0-launch\` (SAME — same launch announcement)
- "GTA 6 Trailer 2 Released" → \`gta6:trailer-2\`
- "Embracer Lays Off 30%" → \`embracer:layoffs-2026\`
- "Former Embracer Devs Found New Studio" → \`embracer:ex-devs-new-studio\` (RELATED but different cycle)

# Merging into existing curated stories — CRITICAL

The user message contains a separate \`existingStories\` array. These are already-curated cards on the site (within the last ~3 weeks). Each carries a \`fingerprint\` field — the same fingerprint format described above. Treat any existing card whose fingerprint matches a fingerprint you intend to assign as a candidate merge parent.

**Matching rule:** A new article should MERGE into an existing story when the new article's \`storyFingerprint\` equals (or is the obvious canonical equivalent of) an existing card's \`fingerprint\`. If an existing card has \`fingerprint: null\` (legacy row), fall back to comparing the existing card's \`title\` + \`summaryPreview\` against the new article — same underlying event = merge.

**Edge case — fingerprint mismatch but same story:** If you see an existing card with a slightly-different-but-clearly-equivalent fingerprint (e.g. existing has \`poe:1-0-launch\` and your new article would emit \`poe2:1-0-launch\`), prefer the existing fingerprint when merging — write your output's \`updatedStoryFingerprint\` to use the existing card's exact fingerprint so future articles converge on a single canonical handle.

**General merge decision rule (still applies):** A new article should MERGE into an existing story when both cover the same underlying event (same game / studio / announcement / patch / controversy) and the new article is a follow-up update, restatement, additional source, or refined version of the same news cycle — even if the new article adds fresh details, a release date confirmation, a developer quote, or a related angle.

**Examples that ARE merges (fold new into existing):**
- Existing: "Path of Exile 2 Roadmap Reveal" + New: "PoE2 Director Confirms 1.0 Launch Won't Dodge Other Releases" → same launch announcement, four days apart, both reference the same end-of-year 1.0 target. MERGE.
- Existing: "Studio X Layoffs Announced" + New: "Studio X Layoffs Affect 30% of Workforce" → same event, new detail. MERGE.
- Existing: "CoD BO7 Multiplayer Update Released" + New: "Treyarch BO7 Spawn Patch Notes" → same patch cycle. MERGE.

**Examples that are NOT merges (keep new separate):**
- Existing: "Layoffs at Studio X" + New: "Former Studio X Devs Found New Studio" → related but distinct event. KEEP SEPARATE.
- Existing: "Game launch announcement" + New: "Critical review of Game post-launch" → different content types and news cycle. KEEP SEPARATE.

**When merging:**
- On the NEW article's output object, set:
  - \`duplicate\`: true
  - \`mergesIntoExistingId\`: the \`existingId\` of the parent story
  - \`updatedTitle\`: refreshed headline reflecting BOTH the existing summary and the new info
  - \`updatedSubtitle\`: refreshed subheadline (10–20 words)
  - \`updatedSummary\`: fresh 3–5 paragraph synthesis (~300–500 words, prose + bullets) that integrates ALL details from the existing summary AND every new fact, quote, date, or angle introduced by the new article. The synthesis should be richer than either input alone. Lead with the most recent / most-confirmed information.
  - \`updatedWhyMatters\`: refreshed Why This Matters paragraph (1–2 sentences) reflecting the combined picture
  - \`updatedSources\`: full source list = every URL from the existing story PLUS the new article's URL
  - \`updatedStoryFingerprint\`: the canonical fingerprint to lock the parent card to (typically the existing fingerprint when present, or your new canonical fingerprint when the existing card had \`null\`)
- Leave the standard \`title\` / \`summary\` / \`whyMatters\` / \`sources\` fields as empty strings / empty array (this card will not be emitted).
- All other batch fields (\`subtitle\`, \`tags\`, \`label\`, \`relevanceScore\`, \`spoilerWarning\`, \`gameTitle\`) should still be populated as normal — they help the duplicate-marker logic downstream.
- If two NEW articles in the batch both merge into the same existing parent, both produce merge-output but ONE of them should be the primary merger (its \`updatedSummary\` is the canonical refresh). Pick the richer-detail one; the other gets \`duplicate: true\` with NO merge fields and points its standard fields at empty values (sibling duplicate, not a merger).

**When the article is novel (no existing parent fits):** leave \`mergesIntoExistingId\` as \`null\` and all \`updatedX\` fields absent. Process normally per the rules above.

# Labels

- \`top_news\`: Breaking / high-impact industry news regardless of crew relevance (studio closures, major releases, acquisitions, major controversies)
- \`community\`: Trending gaming news that matches crew genre interests but not specific games they own
- \`personal\`: Directly about games or series the crew actively plays

# Factual accuracy — HIGHEST PRIORITY

Every claim in your summary must be **directly supported by the source excerpts in this batch**. Do not infer, generalize, or fill in plausible-sounding details from prior knowledge of the game, studio, or industry.

**Hard rules:**
- If the sources don't specify a business model (free-to-play, subscription, premium, B2P), DO NOT state one. Many shooters/MMOs default to assumed F2P/live-service in LLM training data — this is a common hallucination trap.
- If the sources don't name a genre, platform, release date, or price, omit it rather than guess.
- If the sources disagree, report the disagreement ("PC Gamer reports X; IGN reports Y") rather than picking one.
- Numbers, quotes, dates, percentages must appear verbatim in at least one source excerpt. If you can't find the supporting text, drop the figure.
- When a fact is widely-known but absent from the sources (e.g. publisher name), prefer to omit. Better to be brief than wrong.
- If the sources are thin and you can only reliably restate the headline, do exactly that — don't pad with assumptions.

**Common stereotype traps to avoid:**
- Modern shooter ≠ free-to-play live-service unless source says so. Marathon, Concord, XDefiant, etc. each have specific models — don't conflate.
- "Studio acquired by [publisher]" ≠ "publisher exclusive" unless source confirms.
- "Sequel" ≠ same genre/mechanics as predecessor.
- Live-service decline ≠ studio failure, and vice versa.

**Self-check before emitting each summary:** for every concrete claim (genre, business model, dates, numbers, exclusivity, platform), confirm it appears in the source excerpts you were given. If not, remove it.

# Multi-source synthesis — CRITICAL

This batch deliberately includes articles from multiple outlets. Your primary job is cross-source synthesis, not single-article summarization.

**Step 1 — Identify story clusters:** Scan all articles and group them by story (same game, announcement, or event). A story may be covered by 2–6 different outlets in this batch.

**Step 2 — For each story cluster:**
- Pick the best-sourced article as the primary (most detail, most authoritative outlet)
- Mark all others as \`duplicate: true\` with a populated \`subtitle\` but empty \`summary\`
- For the PRIMARY: read every article in the cluster and synthesize ALL unique information — quotes, numbers, dates, features, developer comments, reactions — into a single comprehensive write-up that is richer than any individual source

**Step 3 — For truly unique articles** (no related articles in this batch): summarize that single source. A single-source summary is acceptable only when no other article in the batch covers the same story.

# Summary guidelines

The summary must contain ONLY information about the article itself — facts, details, and context drawn directly from the source excerpts. Do NOT reference community interest, crew relevance, or player perspective in the summary; that belongs exclusively in \`whyMatters\`.

Write a cross-source synthesis covering:
1. **What happened** — the core news fact, announcement, or event
2. **Context** — why it matters in industry / studio / game-history terms (no crew framing)
3. **Details** — specific numbers, dates, features, changes, or quotes drawn from EVERY source covering this story
4. **What's next** — expected follow-up, release date, or open questions surfaced by the sources

**Length and format:**
- Length follows completeness, not a target — include all unique information from every source and never pad. Hard cap 1350 words.
- Use a mix of flowing prose paragraphs AND bullet points. Use bullets specifically for concrete facts, specs, or list-shaped information (e.g. release dates, platforms, feature lists, pricing tiers, patch line items, performance numbers). Use prose for context, narrative, and synthesis.
- Format bullets as plain markdown — each bullet on its own line, prefixed with \`- \`. Separate prose paragraphs with a blank line. Separate a prose paragraph from an adjacent bullet block with a blank line.
- Direct, conversational gamer tone — informative but not dry.
- Don't start with "This article" or restate the title.
- Set to empty string \`""\` for duplicates.

# Tag taxonomy

BEFORE generating output, determine the correct tags for each article using ONLY these categories. Never use outlet or publication names — they are never tags.

**Content Type** (always exactly 1 — pick the best fit):
News · Patch Notes · Announcement · Review · Preview · Opinion · Interview · Feature · Rumor

**Genre** (0–1, the game's primary genre; omit if article is industry/hardware/esports news with no dominant genre):
FPS · RPG · Strategy · Horror · Platformer · Survival · Battle Royale · MOBA · Racing · Puzzle · Fighting · Sim · MMO

**Platform** (0–2, only when article is specifically about or exclusive to a platform):
PC · PlayStation · Xbox · Nintendo · Mobile · VR

**Crew Pick** (0–1, only when article is directly about a specific game or studio from crew context):
Use exact game and studio names from the "Crew Pick tags" section of the crew context.

NEVER use: PC Gamer, Kotaku, IGN, Rock Paper Shotgun, Eurogamer, Polygon, VG247, PCGamesN, The Verge, GamesRadar, or any other outlet name as a tag.

Examples:
- Studio closure article (no specific game): ["News"]
- Hades 2 patch from PC Gamer: ["Patch Notes", "RPG", "PC"]
- Marathon reveal trailer: ["Announcement", "FPS"]
- Nintendo Direct recap: ["Announcement", "Nintendo"]

# Output format

Return a JSON array — one object per input article, in the same order. Every field is required (use empty string / empty array for duplicates as noted).

[
  {
    "id": "<string — must match input id exactly>",
    "title": "<rewritten headline, plain direct language, no clickbait>",
    "summary": "<3–5 paragraphs, ~300–500 words, prose + bullets, article-only facts; empty string for duplicates or mergers>",
    "whyMatters": "<1–2 sentences, concrete crew connection, never generic; empty string for duplicates or mergers>",
    "sources": ["<url1 from batch>", "<url2 from batch>"],
    "subtitle": "<one sharp subheadline sentence, 10–20 words; always include>",
    "tags": ["News", "RPG"],
    "gameTitle": "<primary game title e.g. 'Elden Ring'; null if no single game focus>",
    "label": "<top_news | community | personal>",
    "relevanceScore": <number 0.0–1.0>,
    "spoilerWarning": <true | false>,
    "duplicate": <true | false>,
    "storyFingerprint": "<entity:event-topic — REQUIRED on every article>",
    "mergesIntoExistingId": "<existingId of parent story, or null>",
    "updatedTitle": "<refreshed headline for the parent; only when mergesIntoExistingId is set>",
    "updatedSubtitle": "<refreshed subheadline for the parent; only when merging>",
    "updatedSummary": "<refreshed 3–5 paragraph synthesis; only when merging>",
    "updatedWhyMatters": "<refreshed why-matters; only when merging>",
    "updatedSources": ["<all existing source URLs>", "<this article's URL>"],
    "updatedStoryFingerprint": "<canonical fingerprint to lock the parent card; only when merging>"
  }
]

Relevance: 0.75–1.0 = major impact / crew relevance; 0.4–0.74 = notable; 0–0.39 = low signal.

Tone & style — write like a knowledgeable human editor, not a content aggregator. No marketing language. No "as an AI" phrasing. No filler. Skip formal transitions (moreover, furthermore, in conclusion); use natural conversational tone. Minimize hedge words (essentially, basically, actually) and buzzwords (delve, unpack, embark, innovative, vibrant). Verify facts against source excerpts only; never present assumptions as facts.

Return ONLY the JSON array. No markdown fences, no preamble.`;

  const existingBlock =
    existingPayload.length > 0
      ? `\n\nexistingStories (already-curated parent cards — candidate merge targets):\n${JSON.stringify(existingPayload, null, 2)}`
      : "";

  const userContent =
    `Crew context:\n${crewContext}\n\nArticles to curate:\n${JSON.stringify(payload, null, 2)}` +
    existingBlock +
    (retryReminder ? `\n\nRetry directive: ${retryReminder}` : "") +
    `\n\nReturn ONLY a JSON array as specified in the system instructions. No markdown headers. No commentary. The response must start with [ and end with ].`;

  const maxTokens = curationMaxTokens(items.length);
  const result = await ai.complete(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    { maxTokens, temperature: 0.2 }
  );

  const raw = result.text.trim();
  if (!raw) {
    console.warn(
      `[generalNews] curation AI returned empty text (batch=${items.length}, maxTokens=${maxTokens}, provider=${getAISetting("ai_provider")})`
    );
    return [];
  }
  const jsonText = raw.startsWith("```")
    ? raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
    : raw;
  let parsedRaw: unknown;
  try {
    parsedRaw = parseAiJsonArray(jsonText);
  } catch (err) {
    console.warn(
      `[generalNews] curation JSON parse failed (batch=${items.length}, rawLen=${raw.length}):`,
      err instanceof Error ? err.message : err
    );
    throw err;
  }
  if (!Array.isArray(parsedRaw)) throw new Error("AI returned non-array response");
  const parsed = parsedRaw.map(normalizeCurationEntry);
  if (parsed.length !== items.length) {
    console.warn(
      `[generalNews] curation array length mismatch: expected ${items.length}, got ${parsed.length} (rawLen=${raw.length})`
    );
  }
  const sample = parsed.slice(0, 3).map((r) => ({
    id: r.id?.slice(-30),
    tags: r.tags,
    dup: r.duplicate,
    hasTitle: Boolean(r.title?.trim()),
    hasWhy: Boolean(r.whyMatters?.trim())
  }));
  console.log("[generalNews] AI tag sample:", JSON.stringify(sample));
  return parsed;
}

function asBool(v: unknown): boolean {
  return v === true || v === "true";
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** Normalize Bedrock/Claude field-name drift (snake_case, whyRecommended, etc.). */
function normalizeCurationEntry(raw: unknown): GeneralCurationResult {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sourcesRaw = obj.sources ?? obj.source_urls ?? obj.sourceUrls;
  const sources = Array.isArray(sourcesRaw)
    ? sourcesRaw.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    : typeof sourcesRaw === "string" && sourcesRaw.trim()
      ? [sourcesRaw.trim()]
      : [];

  const labelRaw = pickString(obj, "label");
  const label = (["top_news", "community", "personal"].includes(labelRaw)
    ? labelRaw
    : "community") as GeneralCurationResult["label"];

  return {
    id: pickString(obj, "id", "external_id", "externalId", "url"),
    relevanceScore: Number(obj.relevanceScore ?? obj.relevance_score ?? 0) || 0,
    label,
    spoilerWarning: asBool(obj.spoilerWarning ?? obj.spoiler_warning),
    title: pickString(obj, "title", "ai_title", "aiTitle"),
    summary: pickString(obj, "summary", "ai_summary", "aiSummary"),
    whyMatters: pickString(
      obj,
      "whyMatters",
      "whyRecommended",
      "why_recommended",
      "why_matters",
      "ai_why_recommended"
    ),
    sources,
    subtitle: pickString(obj, "subtitle", "ai_subtitle", "aiSubtitle"),
    tags: Array.isArray(obj.tags) ? obj.tags.filter((t): t is string => typeof t === "string") : [],
    gameTitle: pickString(obj, "gameTitle", "game_title") || null,
    duplicate: asBool(obj.duplicate),
    storyFingerprint: pickString(obj, "storyFingerprint", "story_fingerprint") || undefined,
    mergesIntoExistingId:
      pickString(obj, "mergesIntoExistingId", "merges_into_existing_id") || null,
    updatedTitle: pickString(obj, "updatedTitle", "updated_title") || undefined,
    updatedSubtitle: pickString(obj, "updatedSubtitle", "updated_subtitle") || undefined,
    updatedSummary: pickString(obj, "updatedSummary", "updated_summary") || undefined,
    updatedWhyMatters: pickString(
      obj,
      "updatedWhyMatters",
      "updated_why_matters",
      "updatedWhyRecommended",
      "updated_why_recommended"
    ) || undefined,
    updatedSources: Array.isArray(obj.updatedSources ?? obj.updated_sources)
      ? ((obj.updatedSources ?? obj.updated_sources) as unknown[]).filter(
          (u): u is string => typeof u === "string"
        )
      : undefined,
    updatedStoryFingerprint:
      pickString(obj, "updatedStoryFingerprint", "updated_story_fingerprint") || undefined
  };
}

function ensurePrimarySources(
  result: GeneralCurationResult,
  item: RawGeneral
): GeneralCurationResult {
  if (result.duplicate || isMerge(result)) return result;
  if (Array.isArray(result.sources) && result.sources.length > 0) return result;
  return { ...result, sources: [item.url] };
}

function isMerge(res: GeneralCurationResult): boolean {
  return typeof res.mergesIntoExistingId === "string" && res.mergesIntoExistingId.length > 0;
}

function normalizeArticleId(id: string): string {
  try {
    return decodeURIComponent(id.trim()).replace(/\/$/, "").toLowerCase();
  } catch {
    return id.trim().replace(/\/$/, "").toLowerCase();
  }
}

function resultHasPayload(r: GeneralCurationResult | undefined): boolean {
  if (!r) return false;
  return Boolean(
    r.duplicate ||
    isMerge(r) ||
    (r.title && r.title.trim().length > 0) ||
    (r.summary && r.summary.trim().length > 0)
  );
}

/** Map AI batch output back to input rows. Bedrock/Claude often drifts on long URL ids. */
function resolveCurationResultForItem(
  item: RawGeneral,
  parsed: GeneralCurationResult[],
  index: number
): { result: GeneralCurationResult; match: string } {
  const targetNorm = normalizeArticleId(item.external_id);

  const exact = parsed.find((r) => r.id === item.external_id);
  if (exact) return { result: exact, match: "exact" };

  const byNorm = parsed.find((r) => r.id && normalizeArticleId(r.id) === targetNorm);
  if (byNorm) return { result: { ...byNorm, id: item.external_id }, match: "normalized" };

  if (index < parsed.length) {
    const entry = parsed[index];
    if (resultHasPayload(entry) || entry.duplicate || isMerge(entry)) {
      return { result: { ...entry, id: item.external_id }, match: "ordered" };
    }
  }

  const byPartial = parsed.find(
    (r) =>
      r.id &&
      (item.external_id.includes(r.id) ||
        r.id.includes(item.external_id) ||
        item.url.includes(r.id) ||
        r.id.includes(item.url))
  );
  if (byPartial) return { result: { ...byPartial, id: item.external_id }, match: "partial" };

  return { result: {} as GeneralCurationResult, match: "none" };
}

function validateCuration(res: GeneralCurationResult, batchUrls: Set<string>): ValidationError[] {
  if (res.duplicate || isMerge(res)) return [];
  const errors: ValidationError[] = [];
  if (!res.title || res.title.trim().length < 8) errors.push("missing_title");
  if (!res.summary || res.summary.trim().length < 150) {
    errors.push("summary_too_short");
  } else if (res.summary.trim().split(/\s+/).length > 1350) {
    errors.push("summary_too_long");
  }
  if (!res.whyMatters || res.whyMatters.trim().length < 20) errors.push("missing_why_matters");
  if (!Array.isArray(res.sources) || res.sources.length === 0) {
    errors.push("missing_sources");
  } else {
    const allValid = res.sources.every(
      (u) => typeof u === "string" && (batchUrls.has(u) || /^https?:\/\//.test(u))
    );
    if (!allValid) errors.push("invalid_source_urls");
  }
  return errors;
}

type CurationOutcome = {
  result: GeneralCurationResult;
  item: RawGeneral;
  errors: ValidationError[];
  attempts: number;
};

async function curateBatchWithValidation(
  items: RawGeneral[],
  crewContext: string,
  existingPrimaries: ExistingPrimary[] = []
): Promise<CurationOutcome[]> {
  const batchUrls = new Set(items.map((it) => it.url));
  const initial = await curateBatchOnce(items, crewContext, existingPrimaries);

  const matchCounts: Record<string, number> = {};
  const outcomes: CurationOutcome[] = items.map((item, index) => {
    const { result: raw, match } = resolveCurationResultForItem(item, initial, index);
    const result = ensurePrimarySources({ ...raw, id: item.external_id }, item);
    matchCounts[match] = (matchCounts[match] ?? 0) + 1;
    return {
      item,
      result,
      errors: validateCuration(result, batchUrls),
      attempts: 1
    };
  });

  for (let round = 1; round <= MAX_RETRY_ROUNDS_PER_CYCLE; round++) {
    const failed = outcomes.filter(
      (o) => o.errors.length > 0 && (o.item.ai_retry_count ?? 0) + o.attempts <= MAX_RETRIES_PER_ARTICLE
    );
    if (failed.length === 0) break;

    const reminder =
      `These articles failed validation. Errors per id: ` +
      failed
        .map((o) => `${o.item.external_id}: ${o.errors.join(",")}`)
        .join(" | ") +
      `. Return corrected JSON for these IDs only: populate every required field; for summary_too_long, trim under 1350 words by cutting the least-important detail first.`;

    const retryItems = failed.map((o) => o.item);
    console.warn(
      `[generalNews] validation retry round ${round}: ${failed.length}/${outcomes.length} articles`
    );
    const retryResults = await curateBatchOnce(retryItems, crewContext, existingPrimaries, reminder);

    for (const o of failed) {
      const retryIndex = retryItems.findIndex((it) => it.external_id === o.item.external_id);
      const { result: fresh, match } = resolveCurationResultForItem(
        o.item,
        retryResults,
        retryIndex >= 0 ? retryIndex : 0
      );
      if (match !== "none") {
        const normalized = ensurePrimarySources({ ...fresh, id: o.item.external_id }, o.item);
        o.result = normalized;
        o.errors = validateCuration(normalized, batchUrls);
        o.attempts++;
        matchCounts[`retry_${match}`] = (matchCounts[`retry_${match}`] ?? 0) + 1;
      }
    }
  }

  for (const o of outcomes) {
    if (o.errors.length === 0 || !isRepairableValidation(o.errors)) continue;
    const repair = await tryValidationRepair({
      externalId: o.item.external_id,
      title: o.item.title,
      url: o.item.url,
      excerpt: (o.item.contents ?? o.item.title).slice(0, 1500),
      partial: {
        id: o.item.external_id,
        title: o.result.title,
        summary: o.result.summary,
        whyMatters: o.result.whyMatters,
        sources: o.result.sources
      },
      errors: o.errors,
      batchUrls
    });
    if (!repair) continue;
    const patched = ensurePrimarySources(
      {
        ...o.result,
        id: o.item.external_id,
        title: repair.title?.trim() || o.result.title,
        summary: repair.summary?.trim() || o.result.summary,
        whyMatters: repair.whyMatters?.trim() || o.result.whyMatters,
        sources: Array.isArray(repair.sources) && repair.sources.length > 0 ? repair.sources : o.result.sources
      },
      o.item
    );
    o.result = patched;
    o.errors = validateCuration(patched, batchUrls);
    o.attempts++;
  }

  const failed = outcomes.filter((o) => o.errors.length > 0);
  setLastBatchDiagnostics({
    batchSize: items.length,
    parsedCount: initial.length,
    matchCounts,
    failedCount: failed.length,
    provider: getAISetting("ai_provider") ?? "unknown",
    model: getAISetting("ai_model") ?? "default"
  });

  return outcomes;
}

async function persistCurationOutcome(
  outcome: CurationOutcome,
  crewEntityNames: Set<string>
): Promise<{ persisted: boolean; failed: boolean; merged?: boolean }> {
  const { item, result, errors, attempts } = outcome;

  // Merge into an existing curated primary: refresh that primary's fields with
  // the AI-supplied synthesis, then mark the new article as absorbed (no card).
  if (isMerge(result)) {
    const parentId = result.mergesIntoExistingId!;
    const updatedSummary = (result.updatedSummary ?? "").trim();
    const updatedTitle = (result.updatedTitle ?? "").trim();
    const updatedSubtitle = (result.updatedSubtitle ?? "").trim();
    const updatedWhy = (result.updatedWhyMatters ?? "").trim();
    const updatedSources = Array.isArray(result.updatedSources) ? result.updatedSources : null;

    // Sanity-check the parent exists and is still a primary card.
    const parentCheck = await db.query<{ id: number }>(
      `SELECT id FROM general_news
        WHERE external_id = $1
          AND ai_curated_at IS NOT NULL
          AND ai_relevance_score > 0
        LIMIT 1`,
      [parentId]
    );
    if (parentCheck.rowCount === 0 || updatedSummary.length < 150) {
      // Parent missing or AI returned an unusable merge — fall through and
      // treat as a plain duplicate so the row doesn't re-enter the queue.
      await db.query(
        `UPDATE general_news
           SET ai_relevance_score = 0,
               ai_curated_at = NOW(),
               ai_validation_failed = FALSE,
               ai_last_validation_errors = NULL
         WHERE id = $1`,
        [item.id]
      );
      console.warn(
        `[generalNews] merge target missing or merge summary too short for parent=${parentId} (child external=${item.external_id})`
      );
      return { persisted: true, failed: false };
    }

    const updatedFingerprint = (result.updatedStoryFingerprint ?? "").trim();
    await db.query(
      `UPDATE general_news
          SET ai_title             = COALESCE(NULLIF($1, ''), ai_title),
              ai_subtitle          = COALESCE(NULLIF($2, ''), ai_subtitle),
              ai_summary           = $3,
              ai_why_recommended   = COALESCE(NULLIF($4, ''), ai_why_recommended),
              ai_sources           = COALESCE($5, ai_sources),
              ai_story_fingerprint = COALESCE(NULLIF($6, ''), ai_story_fingerprint),
              ai_curated_at        = NOW()
        WHERE external_id = $7`,
      [updatedTitle, updatedSubtitle, updatedSummary, updatedWhy, updatedSources, updatedFingerprint, parentId]
    );

    // Mark new article as absorbed: it shouldn't render its own card.
    await db.query(
      `UPDATE general_news
         SET ai_relevance_score = 0,
             ai_summary = NULL,
             ai_curated_at = NOW(),
             ai_validation_failed = FALSE,
             ai_last_validation_errors = NULL
       WHERE id = $1`,
      [item.id]
    );
    console.log(
      `[generalNews] merged external=${item.external_id} into parent=${parentId} (summary ${updatedSummary.length}ch)`
    );
    return { persisted: true, failed: false, merged: true };
  }

  if (result.duplicate) {
    await db.query(
      `UPDATE general_news
         SET ai_relevance_score = 0,
             ai_curated_at = NOW(),
             ai_retry_count = COALESCE(ai_retry_count, 0),
             ai_validation_failed = FALSE,
             ai_last_validation_errors = NULL
       WHERE id = $1`,
      [item.id]
    );
    return { persisted: true, failed: false };
  }

  const validationFailed = errors.length > 0;
  const tags = sanitizeTags(result.tags ?? [], crewEntityNames);
  const finalRetryCount = (item.ai_retry_count ?? 0) + attempts - 1;

  const fingerprint = (result.storyFingerprint ?? "").trim();
  await db.query(
    `UPDATE general_news
       SET ai_relevance_score        = $1,
           ai_summary                = $2,
           ai_label                  = $3,
           ai_spoiler_warning        = $4,
           ai_subtitle               = $5,
           ai_tags                   = $6,
           ai_why_recommended        = $7,
           ai_game_title             = $8,
           ai_title                  = $9,
           ai_sources                = $10,
           ai_retry_count            = $11,
           ai_validation_failed      = $12,
           ai_last_validation_errors = $13,
           ai_story_fingerprint      = NULLIF($14, ''),
           ai_curated_at             = NOW()
     WHERE id = $15`,
    [
      result.relevanceScore ?? 0,
      result.summary || null,
      result.label || null,
      result.spoilerWarning ?? false,
      result.subtitle || null,
      tags,
      result.whyMatters || null,
      result.gameTitle || null,
      result.title || null,
      Array.isArray(result.sources) ? result.sources : null,
      finalRetryCount,
      validationFailed,
      validationFailed ? errors : null,
      fingerprint,
      item.id
    ]
  );

  if (validationFailed) {
    await recordSourceValidationFail(item.source_name);
    console.warn(
      `[generalNews] validation failed after ${attempts} attempts for ${item.external_id}: ${errors.join(",")}`
    );
  } else if (!result.duplicate && !isMerge(result)) {
    await recordSourceCurated(item.source_name);
    void linkNewsToGame(item.id, result.gameTitle ?? null);
  }

  // Embed the newly-curated primary so future ingests can match against the
  // richer AI-summary text rather than the raw RSS lede. Best-effort: skip
  // silently when pgvector / embedding backend isn't configured.
  if (!validationFailed && (await isEmbeddingColumnAvailable())) {
    try {
      const text = result.summary
        ? `${result.title}\n\n${result.summary}`
        : `${result.title}\n\n${(item.contents ?? "").slice(0, 1500)}`;
      const vec = await embedText(text);
      if (vec) await setEmbedding(item.id, vec);
    } catch (err) {
      console.warn(
        `[generalNews] post-curation embed failed for ${item.external_id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return { persisted: true, failed: validationFailed };
}

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Fetch general gaming news from enabled RSS feeds + optional GNews API,
 * then AI-curate any un-curated rows.
 * Safe to call fire-and-forget — all errors are caught internally.
 */
/** Fire-and-forget ingest when the public feed is stale (or legacy page-load mode). */
export async function maybeBackgroundIngest(): Promise<void> {
  if (!(await shouldTriggerBackgroundIngest())) return;
  void ingestAndCurateGeneralNews(false);
}

export async function ingestAndCurateGeneralNews(
  force = false
): Promise<{ fetched: number; curated: number; embedded: number }> {
  const enabled = getAISetting("news_general_enabled");
  if (enabled === "false") return { fetched: 0, curated: 0, embedded: 0 };
  if (!force && Date.now() - lastIngestedAt < INGEST_COOLDOWN_MS) {
    return { fetched: 0, curated: 0, embedded: 0 };
  }

  const locked = await withNewsPipelineLock(async () => {
  const costAtStart = getAiCostTotalUsd();

  let totalFetched = 0;
  let totalCurated = 0;
  let totalEmbedded = 0;
  let batchFailed = 0;
  let errorSummary: string | null = null;

  try {
    const staleBacklog = await db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM general_news WHERE ai_curated_at IS NULL`
    );
    if (parseInt(staleBacklog.rows[0]?.c ?? "0", 10) > 500) {
      await retireStaleUncuratedBacklog();
    }

    const [crewTags, gameNames, crewEntityNames] = await Promise.all([
      getCrewGameTags(), getCrewGameNames(), getCrewEntityNames()
    ]);

    // Rebuild the outlet-name blocklist from the registry so the AI curator
    // can't emit any current outlet name as an article tag.
    await refreshOutletBlocklist();

    // Dispatch every enabled news_source_registry row to its provider.
    const allItems = await fetchFromRegistry(crewTags, gameNames);

    const insertedIds = await upsertGeneralNews(allItems);
    totalFetched = insertedIds.length;

    // Scrape a large og:image for rows the feed left imageless (esp. Reddit).
    // Isolated so a scrape failure never blocks clustering/curation.
    try {
      await resolveMissingImages(insertedIds);
    } catch (err) {
      console.warn("[generalNews] image resolution step failed:", err);
    }

    // Deterministic clustering pass: embed each new row, fold cosine-similar
    // articles into existing primary cards as siblings (no LLM curation). Big
    // cost win — only NEW stories reach the curator.
    const { embedded } = await embedAndCluster(insertedIds);
    totalEmbedded = embedded;

    // Curate new rows (cluster-aware batching: pull wider pool, group siblings,
    // then pack into batches preserving cluster boundaries).
    const freshCorpus = await isFreshCorpusMode();
    const uncurated = await db.query<RawGeneral>(
      freshCorpus
        ? `
        SELECT id, external_id, title, url, contents, source_name, matched_tags, ai_retry_count
        FROM general_news
        WHERE ai_curated_at IS NULL
        ORDER BY published_at DESC
        LIMIT $1
      `
        : `
        SELECT id, external_id, title, url, contents, source_name, matched_tags, ai_retry_count
        FROM general_news
        WHERE ai_curated_at IS NULL
          AND published_at > NOW() - INTERVAL '${CLUSTER_WINDOW}'
        ORDER BY published_at DESC
        LIMIT $1
      `,
      [curationPoolSize()]
    );

    const filteredRows = await applyPreFilter(uncurated.rows);

    if (filteredRows.length > 0) {
      try {
        const crewContext = await buildCrewContext();
        // Pre-cluster every uncurated article with a cheap AI fingerprint
        // pass. Ensures siblings about the same story land in the same batch
        // even when the title-regex heuristic would scatter them.
        const fingerprintMap = await assignStoryFingerprints(filteredRows);
        const batches = groupAndPack(filteredRows, curationBatchSize(), fingerprintMap);
        for (const batch of batches) {
          // Re-fetch per batch so later batches see primaries persisted by
          // earlier batches in this same pass (critical during re-curate of
          // the whole corpus when all rows start uncurated).
          const existingPrimaries = await fetchRecentPrimaries();
          if (existingPrimaries.length > 0) {
            console.log(
              `[generalNews] batch start: ${existingPrimaries.length} recent primary card(s) supplied as merge candidates`
            );
          }
          const outcomes = await curateBatchWithValidation(batch, crewContext, existingPrimaries);
          for (const outcome of outcomes) {
            const persisted = await persistCurationOutcome(outcome, crewEntityNames);
            if (persisted.failed) batchFailed++;
            if (
              persisted.persisted &&
              !persisted.failed &&
              !outcome.result.duplicate &&
              !persisted.merged
            ) {
              totalCurated++;
            }
          }
        }
      } catch (err) {
        if (err instanceof AIDisabledError || err instanceof AINotConfiguredError) {
          errorSummary = err.message;
          console.warn("[generalNews] AI unavailable, skipping curation:", err.message);
        } else {
          errorSummary = err instanceof Error ? err.message : String(err);
          console.error("[generalNews] Curation error:", err);
        }
      }
    }
  } catch (err) {
    errorSummary = err instanceof Error ? err.message : String(err);
    console.error("[generalNews] Ingestion error:", err);
  } finally {
    lastIngestedAt = Date.now();
    // Chip away at embedding backlog each pass — avoids one-time migration gaps
    // requiring a manual "Embed Missing" marathon.
    try {
      const missing = await countMissingEmbeddings();
      if (missing > 0) {
        const { embedded: backfilled, skipped: embedSkipped } = await backfillEmbeddings(50);
        if (backfilled > 0 || embedSkipped > 0) {
          console.log(
            `[generalNews] auto embed backfill: ${backfilled} embedded, ${embedSkipped} skipped, ~${Math.max(0, missing - backfilled - embedSkipped)} remaining`
          );
        }
      }
    } catch (err) {
      console.warn("[generalNews] auto embed backfill failed:", err);
    }
    void reportCurationPassOutcome({
      runKind: "ingest",
      fetched: totalFetched,
      curated: totalCurated,
      embedded: totalEmbedded,
      batchFailed,
      errorSummary,
      costUsdStart: costAtStart
    });
  }

  return { fetched: totalFetched, curated: totalCurated, embedded: totalEmbedded };
  });

  if (!locked.ran) return { fetched: 0, curated: 0, embedded: 0 };
  return locked.result;
}

/**
 * Reset all existing curation data so rows will be re-processed by the next curation pass.
 * Used when the curation prompt changes and summaries need to be regenerated.
 */
export async function resetAllCuration(): Promise<number> {
  const result = await db.query<{ count: string }>(
    `UPDATE general_news
       SET ai_curated_at = NULL,
           ai_relevance_score = 0,
           ai_retry_count = 0,
           ai_validation_failed = FALSE,
           ai_last_validation_errors = NULL
       RETURNING id`
  );
  return result.rowCount ?? 0;
}

/**
 * Debug helper — run AI curation on a single article and return the raw AI result.
 * Useful for diagnosing tag taxonomy compliance without writing to DB.
 */
export async function debugCurateOne(): Promise<{
  article: RawGeneral | null;
  rawAiResult: GeneralCurationResult | null;
  sanitizedTags: string[];
  error?: string;
}> {
  const row = await db.query<RawGeneral>(
    `SELECT id, external_id, title, url, contents, source_name, matched_tags, ai_retry_count
     FROM general_news
     ORDER BY published_at DESC
     LIMIT 1`
  );
  const article = row.rows[0] ?? null;
  if (!article) return { article: null, rawAiResult: null, sanitizedTags: [] };

  try {
    const [crewContext, crewEntityNames] = await Promise.all([buildCrewContext(), getCrewEntityNames()]);
    const results = await curateBatchOnce([article], crewContext);
    const raw = results[0] ?? null;
    return {
      article,
      rawAiResult: raw,
      sanitizedTags: raw ? sanitizeTags(raw.tags ?? [], crewEntityNames) : []
    };
  } catch (err) {
    return {
      article,
      rawAiResult: null,
      sanitizedTags: [],
      error: String(err)
    };
  }
}

/**
 * Manually trigger AI curation of any un-curated general_news rows.
 * Used by the admin "trigger curation" button.
 */
export async function curateUncuratedGeneralNews(
  options: { reportRun?: boolean; bulk?: boolean } = {}
): Promise<number> {
  const reportRun = options.reportRun !== false;
  const bulk = options.bulk === true;
  const poolLimit = bulk ? 24 : curationPoolSize();

  let uncurated: { rows: RawGeneral[] };
  if (bulk) {
    // Full-corpus re-curate: no date window, larger pool per pass.
    uncurated = await db.query<RawGeneral>(
      `
        SELECT id, external_id, title, url, contents, source_name, matched_tags, ai_retry_count
        FROM general_news
        WHERE ai_curated_at IS NULL
        ORDER BY published_at DESC
        LIMIT $1
      `,
      [poolLimit]
    );
  } else if (await isFreshCorpusMode()) {
    uncurated = await db.query<RawGeneral>(
      `
        SELECT id, external_id, title, url, contents, source_name, matched_tags, ai_retry_count
        FROM general_news
        WHERE ai_curated_at IS NULL
        ORDER BY published_at DESC
        LIMIT $1
      `,
      [poolLimit]
    );
  } else {
    // Cluster-aware window (catches sibling articles for same story).
    uncurated = await db.query<RawGeneral>(
      `
        SELECT id, external_id, title, url, contents, source_name, matched_tags, ai_retry_count
        FROM general_news
        WHERE ai_curated_at IS NULL
          AND published_at > NOW() - INTERVAL '${CLUSTER_WINDOW}'
        ORDER BY published_at DESC
        LIMIT $1
      `,
      [poolLimit]
    );
  }

  if (uncurated.rows.length === 0) return 0;

  const locked = await withNewsPipelineLock(async () => {
  const costAtStart = getAiCostTotalUsd();
  let batchFailed = 0;

  try {
    const [crewContext, crewEntityNames] = await Promise.all([buildCrewContext(), getCrewEntityNames()]);
    const filteredRows = await applyPreFilter(uncurated.rows);
    if (filteredRows.length === 0) return 0;
    const fingerprintMap = await assignStoryFingerprints(filteredRows);
    const batches = groupAndPack(filteredRows, curationBatchSize(), fingerprintMap);
    let count = 0;
    for (const batch of batches) {
      const existingPrimaries = await fetchRecentPrimaries();
      if (existingPrimaries.length > 0) {
        console.log(
          `[generalNews] manual batch start: ${existingPrimaries.length} recent primary card(s) supplied as merge candidates`
        );
      }
      const outcomes = await curateBatchWithValidation(batch, crewContext, existingPrimaries);
      for (const outcome of outcomes) {
        const result = await persistCurationOutcome(outcome, crewEntityNames);
        if (result.failed) batchFailed++;
        if (
          result.persisted &&
          !result.failed &&
          !outcome.result.duplicate &&
          !result.merged
        ) {
          count++;
        }
      }
    }
    if (reportRun) {
      void reportCurationPassOutcome({
        runKind: "curate",
        fetched: 0,
        curated: count,
        embedded: 0,
        batchFailed,
        costUsdStart: costAtStart
      });
    }
    return count;
  } catch (err) {
    console.error("[generalNews] Manual curation error:", err);
    if (reportRun) {
      void reportCurationPassOutcome({
        runKind: "curate",
        fetched: 0,
        curated: 0,
        embedded: 0,
        batchFailed,
        errorSummary: err instanceof Error ? err.message : String(err),
        costUsdStart: costAtStart
      });
    }
    return 0;
  }
  });

  if (!locked.ran) return 0;
  return locked.result;
}
