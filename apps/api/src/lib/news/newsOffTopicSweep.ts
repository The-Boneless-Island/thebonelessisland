import { db } from "../../db/client.js";
import { AIDisabledError, AINotConfiguredError, getAIProviderForTask } from "../ai/index.js";
import { loadPipelineJob, savePipelineJob } from "./newsPipelineJobs.js";

// One-shot retroactive quality sweep (2026-07). Two goals, run once per deploy:
//   1. Park AI-judged off-topic live cards that leaked in under the old prompt
//      (the pre-off-topic-gate curator forced a connection to every story).
//   2. Re-queue thin recent summaries so the new full-context prompt regenerates
//      them.
// Self-guarding via a news_pipeline_jobs row (kind "offtopic_sweep"): once the
// job reaches "done" at the current SWEEP_VERSION it never runs again; a
// crashed/errored run may re-run on the next boot, and bumping SWEEP_VERSION in
// a later deploy re-runs the sweep once under the improved logic. Admins can
// also force a run via POST /news/general/off-topic-sweep.

// Bump to re-run the sweep once on the next deploy (e.g. after improving the
// classifier). v2: numeric row ids for verdict matching + named leak examples.
const SWEEP_VERSION = 2;
const SWEEP_BATCH_SIZE = 20;
// 20 verdicts × long URL ids can pass 1500 tokens; a truncated array fails the
// parse and silently skips the whole batch, so leave generous headroom.
const CLASSIFIER_MAX_TOKENS = 3000;

type LiveCard = {
  id: number;
  external_id: string;
  title: string;
  ai_subtitle: string | null;
  summary_head: string;
};

type ClassifierVerdict = { id: string; gaming: boolean };

const CLASSIFIER_SYSTEM_PROMPT = `You are a strict classifier for a video-gaming news feed. For each card, decide whether its CORE SUBJECT is gaming.

IN SCOPE (gaming: true): video games on any platform; game studios/publishers/developers; announcements, patches, DLC, releases, delays; gaming hardware (consoles, handhelds, GPUs, peripherals) framed for gaming; game storefronts/launchers/subscription services; esports; game-industry business (layoffs, acquisitions, earnings of game companies); modding; game-development tech when the story is about making games; gaming-adjacent platforms (Steam, Discord, Twitch, Xbox/PlayStation/Nintendo services) when they materially affect how people play or gather around games.

OUT OF SCOPE (gaming: false): general tech/AI/internet-infrastructure news with no direct, material gaming consequence; movies/TV/streaming (including fan art or artist tributes to non-game films); digital-art or CG showcases that aren't about game development; phones, EVs, crypto, science, politics, celebrity news; business news of non-gaming companies.

Two real examples that are NOT gaming (both leaked into this feed before):
- "Artist Creates Immersive and Beautiful Tribute to Disney's Coco" — fan art of a film; still not gaming even though it is digital art from a game-art site.
- "Cloudflare to Filter Web Crawlers Serving AI Companies" — internet infrastructure; a hypothetical "could affect gaming wikis" link does not make it gaming.

When uncertain, return gaming: true — only flag CLEAR non-gaming stories. Do not manufacture a gaming link to keep a story.

Return ONLY a JSON array, one object per input card, no prose:
[{"id": "<id>", "gaming": true}]`;

/** Locate the first balanced JSON array and parse it defensively. */
function parseClassifierArray(text: string): ClassifierVerdict[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const obj = row as Record<string, unknown>;
      const id = typeof obj.id === "string" ? obj.id : String(obj.id ?? "");
      if (!id) return [];
      return [{ id, gaming: obj.gaming === true || obj.gaming === "true" }];
    });
  } catch {
    return [];
  }
}

/**
 * One-shot post-deploy off-topic sweep. All errors caught internally — safe to
 * fire-and-forget. Marks its pipeline job "done" only on a clean completion so a
 * crash re-runs on the next boot. `force: true` (admin endpoint) ignores the
 * run-once guard — the sweep is idempotent, a forced re-run just costs AI calls.
 */
export async function runOffTopicSweepOnce(opts: { force?: boolean } = {}): Promise<void> {
  try {
    // Guard: skip once a prior run reached "done" at (or above) this version.
    const prior = await loadPipelineJob<{ version?: number }>("offtopic_sweep");
    if (!opts.force && prior?.state === "done" && (prior.progress?.version ?? 0) >= SWEEP_VERSION) {
      return;
    }

    // Bail quietly (without marking done) when AI is disabled/unconfigured — a
    // later boot with AI enabled will retry.
    try {
      getAIProviderForTask("light");
    } catch (err) {
      if (err instanceof AIDisabledError || err instanceof AINotConfiguredError) {
        console.log("[generalNews] off-topic sweep skipped — AI unavailable");
        return;
      }
      throw err;
    }

    await savePipelineJob(
      "offtopic_sweep",
      "running",
      { version: SWEEP_VERSION },
      { startedAt: new Date(), finishedAt: null, error: null }
    );

    const cards = await db.query<LiveCard>(
      `
        SELECT id,
               external_id,
               COALESCE(ai_title, title) AS title,
               ai_subtitle,
               LEFT(COALESCE(ai_summary, ''), 400) AS summary_head
          FROM general_news
         WHERE ai_curated_at IS NOT NULL
           AND ai_relevance_score > 0
           AND ai_validation_failed = FALSE
           AND ai_summary IS NOT NULL
           AND retention_tier IN ('hot', 'warm')
           AND published_at > NOW() - INTERVAL '90 days'
      `
    );

    let scanned = 0;
    let parked = 0;
    const ai = getAIProviderForTask("light");

    for (let i = 0; i < cards.rows.length; i += SWEEP_BATCH_SIZE) {
      const batch = cards.rows.slice(i, i + SWEEP_BATCH_SIZE);
      scanned += batch.length;
      // Numeric row ids as classifier ids: short and reliably echoed back.
      // v1 used the URL external_id and long URLs risk echo drift — a mismatch
      // silently keeps the card (conservative, but defeats the sweep).
      const payload = batch.map((c) => ({
        id: String(c.id),
        title: c.title,
        subtitle: c.ai_subtitle ?? "",
        summaryHead: c.summary_head
      }));

      try {
        const result = await ai.complete(
          [
            { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
            {
              role: "user",
              content: `Classify these cards. Return ONLY the JSON array.\n\n${JSON.stringify(payload, null, 2)}`
            }
          ],
          { maxTokens: CLASSIFIER_MAX_TOKENS, temperature: 0 }
        );
        const verdicts = parseClassifierArray(result.text);
        const nonGaming = new Set(
          verdicts.filter((v) => !v.gaming).map((v) => v.id.trim())
        );
        const parkIds = batch.filter((c) => nonGaming.has(String(c.id))).map((c) => c.id);
        if (parkIds.length > 0) {
          // ai_curated_at stays set so parked rows never re-enter the queue.
          await db.query(
            `UPDATE general_news
                SET ai_relevance_score = 0,
                    ai_summary = NULL,
                    pre_filter_reason = 'off_topic_ai_sweep'
              WHERE id = ANY($1::int[])`,
            [parkIds]
          );
          parked += parkIds.length;
          console.log(
            `[generalNews] off-topic sweep parked ${parkIds.length} card(s): ${batch
              .filter((c) => nonGaming.has(String(c.id)))
              .map((c) => c.external_id)
              .join(" | ")}`
          );
        }
      } catch (err) {
        console.warn(
          "[generalNews] off-topic sweep batch failed (rows left as-is):",
          err instanceof Error ? err.message : err
        );
      }
    }

    // Re-queue thin recent cards for regeneration under the new full-context
    // prompt. Runs AFTER the park step so freshly-parked rows aren't re-queued.
    // The 14-day window matches CLUSTER_WINDOW so the normal pipeline picks them
    // up.
    const requeue = await db.query<{ id: number }>(
      `
        UPDATE general_news
           SET ai_curated_at = NULL,
               ai_validation_failed = FALSE,
               ai_last_validation_errors = NULL,
               ai_retry_count = 0
         WHERE ai_curated_at IS NOT NULL
           AND ai_relevance_score > 0
           AND ai_summary IS NOT NULL
           AND LENGTH(TRIM(ai_summary)) < 700
           AND published_at > NOW() - INTERVAL '14 days'
           AND retention_tier IN ('hot', 'warm')
        RETURNING id
      `
    );
    const requeued = requeue.rowCount ?? 0;

    await savePipelineJob(
      "offtopic_sweep",
      "done",
      { version: SWEEP_VERSION, scanned, parked, requeued },
      { finishedAt: new Date(), error: null }
    );
    console.log(
      `[generalNews] off-topic sweep done: scanned=${scanned}, parked=${parked}, requeued=${requeued}`
    );

    // Drain the re-queued rows now instead of a single kick: the per-pass pool
    // is small (~18 rows), so one pass can strand the rest invisible (re-queued
    // rows have ai_curated_at NULL and drop out of the feed) until some later
    // trigger. Loop until the curator reports nothing left, bounded. A return
    // of 0 also covers the lock-busy case (the queue worker owns it then).
    // No import cycle: generalNewsIngestion does not import this file.
    if (requeued > 0) {
      const { curateUncuratedGeneralNews } = await import("../generalNewsIngestion.js");
      void (async () => {
        for (let pass = 0; pass < 20; pass++) {
          const curated = await curateUncuratedGeneralNews({ reportRun: false });
          if (curated === 0) break;
        }
      })().catch((err) => {
        console.error("[generalNews] off-topic sweep post-curation failed:", err);
      });
    }
  } catch (err) {
    // Leave the job in "running" (or absent) so the next boot retries.
    console.error(
      "[generalNews] off-topic sweep failed:",
      err instanceof Error ? err.message : err
    );
  }
}
