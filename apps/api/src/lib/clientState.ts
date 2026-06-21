import { z } from "zod";
import { db } from "../db/client.js";

/** Bump this to re-show the onboarding flow for all members. */
export const CURRENT_ONBOARDING_VERSION = 1;

/**
 * Per-key zod schemas that define the shape the API will accept.
 * Adding a new key here automatically adds it to ALLOWED_CLIENT_STATE_KEYS.
 */
export const CLIENT_STATE_SCHEMAS = {
  onboarding_version: z.number().int().min(0).max(1000),
  forum_intro_seen: z.boolean(),
  steam_share_ack: z.boolean(),
  theme_pref: z.enum(["auto", "day", "night"]),
  last_unlock_seen_at: z.string().max(40), // ISO timestamp
  activity_last_seen_at: z.number().int().min(0),
} as const;

export type ClientStateKey = keyof typeof CLIENT_STATE_SCHEMAS;

/**
 * Keys the API will accept via PUT /profile/client-state.
 * Derived from CLIENT_STATE_SCHEMAS — add/remove keys there, not here.
 */
export const ALLOWED_CLIENT_STATE_KEYS = new Set(Object.keys(CLIENT_STATE_SCHEMAS));

/**
 * Return all client-state rows for a user as a plain object.
 * Absent keys are simply missing from the object (caller should use ?? default).
 */
export async function getClientState(userId: bigint): Promise<Record<string, unknown>> {
  const result = await db.query<{ key: string; value: unknown }>(
    `SELECT key, value FROM user_client_state WHERE user_id = $1`,
    [userId]
  );
  const out: Record<string, unknown> = {};
  for (const row of result.rows) {
    out[row.key] = row.value;
  }
  return out;
}

/**
 * Upsert a single key for a user.  The value must already be a JSON-
 * serialisable type; pass it as-is and pg will cast via the JSONB column.
 */
export async function setClientState(
  userId: bigint,
  key: string,
  value: unknown
): Promise<void> {
  await db.query(
    `
      INSERT INTO user_client_state (user_id, key, value, updated_at)
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (user_id, key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `,
    [userId, key, JSON.stringify(value)]
  );
}
