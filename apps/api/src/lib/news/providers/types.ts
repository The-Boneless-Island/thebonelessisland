// Shared types for the news-provider abstraction. Each provider implements
// NewsProvider; the ingestion orchestrator iterates news_source_registry rows
// and dispatches each row to PROVIDERS[row.kind].

export type SourceKind = "rss" | "reddit" | "youtube" | "gnews";

/** Database row shape from news_source_registry. */
export type NewsSourceRow = {
  id: string;          // bigserial returned as text by pg
  kind: SourceKind;
  slug: string;
  name: string;
  identifier: string;
  enabled: boolean;
  is_preset: boolean;
  config: Record<string, unknown>;
  last_fetched_at: string | null;
  last_error: string | null;
  last_success_at?: string | null;
  fail_streak?: number;
  items_fetched_total?: number;
  items_curated_total?: number;
  validation_fail_total?: number;
};

/** Crew context passed to every provider for relevance tagging. */
export type FetchContext = {
  crewTags: string[];
  gameNames: string[];
  /** Optional cap — providers should honor this when returning a test preview. */
  limit?: number;
};

/** Normalized news item — same shape across providers. Mirrors the local
 *  FeedItem in generalNewsIngestion.ts. Provider returns these and the
 *  orchestrator upserts them into general_news. */
export type FeedItem = {
  sourceType: SourceKind | "newsapi"; // "newsapi" retained for legacy gnews rows
  sourceName: string;
  externalId: string;                 // URL or stable provider-specific id; dedup key
  title: string;
  url: string;
  contents: string | null;
  author: string | null;
  imageUrl: string | null;
  publishedAt: Date;
  matchedTags: string[];
};

export interface NewsProvider {
  readonly kind: SourceKind;
  /** Returns null if the provider can run, or a short reason string when a
   *  credential / config is missing. Cheap pre-check before fetch(). */
  readinessGate(): string | null;
  fetch(source: NewsSourceRow, ctx: FetchContext): Promise<FeedItem[]>;
}
