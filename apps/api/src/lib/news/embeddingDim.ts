/**
 * Single source of truth for the embedding vector dimensionality.
 *
 * Kept in a tiny module so it can be imported by both:
 *   - apps/api/src/lib/news/embeddings.ts (public EMBEDDING_DIM export)
 *   - apps/api/src/lib/ai/embeddings/*.ts  (providers need it for validation)
 *
 * This avoids a circular import between the ai/ and news/ trees.
 *
 * Changing this value requires:
 *   1. A new DB migration that drops + re-creates the embedding column.
 *   2. A full re-embed of all rows via backfillEmbeddings().
 */
export const EMBEDDING_DIM = 3072;
