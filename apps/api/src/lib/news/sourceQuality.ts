import { db } from "../../db/client.js";

export async function recordSourceFetchSuccess(sourceId: string, itemCount: number): Promise<void> {
  await db.query(
    `UPDATE news_source_registry
        SET last_fetched_at = NOW(),
            last_success_at = NOW(),
            last_error = NULL,
            fail_streak = 0,
            items_fetched_total = items_fetched_total + $2,
            updated_at = NOW()
      WHERE id = $1`,
    [sourceId, Math.max(0, itemCount)]
  );
}

export async function recordSourceFetchError(sourceId: string, error: string): Promise<void> {
  await db.query(
    `UPDATE news_source_registry
        SET last_error = $2,
            fail_streak = fail_streak + 1,
            updated_at = NOW()
      WHERE id = $1`,
    [sourceId, error.slice(0, 500)]
  );
}

export async function recordSourceCurated(sourceName: string): Promise<void> {
  await db.query(
    `UPDATE news_source_registry
        SET items_curated_total = items_curated_total + 1,
            updated_at = NOW()
      WHERE name = $1`,
    [sourceName]
  );
}

export async function recordSourceValidationFail(sourceName: string): Promise<void> {
  await db.query(
    `UPDATE news_source_registry
        SET validation_fail_total = validation_fail_total + 1,
            updated_at = NOW()
      WHERE name = $1`,
    [sourceName]
  );
}
