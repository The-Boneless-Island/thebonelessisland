/**
 * EmbeddingProvider — thin interface for embedding backends.
 *
 * Mirrors the AIProvider shape so the factory pattern in index.ts carries over
 * naturally. Each implementation:
 *   - Validates that the returned vector is exactly EMBEDDING_DIM long.
 *   - Records cost via recordAiCost.
 *   - Returns null on any failure (network error, wrong dim, missing key).
 */

export interface EmbeddingProvider {
  /** Human-readable backend name used in logs and admin health UI. */
  readonly name: string;
  /**
   * Embed a piece of text and return a float vector of exactly EMBEDDING_DIM
   * dimensions, or null when embedding is not possible.
   */
  embed(text: string): Promise<number[] | null>;
}
