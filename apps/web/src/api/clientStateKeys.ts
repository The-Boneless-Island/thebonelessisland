/**
 * Typed union of all allowed client-state keys.
 * Must stay in sync with CLIENT_STATE_SCHEMAS in apps/api/src/lib/clientState.ts.
 * Using a typed key for putClientState prevents typos that would silently 400.
 */
export type ClientStateKey =
  | "onboarding_version"
  | "forum_intro_seen"
  | "steam_share_ack"
  | "theme_pref"
  | "last_unlock_seen_at"
  | "activity_last_seen_at";
