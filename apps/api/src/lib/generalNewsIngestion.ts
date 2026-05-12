import Parser from "rss-parser";
import { db } from "../db/client.js";
import { AIDisabledError, AINotConfiguredError, getAIProvider } from "./ai/index.js";
import { getAISetting } from "./serverSettings.js";

// ── Types ─────────────────────────────────────────────────────────────────────

type FeedItem = {
  sourceType: "rss" | "newsapi";
  sourceName: string;
  externalId: string; // dedup key — usually the article URL
  title: string;
  url: string;
  contents: string | null;
  author: string | null;
  imageUrl: string | null;
  publishedAt: Date;
  matchedTags: string[];
};

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
};

type ValidationError =
  | "missing_title"
  | "summary_too_short"
  | "missing_why_matters"
  | "missing_sources"
  | "invalid_source_urls";

const MAX_RETRIES_PER_ARTICLE = 2;
const MAX_RETRY_ROUNDS_PER_CYCLE = 2;

// ── RSS Feed Catalogue ─────────────────────────────────────────────────────────

const RSS_FEEDS: Record<string, { name: string; url: string }> = {
  pcgamer: {
    name: "PC Gamer",
    url: "https://www.pcgamer.com/rss/"
  },
  rockpapershotgun: {
    name: "Rock Paper Shotgun",
    url: "https://www.rockpapershotgun.com/feed"
  },
  eurogamer: {
    name: "Eurogamer",
    url: "https://www.eurogamer.net/?format=rss"
  },
  kotaku: {
    name: "Kotaku",
    url: "https://kotaku.com/rss"
  },
  ign: {
    name: "IGN",
    url: "https://feeds.feedburner.com/ign/games-all"
  },
  polygon: {
    name: "Polygon",
    url: "https://www.polygon.com/rss/index.xml"
  },
  vg247: {
    name: "VG247",
    url: "https://www.vg247.com/feed"
  },
  pcgamesn: {
    name: "PCGamesN",
    url: "https://www.pcgamesn.com/mainrss.xml"
  },
  theverge: {
    name: "The Verge",
    url: "https://www.theverge.com/rss/gaming/index.xml"
  },
  gamesradar: {
    name: "GamesRadar",
    url: "https://www.gamesradar.com/rss/"
  }
};

// Outlet names that must never appear as AI-generated tags
const OUTLET_TAG_BLOCKLIST = new Set(
  Object.values(RSS_FEEDS).map((f) => f.name.toLowerCase())
);

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
    `SELECT DISTINCT LOWER(g.name) AS name FROM user_games ug INNER JOIN games g ON g.app_id = ug.app_id
     UNION
     SELECT DISTINCT LOWER(d) AS name FROM user_games ug
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

// Per-feed recent item cap — avoid flooding on first run
const ITEMS_PER_FEED = 20;
// Max articles to AI-curate per curation pass — larger = more cross-source story coverage
// 12 articles × ~1300 output tokens each = ~16k. Fits 16384 maxTokens cap with
// headroom. v2 prompt (3-5 paragraph summaries) was overflowing at 25/batch.
const CURATION_BATCH_SIZE = 12;
// Wider candidate pool so cluster-aware batching can group siblings together.
const CURATION_POOL_SIZE = CURATION_BATCH_SIZE * 3;
// Cluster-candidate window: articles within this window are eligible for
// content-overlap merging. AI still judges actual content overlap.
const CLUSTER_WINDOW = "14 days";

let ingestionInFlight = false;
let lastIngestedAt = 0;
const INGEST_COOLDOWN_MS = 60 * 60 * 1000;

const rssParser = new Parser({
  timeout: 10_000,
  customFields: {
    item: [
      ["media:thumbnail", "mediaThumbnail"],
      ["media:content", "mediaContent"],
      ["enclosure", "enclosure"]
    ]
  }
});

// ── Tag Matching ──────────────────────────────────────────────────────────────

/** Fetch crew game tags (genres, categories) weighted by ownership. Requires 2+ owners. */
async function getCrewGameTags(): Promise<string[]> {
  const result = await db.query<{ tag: string }>(
    `
      SELECT LOWER(TRIM(t)) AS tag, COUNT(DISTINCT ug.user_id) AS owners
      FROM user_games ug
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
      FROM user_games ug
      INNER JOIN games g ON g.app_id = ug.app_id
    `
  );
  return result.rows.map((r) => r.name);
}

function matchTagsToArticle(
  title: string,
  contents: string | null,
  crewTags: string[],
  gameNames: string[]
): string[] {
  const haystack = `${title} ${contents ?? ""}`.toLowerCase();
  const tagMatches = crewTags.filter((tag) => haystack.includes(tag));
  const gameMatches = gameNames.filter((name) => haystack.includes(name));
  return [...new Set([...tagMatches, ...gameMatches])];
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

// Group rows by cluster key then pack into batches of <= batchSize, keeping
// each cluster intact when possible. Big clusters (>= batchSize) get their own
// batch(es); small clusters share. Sibling articles thus always land together,
// giving the AI the chance to merge them.
function groupAndPack(rows: RawGeneral[], batchSize: number): RawGeneral[][] {
  const groups = new Map<string, RawGeneral[]>();
  for (const r of rows) {
    const key = extractClusterKey(r);
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

// ── RSS Ingestion ─────────────────────────────────────────────────────────────

async function fetchRssFeed(key: string, crewTags: string[], gameNames: string[]): Promise<FeedItem[]> {
  const feed = RSS_FEEDS[key];
  if (!feed) return [];

  try {
    const parsed = await rssParser.parseURL(feed.url);
    const items = (parsed.items ?? []).slice(0, ITEMS_PER_FEED);

    return items
      .filter((item) => !!item.link && !!item.title)
      .map((item) => {
        const url = item.link!;
        const title = item.title!;
        const contents = item.contentSnippet ?? item.content ?? null;
        const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();

        // Try to extract image from various RSS fields
        const imageUrl: string | null =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (item as any).mediaThumbnail?.["$"]?.url ??
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (item as any).mediaContent?.["$"]?.url ??
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (item as any).enclosure?.url ??
          null;

        return {
          sourceType: "rss" as const,
          sourceName: feed.name,
          externalId: url,
          title,
          url,
          contents,
          author: item.creator ?? null,
          imageUrl,
          publishedAt,
          matchedTags: matchTagsToArticle(title, contents, crewTags, gameNames)
        };
      });
  } catch (err) {
    console.warn(`[generalNews] RSS fetch failed for ${key}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

// ── GNews API Ingestion ───────────────────────────────────────────────────────

async function fetchGNewsArticles(crewTags: string[], gameNames: string[]): Promise<FeedItem[]> {
  const apiKey = getAISetting("newsapi_key");
  if (!apiKey || apiKey === "••••••••") {
    console.log("[generalNews] GNews skipped: newsapi_key not configured in admin settings");
    return [];
  }

  // Broad gaming news query — let AI filter relevance, not the query
  const query = "video games gaming";
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=10&sortby=publishedAt&apikey=${apiKey}`;

  console.log("[generalNews] Fetching GNews...");

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) {
      const body = await resp.text();
      console.warn(`[generalNews] GNews API error ${resp.status}: ${body}`);
      return [];
    }

    const data = (await resp.json()) as {
      articles?: Array<{
        title: string;
        url: string;
        description: string | null;
        content: string | null;
        publishedAt: string;
        source: { name: string };
        image: string | null;
        author: string | null;
      }>;
    };

    const articles = data.articles ?? [];
    console.log(`[generalNews] GNews returned ${articles.length} articles`);

    return articles.map((a) => ({
      sourceType: "newsapi" as const,
      sourceName: a.source.name,
      externalId: a.url,
      title: a.title,
      url: a.url,
      contents: a.content ?? a.description ?? null,
      author: a.author,
      imageUrl: a.image,
      publishedAt: new Date(a.publishedAt),
      matchedTags: matchTagsToArticle(a.title, a.content ?? a.description, crewTags, gameNames)
    }));
  } catch (err) {
    console.warn(`[generalNews] GNews fetch failed:`, err instanceof Error ? err.message : err);
    return [];
  }
}

// ── DB Upsert ─────────────────────────────────────────────────────────────────

async function upsertGeneralNews(items: FeedItem[]): Promise<number[]> {
  if (items.length === 0) return [];

  const insertedIds: number[] = [];

  for (const item of items) {
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

  return insertedIds;
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
       FROM user_games ug
       INNER JOIN games g ON g.app_id = ug.app_id
       WHERE ug.playtime_2weeks > 0
       GROUP BY g.name
       ORDER BY playtime_2weeks DESC
       LIMIT 8`
    ),
    db.query<{ game_name: string; owners: number; tags: string[] }>(
      `SELECT g.name AS game_name, COUNT(DISTINCT ug.user_id)::int AS owners, g.tags
       FROM user_games ug
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
       FROM user_games ug
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

// Parse AI JSON output, tolerating control characters that Anthropic sometimes
// emits inside string literals. First tries strict JSON.parse; if that fails,
// walks the text, escaping control chars inside string literals (`"..."`) only.
function parseAiJsonArray(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Fallback: rebuild a sanitized copy
    let out = "";
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      const ch = text[i];
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
  retryReminder?: string
): Promise<GeneralCurationResult[]> {
  const ai = getAIProvider();

  const payload = items.map((it) => ({
    id: it.external_id,
    source: it.source_name,
    url: it.url,
    cluster: extractClusterKey(it),
    title: it.title,
    excerpt: it.contents ? it.contents.slice(0, 800) + (it.contents.length > 800 ? "…" : "") : ""
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

Write a complete summary, 3–5 paragraphs, ~300–500 words. Cover:
- What happened
- Who is affected (players, developers, platforms, regions)
- Why it happened (if known)
- What is changing (features, pricing, timelines, policies, releases)
- When it takes effect
- Any background context needed to understand the impact

Don't sacrifice detail for brevity. If a gamer deciding how to respond would care about it, include it. Label speculation clearly — don't present assumptions as facts.

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

The summary must contain ONLY information about the article itself — facts, details, and context drawn directly from the source excerpts. Do NOT reference community interest, crew relevance, or player perspective in the summary; that belongs exclusively in \`whyRecommended\`.

Write a cross-source synthesis covering:
1. **What happened** — the core news fact, announcement, or event
2. **Context** — why it matters in industry / studio / game-history terms (no crew framing)
3. **Details** — specific numbers, dates, features, changes, or quotes drawn from EVERY source covering this story
4. **What's next** — expected follow-up, release date, or open questions surfaced by the sources

**Length and format:**
- Aim for ~350 words.
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
    "summary": "<3–5 paragraphs, ~300–500 words, prose + bullets, article-only facts; empty string for duplicates>",
    "whyMatters": "<1–2 sentences, concrete crew connection, never generic; empty string for duplicates>",
    "sources": ["<url1 from batch>", "<url2 from batch>"],
    "subtitle": "<one sharp subheadline sentence, 10–20 words; always include, even for duplicates>",
    "tags": ["News", "RPG"],
    "gameTitle": "<primary game title e.g. 'Elden Ring'; null if no single game focus>",
    "label": "<top_news | community | personal>",
    "relevanceScore": <number 0.0–1.0>,
    "spoilerWarning": <true | false>,
    "duplicate": <true | false>
  }
]

Relevance: 0.75–1.0 = major impact / crew relevance; 0.4–0.74 = notable; 0–0.39 = low signal.

Tone & style — write like a knowledgeable human editor, not a content aggregator. No marketing language. No "as an AI" phrasing. No filler. Skip formal transitions (moreover, furthermore, in conclusion); use natural conversational tone. Minimize hedge words (essentially, basically, actually) and buzzwords (delve, unpack, embark, innovative, vibrant). Verify facts against source excerpts only; never present assumptions as facts.

Return ONLY the JSON array. No markdown fences, no preamble.`;

  const userContent =
    `## Crew context\n\n${crewContext}\n\n## Articles\n\n${JSON.stringify(payload, null, 2)}` +
    (retryReminder ? `\n\n## Retry directive\n\n${retryReminder}` : "");

  const result = await ai.complete(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    { maxTokens: 16384, temperature: 0.2 }
  );

  const raw = result.text.trim();
  const jsonText = raw.startsWith("```")
    ? raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
    : raw;
  const parsed = parseAiJsonArray(jsonText) as GeneralCurationResult[];
  if (!Array.isArray(parsed)) throw new Error("AI returned non-array response");
  // Debug: log raw tags so we can verify taxonomy compliance
  const sample = parsed.slice(0, 3).map((r) => ({ id: r.id.slice(-30), tags: r.tags, dup: r.duplicate }));
  console.log("[generalNews] AI tag sample:", JSON.stringify(sample));
  return parsed;
}

function validateCuration(res: GeneralCurationResult, batchUrls: Set<string>): ValidationError[] {
  if (res.duplicate) return [];
  const errors: ValidationError[] = [];
  if (!res.title || res.title.trim().length < 8) errors.push("missing_title");
  if (!res.summary || res.summary.trim().length < 150) errors.push("summary_too_short");
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
  crewContext: string
): Promise<CurationOutcome[]> {
  const batchUrls = new Set(items.map((it) => it.url));
  const initial = await curateBatchOnce(items, crewContext);

  const outcomes: CurationOutcome[] = items.map((item) => {
    const result =
      initial.find((r) => r.id === item.external_id) ?? ({} as GeneralCurationResult);
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
      `. Return the corrected JSON for these IDs only, ensuring every required field is populated.`;

    const retryItems = failed.map((o) => o.item);
    console.warn(
      `[generalNews] validation retry round ${round}: ${failed.length}/${outcomes.length} articles`
    );
    const retryResults = await curateBatchOnce(retryItems, crewContext, reminder);

    for (const o of failed) {
      const fresh = retryResults.find((r) => r.id === o.item.external_id);
      if (fresh) {
        o.result = fresh;
        o.errors = validateCuration(fresh, batchUrls);
        o.attempts++;
      }
    }
  }

  return outcomes;
}

async function persistCurationOutcome(
  outcome: CurationOutcome,
  crewEntityNames: Set<string>
): Promise<{ persisted: boolean; failed: boolean }> {
  const { item, result, errors, attempts } = outcome;

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
           ai_curated_at             = NOW()
     WHERE id = $14`,
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
      item.id
    ]
  );

  if (validationFailed) {
    console.warn(
      `[generalNews] validation failed after ${attempts} attempts for ${item.external_id}: ${errors.join(",")}`
    );
  }

  return { persisted: true, failed: validationFailed };
}

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Fetch general gaming news from enabled RSS feeds + optional GNews API,
 * then AI-curate any un-curated rows.
 * Safe to call fire-and-forget — all errors are caught internally.
 */
export async function ingestAndCurateGeneralNews(force = false): Promise<{ fetched: number; curated: number }> {
  const enabled = getAISetting("news_general_enabled");
  if (enabled === "false") return { fetched: 0, curated: 0 };
  if (ingestionInFlight) return { fetched: 0, curated: 0 };
  if (!force && Date.now() - lastIngestedAt < INGEST_COOLDOWN_MS) return { fetched: 0, curated: 0 };
  ingestionInFlight = true;

  let totalFetched = 0;
  let totalCurated = 0;

  try {
    const [crewTags, gameNames, crewEntityNames] = await Promise.all([
      getCrewGameTags(), getCrewGameNames(), getCrewEntityNames()
    ]);

    // Determine which RSS sources are enabled
    const rawSources = getAISetting("news_rss_sources") ?? "pcgamer,rockpapershotgun,eurogamer,kotaku";
    const enabledSources = rawSources
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    // Fetch all sources concurrently
    const rssFetches = enabledSources.map((key) => fetchRssFeed(key, crewTags, gameNames));
    const gNewsFetch = fetchGNewsArticles(crewTags, gameNames);

    const allResults = await Promise.all([...rssFetches, gNewsFetch]);
    const allItems = allResults.flat();

    const insertedIds = await upsertGeneralNews(allItems);
    totalFetched = insertedIds.length;

    // Curate new rows (cluster-aware batching: pull wider pool, group siblings,
    // then pack into batches preserving cluster boundaries).
    const uncurated = await db.query<RawGeneral>(
      `
        SELECT id, external_id, title, url, contents, source_name, matched_tags, ai_retry_count
        FROM general_news
        WHERE ai_curated_at IS NULL
          AND published_at > NOW() - INTERVAL '${CLUSTER_WINDOW}'
        ORDER BY published_at DESC
        LIMIT $1
      `,
      [CURATION_POOL_SIZE]
    );

    if (uncurated.rows.length > 0) {
      try {
        const crewContext = await buildCrewContext();
        const batches = groupAndPack(uncurated.rows, CURATION_BATCH_SIZE);
        for (const batch of batches) {
          const outcomes = await curateBatchWithValidation(batch, crewContext);
          for (const outcome of outcomes) {
            const persisted = await persistCurationOutcome(outcome, crewEntityNames);
            if (persisted.persisted && !persisted.failed && !outcome.result.duplicate) {
              totalCurated++;
            }
          }
        }
      } catch (err) {
        if (err instanceof AIDisabledError || err instanceof AINotConfiguredError) {
          console.warn("[generalNews] AI unavailable, skipping curation:", err.message);
        } else {
          console.error("[generalNews] Curation error:", err);
        }
      }
    }
  } catch (err) {
    console.error("[generalNews] Ingestion error:", err);
  } finally {
    lastIngestedAt = Date.now();
    ingestionInFlight = false;
  }

  return { fetched: totalFetched, curated: totalCurated };
}

/**
 * Reset all existing curation data so rows will be re-processed by the next curation pass.
 * Used when the curation prompt changes and summaries need to be regenerated.
 */
export async function resetAllCuration(): Promise<number> {
  const result = await db.query<{ count: string }>(
    `UPDATE general_news
       SET ai_curated_at = NULL,
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
export async function curateUncuratedGeneralNews(): Promise<number> {
  // Phase 1: cluster-aware window (catches sibling articles for same story).
  let uncurated = await db.query<RawGeneral>(
    `
      SELECT id, external_id, title, url, contents, source_name, matched_tags, ai_retry_count
      FROM general_news
      WHERE ai_curated_at IS NULL
        AND published_at > NOW() - INTERVAL '${CLUSTER_WINDOW}'
      ORDER BY published_at DESC
      LIMIT $1
    `,
    [CURATION_POOL_SIZE]
  );

  // Phase 2 (tail): if no in-window candidates left, fall back to older
  // articles so they still get curated. No clustering applied to the tail.
  if (uncurated.rows.length === 0) {
    uncurated = await db.query<RawGeneral>(
      `
        SELECT id, external_id, title, url, contents, source_name, matched_tags, ai_retry_count
        FROM general_news
        WHERE ai_curated_at IS NULL
        ORDER BY published_at DESC
        LIMIT $1
      `,
      [CURATION_BATCH_SIZE]
    );
  }

  if (uncurated.rows.length === 0) return 0;

  try {
    const [crewContext, crewEntityNames] = await Promise.all([buildCrewContext(), getCrewEntityNames()]);
    const batches = groupAndPack(uncurated.rows, CURATION_BATCH_SIZE);
    let count = 0;
    for (const batch of batches) {
      const outcomes = await curateBatchWithValidation(batch, crewContext);
      for (const outcome of outcomes) {
        const result = await persistCurationOutcome(outcome, crewEntityNames);
        if (result.persisted && !result.failed && !outcome.result.duplicate) count++;
      }
    }
    return count;
  } catch (err) {
    console.error("[generalNews] Manual curation error:", err);
    return 0;
  }
}
