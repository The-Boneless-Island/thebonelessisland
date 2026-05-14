// Registry of news providers, keyed by NewsSourceRow.kind. The ingestion
// orchestrator looks up `PROVIDERS[row.kind]` and dispatches the row.
//
// To add a new provider:
//   1. Implement NewsProvider in a new file under this directory.
//   2. Add the kind to the SourceKind union in ./types.ts.
//   3. Add the kind to the CHECK constraint in a follow-up migration.
//   4. Register it here.
//   5. Add curated seed rows in ../curatedSources.ts if applicable.

import { gnewsProvider } from "./gnews.js";
import { redditProvider } from "./reddit.js";
import { rssProvider } from "./rss.js";
import { NewsProvider, SourceKind } from "./types.js";
import { youtubeProvider } from "./youtube.js";

export const PROVIDERS: Record<SourceKind, NewsProvider> = {
  rss: rssProvider,
  reddit: redditProvider,
  youtube: youtubeProvider,
  gnews: gnewsProvider,
};

export type { NewsProvider, NewsSourceRow, FeedItem, FetchContext, SourceKind } from "./types.js";
