import { apiFetch } from "./client.js";
import type { ClientStateKey } from "./clientStateKeys.js";

/**
 * Best-effort upsert of one key in the caller's user_client_state table.
 * Fire-and-forget: errors are swallowed so callers don't need to await.
 */
export function putClientState(key: ClientStateKey, value: unknown): Promise<void> {
  return apiFetch("/profile/client-state", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, value }),
  })
    .catch(() => undefined)
    .then(() => undefined);
}
