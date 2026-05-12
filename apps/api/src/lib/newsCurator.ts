import { db } from "../db/client.js";
import { AIDisabledError, AINotConfiguredError, getAIProvider } from "./ai/index.js";

type RawNewsItem = {
  app_id: number;
  gid: string;
  title: string;
  contents: string | null;
  game_name: string;
  tags: string[];
  source_kind: string | null;
  source_label: string | null;
};

type CurationResult = {
  gid: string;
  relevanceScore: number;
  summary: string;
  label?: "personal" | "community" | "top_news";
  spoilerWarning?: boolean;
  duplicate?: boolean; // true = merged into another story; skip DB write
};

// Larger batch amortises the fixed cost of the long system prompt over more articles.
const BATCH_SIZE = 20;
// Prevent two concurrent page loads from firing duplicate curation batches.
let curationInFlight = false;

function truncate(text: string | null, maxChars: number): string {
  if (!text) return "";
  return text.length > maxChars ? text.slice(0, maxChars) + "…" : text;
}

async function callAIForCuration(
  items: RawNewsItem[],
  crewContext: string
): Promise<CurationResult[]> {
  const ai = getAIProvider();

  const itemsPayload = items.map((item) => ({
    gid: item.gid,
    game: item.game_name,
    source: item.source_label ?? item.source_kind ?? "steam",
    title: item.title,
    excerpt: truncate(item.contents, 200)
  }));

  const systemPrompt = `# Role

You are a gaming news curator for The Boneless Island — a tight-knit Discord gaming community of adult gamers in their 30s. You're a fellow gamer who knows what's actually worth sharing: deep knowledge of game metadata, news deduplication, and community personalization. Casual and conversational tone — no fluff, no duplicates, no spoilers without warnings.

# Task

For each batch of articles, curate a gaming news feed by cross-referencing the provided community context and aggregating multi-source coverage into clean, single summaries.

# Available signals

**Community signals (provided in the user message):**
- *Played this week* — top games by recent (2-week) playtime across crew (hours)
- *Active library* — games owned AND played within the last 180 days (owner counts)
- *Wishlisted* — games multiple crew members have wishlisted (wishlist counts)
- *Genre preference* — tags weighted by lifetime playtime (what crew actually engages with)
- *Crew completion* — average achievement % across crew, for games with ≥2 tracked players
- *Shared Steam groups* — Steam community groups multiple crew members belong to (mod scenes, esports, fan groups)
- *Batch tags* — secondary tag pool from this batch's articles

**Labeling rubric:**
- \`"personal"\` — article covers a game in *played this week* OR *active library*. Also: DLC/expansion for a game where *crew completion* > 50% (crew has finished base content, ready for more).
- \`"community"\` — article covers a game in *wishlisted* (hype/upcoming), OR matches a top *genre preference* even when the specific game isn't in active library, OR concerns a *shared Steam group* / scene.
- \`"top_news"\` — breaking or high-impact industry news (major releases, studio closures, controversies) regardless of crew alignment.

If multiple labels fit, prefer \`"personal"\` over \`"community"\` over \`"top_news"\`.

# Factual accuracy — HIGHEST PRIORITY

Every claim in your summary must be **directly supported by the article excerpt provided**. Do not infer, generalize, or fill in plausible-sounding details from prior knowledge of the game, studio, or industry.

**Hard rules:**
- If the excerpt doesn't specify a business model (free-to-play, subscription, premium, B2P), DO NOT state one. LLMs commonly hallucinate "free-to-play live-service" for any modern shooter/MMO — this is a known trap.
- If the excerpt doesn't name a genre, platform, release date, price, or publisher, omit it rather than guess.
- Numbers, quotes, dates, percentages must appear verbatim in the excerpt. If the supporting text isn't there, drop the figure.
- Widely-known facts that are absent from the excerpt should still be omitted. Brevity beats fabrication.

**Common stereotype traps to avoid:**
- Modern shooter ≠ free-to-play live-service unless stated. Marathon, Concord, XDefiant, etc. each have specific business models.
- "Studio acquired by [publisher]" ≠ "publisher exclusive" unless source confirms.
- "Sequel to X" ≠ same genre/mechanics as predecessor.

**Self-check before emitting each summary:** every concrete claim (genre, business model, dates, numbers, exclusivity, platform) must appear in the excerpt. If it doesn't, remove it.

# Deduplication

**Story identity:** Two articles cover the same event when they share the same named entities (game title, studio, publisher) AND the same event type (announcement, patch release, controversy, acquisition, etc.) AND occurred within the same news cycle. If all three align, mark the lower-quality duplicate with \`"duplicate": true\` — the higher-quality source absorbs it.

**Distinct angles are NOT duplicates:** A patch release and player backlash to that patch are separate stories. A studio announcement and a subsequent controversy about it are separate stories. If a follow-up article introduces a new event type, it is its own card.

**Source quality tiers when picking the primary:**
1. First-party sources (official developer/publisher posts, press releases)
2. Major editorial outlets with editorial standards
3. Secondary outlets and aggregators
4. Social posts and user-generated content

# Output format

Return a JSON array — one object per input article. Every input \`gid\` must appear exactly once.

[
  {
    "gid": "<string — must match input exactly>",
    "relevanceScore": <number 0.0–1.0>,
    "label": "<personal | community | top_news>",
    "spoilerWarning": <true | false>,
    "summary": "<2–3 sentences, casual gamer tone, factual>",
    "duplicate": <true | false>
  }
]

**Relevance score guide:**
- 0.75–1.0: Major gameplay impact — new content, significant patch, DLC/expansion, new game mode, major controversy with player-facing consequence
- 0.40–0.74: Notable but secondary — minor patch with meaningful fixes, community event, cosmetic update, industry news
- 0.00–0.39: Low signal — server maintenance, sponsored/PR fluff, no gameplay impact

**Summary rules:**
- Write like you're telling a gamer friend — casual, direct, no hedging language
- Be specific: what happened, who it affects, what changes for players
- 2–3 sentences max
- If coverage is still developing and sources are thin, say so rather than padding with assumptions
- Never speculate or editorialize beyond what the source material says

**Spoiler handling:**
- If an article contains plot details, story twists, or ending information for a story-driven game, set \`"spoilerWarning": true\`
- Do NOT reveal the spoiler in the summary — write around it: e.g. "This update addresses late-game story content — spoilers ahead if you haven't finished"

**Hard constraints:**
- No duplicate stories under any framing
- No speculation presented as fact
- No promotional or sponsored content surfaced as organic news
- Every input gid must appear exactly once in the output`;

  const userContent = `## Community context

${crewContext}

## News articles to curate

${JSON.stringify(itemsPayload, null, 2)}

Return ONLY the JSON array. No markdown fences, no explanation.`;

  const result = await ai.complete(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    { maxTokens: 3072, temperature: 0.2 }
  );

  const raw = result.text.trim();
  // Strip potential markdown code fences
  const jsonText = raw.startsWith("```") ? raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "") : raw;
  const parsed = JSON.parse(jsonText) as CurationResult[];

  if (!Array.isArray(parsed)) throw new Error("AI returned non-array response");
  return parsed;
}

/**
 * Curates un-curated game_news rows for the given app IDs using the active AI provider.
 * Safe to call in a fire-and-forget context — catches and logs errors internally.
 * Returns the number of articles successfully curated.
 */
export async function curateUncuratedNews(appIds: number[]): Promise<number> {
  if (appIds.length === 0) return 0;
  if (curationInFlight) return 0; // another batch is already running
  curationInFlight = true;

  // Fetch un-curated items for these apps, newest first
  const result = await db.query<RawNewsItem>(
    `
      SELECT n.app_id, n.gid, n.title, n.contents, g.name AS game_name, g.tags,
             n.source_kind, n.source_label
      FROM game_news n
      INNER JOIN games g ON g.app_id = n.app_id
      WHERE n.app_id = ANY($1::int[])
        AND n.ai_curated_at IS NULL
      ORDER BY n.published_at DESC
      LIMIT $2
    `,
    [appIds, BATCH_SIZE]
  );

  if (result.rows.length === 0) {
    curationInFlight = false;
    return 0;
  }

  try {
    // Build compact crew context — tokens matter here, it goes in every curation call.
    // Five signals: recent playtime, active library, wishlist, genre preference, completion.
    const [
      recentlyPlayedResult,
      topActiveOwnedResult,
      topWishlistedResult,
      tagPreferenceResult,
      completionResult,
      sharedGroupsResult
    ] = await Promise.all([
      // Top 8 by 2-week playtime — what crew is playing RIGHT NOW
      db.query<{ game_name: string; playtime_2weeks: number }>(
        `SELECT g.name AS game_name, SUM(ug.playtime_2weeks)::int AS playtime_2weeks
         FROM user_games ug
         INNER JOIN games g ON g.app_id = ug.app_id
         WHERE ug.playtime_2weeks > 0
         GROUP BY g.name
         ORDER BY playtime_2weeks DESC
         LIMIT 8`
      ),
      // Active library — owned AND played within 180d. Drops bundle-freebie bloat.
      db.query<{ game_name: string; owners: number }>(
        `SELECT g.name AS game_name, COUNT(DISTINCT ug.user_id)::int AS owners
         FROM user_games ug
         INNER JOIN games g ON g.app_id = ug.app_id
         WHERE ug.playtime_minutes > 0
           AND (ug.last_played_at IS NULL OR ug.last_played_at > NOW() - INTERVAL '180 days')
         GROUP BY g.name
         ORDER BY owners DESC
         LIMIT 10`
      ),
      // Wishlist top-10 — signals upcoming-release / hype relevance.
      db.query<{ game_name: string; wishlisters: number }>(
        `SELECT g.name AS game_name, COUNT(DISTINCT uw.user_id)::int AS wishlisters
         FROM user_wishlists uw
         INNER JOIN games g ON g.app_id = uw.app_id
         GROUP BY g.name
         ORDER BY wishlisters DESC, g.name ASC
         LIMIT 10`
      ),
      // Playtime-weighted tag preference — what genres crew ACTUALLY engages with.
      db.query<{ tag: string; weighted_minutes: string }>(
        `SELECT tag, SUM(ug.playtime_minutes)::bigint AS weighted_minutes
         FROM user_games ug
         INNER JOIN games g ON g.app_id = ug.app_id
         CROSS JOIN LATERAL unnest(g.tags) AS tag
         WHERE ug.playtime_minutes > 0
         GROUP BY tag
         ORDER BY weighted_minutes DESC
         LIMIT 10`
      ),
      // Crew completion signal — high engagement (need ≥2 members tracked).
      db.query<{ game_name: string; avg_completion: number; tracked: number }>(
        `SELECT g.name AS game_name,
                ROUND(AVG(p.completion_pct))::int AS avg_completion,
                COUNT(DISTINCT p.user_id)::int AS tracked
         FROM user_game_progress p
         INNER JOIN games g ON g.app_id = p.app_id
         WHERE p.completion_pct IS NOT NULL
         GROUP BY g.name
         HAVING COUNT(DISTINCT p.user_id) >= 2
         ORDER BY avg_completion DESC
         LIMIT 8`
      ),
      // Steam groups shared by ≥2 crew members.
      db.query<{ group_id: string; group_name: string | null; member_count: number }>(
        `SELECT group_id, MAX(group_name) AS group_name, COUNT(DISTINCT user_id)::int AS member_count
         FROM user_steam_groups
         GROUP BY group_id
         HAVING COUNT(DISTINCT user_id) >= 2
         ORDER BY member_count DESC
         LIMIT 5`
      )
    ]);

    const recentStr = recentlyPlayedResult.rows
      .map((r) => `${r.game_name}(${Math.round((r.playtime_2weeks / 60) * 10) / 10}h)`)
      .join(" ");

    const activeOwnedStr = topActiveOwnedResult.rows
      .map((r) => `${r.game_name}(${r.owners})`)
      .join(" ");

    const wishlistStr = topWishlistedResult.rows
      .map((r) => `${r.game_name}(${r.wishlisters})`)
      .join(" ");

    const tagPrefStr = tagPreferenceResult.rows.map((r) => r.tag).join(", ");

    const completionStr = completionResult.rows
      .map((r) => `${r.game_name}(${r.avg_completion}% over ${r.tracked})`)
      .join(" ");

    const groupsStr = sharedGroupsResult.rows
      .map((r) => `${r.group_name ?? `gid:${r.group_id}`}(${r.member_count})`)
      .join(" ");

    // Batch-derived tag pool retained as fallback — kept secondary now that
    // playtime-weighted preference exists.
    const allTags = result.rows.flatMap((r) => r.tags);
    const batchTags = [...new Set(allTags)].slice(0, 10).join(", ");

    const crewContext = [
      recentStr ? `Played this week: ${recentStr}` : null,
      activeOwnedStr ? `Active library (owned + played): ${activeOwnedStr}` : null,
      wishlistStr ? `Wishlisted: ${wishlistStr}` : null,
      tagPrefStr ? `Genre preference (playtime-weighted): ${tagPrefStr}` : null,
      completionStr ? `Crew completion: ${completionStr}` : null,
      groupsStr ? `Shared Steam groups: ${groupsStr}` : null,
      batchTags ? `Batch tags: ${batchTags}` : null
    ]
      .filter(Boolean)
      .join("\n");

    let curated: CurationResult[] = [];
    try {
      curated = await callAIForCuration(result.rows, crewContext);
    } catch (err) {
      if (err instanceof AIDisabledError || err instanceof AINotConfiguredError) {
        return 0;
      }
      console.error("[newsCurator] AI curation failed:", err);
      return 0;
    }

    const VALID_LABELS = new Set(["personal", "community", "top_news"]);

    // Write results back; skip items the AI flagged as duplicate (absorbed by a better source)
    let count = 0;
    for (const item of curated) {
      if (!item.gid) continue;
      if (item.duplicate) {
        // Mark as curated with score 0 so it doesn't re-enter the un-curated queue
        await db.query(
          `UPDATE game_news SET ai_relevance_score = 0, ai_summary = NULL, ai_curated_at = NOW() WHERE gid = $1`,
          [item.gid]
        );
        continue;
      }

      const score = Math.min(1, Math.max(0, item.relevanceScore ?? 0));
      const summary = (item.summary ?? "").trim().slice(0, 800);
      const label = VALID_LABELS.has(item.label ?? "") ? item.label! : null;
      const spoilerWarning = item.spoilerWarning === true;

      await db.query(
        `
          UPDATE game_news
          SET ai_relevance_score  = $1,
              ai_summary          = $2,
              ai_label            = $3,
              ai_spoiler_warning  = $4,
              ai_curated_at       = NOW()
          WHERE gid = $5
        `,
        [score, summary, label, spoilerWarning, item.gid]
      );
      count++;
    }

    return count;
  } finally {
    curationInFlight = false;
  }
}

/**
 * Re-curates all items for the given apps, including already-curated ones.
 * Intended for the admin "Re-curate News" action.
 */
export async function forceCurateNews(appIds: number[]): Promise<number> {
  if (appIds.length === 0) return 0;

  // Reset curation status so curateUncuratedNews picks them up
  await db.query(
    `UPDATE game_news SET ai_curated_at = NULL WHERE app_id = ANY($1::int[])`,
    [appIds]
  );

  return curateUncuratedNews(appIds);
}
