import { db } from "../db/client.js";
import { broadcast } from "./eventBus.js";
import { isGameShareableByUserId } from "./steamPrivacy.js";

export type ActivityEventInput = {
  eventType: string;
  actorDiscordUserId?: string | null;
  targetDiscordUserId?: string | null;
  targetAppId?: number | null;
  targetGameNightId?: number | null;
  payload?: Record<string, unknown>;
};

async function resolveInternalUserId(discordUserId: string | null | undefined): Promise<number | null> {
  if (!discordUserId) return null;
  const result = await db.query<{ id: number }>(
    `SELECT id FROM users WHERE discord_user_id = $1 LIMIT 1`,
    [discordUserId]
  );
  return result.rows[0]?.id ?? null;
}

export async function recordEvent(input: ActivityEventInput): Promise<void> {
  try {
    const [actorId, targetId] = await Promise.all([
      resolveInternalUserId(input.actorDiscordUserId ?? null),
      resolveInternalUserId(input.targetDiscordUserId ?? null)
    ]);

    // Privacy (never-emit): a steam-derived, game-tied event for a game the
    // actor has hidden (private library OR per-game exclusion) is never written.
    // No latent row to leak even if read-time filters are later missed.
    if (
      input.targetAppId != null &&
      actorId != null &&
      (input.eventType.startsWith("steam.") || input.eventType.startsWith("achievement.steam"))
    ) {
      const shareable = await isGameShareableByUserId(actorId, input.targetAppId);
      if (!shareable) return;
    }

    await db.query(
      `
        INSERT INTO activity_events (
          event_type,
          actor_user_id,
          target_user_id,
          target_app_id,
          target_game_night_id,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        input.eventType,
        actorId,
        targetId,
        input.targetAppId ?? null,
        input.targetGameNightId ?? null,
        JSON.stringify(input.payload ?? {})
      ]
    );
    // Nudge connected SSE clients to refetch the activity feed so the Home feed
    // and the achievement/milestone celebration overlay fire the moment an event
    // is recorded (in lockstep with the Discord announcement), rather than on the
    // next slow poll. Carry the eventType + actor so a client can decide quickly.
    broadcast("activity-changed", {
      eventType: input.eventType,
      actorDiscordUserId: input.actorDiscordUserId ?? null
    });
  } catch (error) {
    console.error("[activityEvents] recordEvent failed", error);
  }
}
