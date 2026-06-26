import { db } from "../../db/client.js";
import { getAISetting } from "../serverSettings.js";
import { countMissingEmbeddings, resolveEmbeddingBackend } from "./embeddings.js";
import { getFeedFreshnessDays } from "./newsRetention.js";

export type NewsPipelineDiagnostics = {
  totals: {
    articles: number;
    liveCards: number;
    uncurated: number;
    validationFailures: number;
    preFiltered: number;
    embeddingsMissing: number;
  };
  uncuratedByAge: {
    withinCurationWindow: number;
    outsideCurationWindow: number;
    oldestPublishedAt: string | null;
    newestPublishedAt: string | null;
  };
  ai: {
    enabled: boolean;
    provider: string;
    embeddingBackend: string;
  };
  settings: {
    curationWindowDays: number;
    feedFreshnessDays: number;
    ingestMaxAgeDays: number;
  };
  likelyCause: string;
  suggestedAction: string;
};

const CURATION_WINDOW_DAYS = 14;

export function getIngestMaxAgeDays(): number {
  const raw = getAISetting("news_ingest_max_age_days");
  const n = parseInt(raw ?? "", 10);
  if (Number.isFinite(n) && n > 0) return n;
  // Default: match the auto-curation window so we don't ingest rows we'll never curate.
  return CURATION_WINDOW_DAYS;
}

export async function getNewsPipelineDiagnostics(): Promise<NewsPipelineDiagnostics> {
  const [row, embeddingsMissing] = await Promise.all([
    db.query<{
      articles: string;
      live: string;
      uncurated: string;
      failed: string;
      pre_filtered: string;
      uncurated_in_window: string;
      uncurated_outside_window: string;
      oldest: string | null;
      newest: string | null;
    }>(
      `
        SELECT
          COUNT(*)::text AS articles,
          COUNT(*) FILTER (
            WHERE ai_curated_at IS NOT NULL
              AND ai_relevance_score > 0
              AND ai_validation_failed = FALSE
          )::text AS live,
          COUNT(*) FILTER (WHERE ai_curated_at IS NULL)::text AS uncurated,
          COUNT(*) FILTER (WHERE ai_validation_failed = TRUE)::text AS failed,
          COUNT(*) FILTER (WHERE pre_filter_reason IS NOT NULL)::text AS pre_filtered,
          COUNT(*) FILTER (
            WHERE ai_curated_at IS NULL
              AND published_at > NOW() - ($1::text || ' days')::interval
          )::text AS uncurated_in_window,
          COUNT(*) FILTER (
            WHERE ai_curated_at IS NULL
              AND published_at <= NOW() - ($1::text || ' days')::interval
          )::text AS uncurated_outside_window,
          MIN(published_at) FILTER (WHERE ai_curated_at IS NULL)::text AS oldest,
          MAX(published_at) FILTER (WHERE ai_curated_at IS NULL)::text AS newest
        FROM general_news
      `,
      [String(CURATION_WINDOW_DAYS)]
    ),
    countMissingEmbeddings()
  ]);

  const r = row.rows[0];
  const articles = parseInt(r?.articles ?? "0", 10);
  const uncurated = parseInt(r?.uncurated ?? "0", 10);
  const uncuratedOutside = parseInt(r?.uncurated_outside_window ?? "0", 10);
  const uncuratedInside = parseInt(r?.uncurated_in_window ?? "0", 10);
  const validationFailures = parseInt(r?.failed ?? "0", 10);
  const liveCards = parseInt(r?.live ?? "0", 10);

  let likelyCause = "Pipeline looks normal.";
  let suggestedAction = "Use Triggers → Fetch & Curate if the feed looks stale.";

  if (articles > 5000 && uncuratedOutside > uncuratedInside) {
    likelyCause =
      "Most backlog rows are older than the 14-day curation window — auto-curate and manual Curate skip them.";
    suggestedAction =
      "Admin → Archive → Scrub the archive (do NOT use Regenerate All Summaries on a huge backlog). Then Fetch & Curate.";
  } else if (uncurated > 500 && uncuratedOutside > 500) {
    likelyCause = "Large stale backlog outside the 14-day curation window.";
    suggestedAction =
      "Archive → Retire stale backlog (or Scrub the archive), then Fetch & Curate — avoid Regenerate All Summaries.";
  } else if (validationFailures > 50 && liveCards < validationFailures * 0.2) {
    likelyCause = "Many rows failed AI validation — curator output isn't passing schema checks.";
    suggestedAction = "Check Validation tab errors, verify AI provider/model, then Scrub or retire stale rows.";
  } else if (uncurated > 200 && uncuratedInside > 0 && liveCards < 10) {
    likelyCause = "Recent articles are ingested but curation isn't producing live cards.";
    suggestedAction = "Check AI enabled + provider, then Triggers → Curate Existing (or Fetch & Curate).";
  } else if (articles > 8000 && uncurated > 8000) {
    likelyCause = "Corpus was never cleared — scrub may not have run, or Regenerate All Summaries reset curation on the full historical corpus.";
    suggestedAction = "Archive → Scrub the archive with fetch-after checked. Do not run Regenerate All Summaries until the corpus is small.";
  }

  return {
    totals: {
      articles,
      liveCards,
      uncurated,
      validationFailures,
      preFiltered: parseInt(r?.pre_filtered ?? "0", 10),
      embeddingsMissing
    },
    uncuratedByAge: {
      withinCurationWindow: uncuratedInside,
      outsideCurationWindow: uncuratedOutside,
      oldestPublishedAt: r?.oldest ?? null,
      newestPublishedAt: r?.newest ?? null
    },
    ai: {
      enabled: getAISetting("ai_enabled") === "true",
      provider: getAISetting("ai_provider") ?? "unknown",
      embeddingBackend: resolveEmbeddingBackend()
    },
    settings: {
      curationWindowDays: CURATION_WINDOW_DAYS,
      feedFreshnessDays: getFeedFreshnessDays(),
      ingestMaxAgeDays: getIngestMaxAgeDays()
    },
    likelyCause,
    suggestedAction
  };
}
