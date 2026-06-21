import { env } from "../config.js";
import { db } from "../db/client.js";
import { recordEvent } from "./activityEvents.js";

type SettingRow = {
  key: string;
  value: string;
  label: string;
  description: string | null;
  is_secret: boolean;
  updated_at: string;
};

// In-memory cache — refreshed at startup and after every write
let cachedRows: SettingRow[] = [];
let loadedOnce = false;

export async function loadSettings(): Promise<void> {
  const result = await db.query<SettingRow>(
    "SELECT key, value, label, description, is_secret, updated_at FROM server_settings ORDER BY key"
  );
  cachedRows = result.rows;
  loadedOnce = true;
}

/** Reload only if the cache was never successfully populated (e.g. table didn't exist at startup). */
export async function ensureSettingsLoaded(): Promise<void> {
  if (!loadedOnce) {
    await loadSettings();
  }
}

function cached(key: string): string {
  return cachedRows.find((r) => r.key === key)?.value ?? "";
}

// Synchronous getters — safe to call in any route handler
export function getGuildId(): string {
  return cached("discord_guild_id") || env.DISCORD_GUILD_ID;
}

export function getParentRoleName(): string {
  return cached("parent_role_name") || env.PARENT_ROLE_NAME;
}

/** Returns the raw (unmasked) value for a setting key, or null if not found. */
export function getAISetting(key: string): string | null {
  const row = cachedRows.find((r) => r.key === key);
  return row ? row.value : null;
}

// ── Public shape sent to the admin UI ────────────────────────────────────────

export type PublicSetting = {
  key: string;
  value: string;
  label: string;
  description: string | null;
  isSecret: boolean;
  /** The env-var fallback so the UI can show what will be used when DB value is blank */
  envDefault: string;
  updatedAt: string;
};

const ENV_DEFAULTS: Record<string, string> = {
  discord_guild_id: env.DISCORD_GUILD_ID || "(not set in environment)",
  guild_display_name: "",
  parent_role_name: env.PARENT_ROLE_NAME || "(not set in environment)",
  ai_provider: "",
  ai_model: "",
  ai_enabled: "",
  ai_api_key: ""
};

export function getPublicSettings(): PublicSetting[] {
  return cachedRows.map((row) => ({
    key: row.key,
    value: row.is_secret && row.value ? "••••••••" : row.value,
    label: row.label,
    description: row.description,
    isSecret: row.is_secret,
    envDefault: ENV_DEFAULTS[row.key] ?? "",
    updatedAt: row.updated_at
  }));
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function upsertSetting(
  key: string,
  value: string,
  discordUserId: string
): Promise<void> {
  const userResult = await db.query<{ id: string }>(
    "SELECT id FROM users WHERE discord_user_id = $1",
    [discordUserId]
  );
  const userId = userResult.rows[0]?.id ?? null;

  const trimmed = value.trim();

  // Never overwrite a secret field with the masked placeholder
  const row = cachedRows.find((r) => r.key === key);
  if (row?.is_secret && trimmed === "••••••••") {
    return;
  }

  // For secret fields, skip the update entirely when the caller sends an empty string
  // (empty = "keep existing value")
  if (row?.is_secret && trimmed === "") {
    return;
  }

  const previous = row?.value ?? "";
  const displayOld = row?.is_secret ? "[secret]" : previous;
  const displayNew = row?.is_secret ? "[secret]" : trimmed;

  await db.query(
    `UPDATE server_settings
     SET value = $1, updated_at = NOW(), updated_by_user_id = $3
     WHERE key = $2`,
    [trimmed, key, userId]
  );

  if (displayOld !== displayNew) {
    void recordEvent({
      eventType: "admin.settings_changed",
      actorDiscordUserId: discordUserId,
      payload: { key, oldValue: displayOld, newValue: displayNew },
    });
  }

  // Refresh the in-memory cache immediately so the next request sees the new value
  await loadSettings();
}
