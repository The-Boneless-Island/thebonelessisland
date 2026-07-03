// Shared presence-status helpers — used by Community and UserMenu so a
// member's status dot/label and headline text never diverge between the
// crew-facing card and the self-facing menu.
import { islandTheme } from "../theme.js";
import type { PresenceStatus } from "../types.js";

export type PresenceLike = {
  inVoice: boolean;
  presenceStatus: PresenceStatus | null;
  richPresenceText?: string | null;
};

/** Status label + dot color, in priority order: in-voice > online > idle > dnd > offline. */
export function statusOf(m: PresenceLike): { label: string; color: string } {
  if (m.inVoice) return { label: "live", color: islandTheme.color.dangerAccent };
  if (m.presenceStatus === "online") return { label: "online", color: islandTheme.color.successAccent };
  if (m.presenceStatus === "idle") return { label: "idle", color: islandTheme.palette.sandWarmAccent };
  if (m.presenceStatus === "dnd") return { label: "dnd", color: islandTheme.color.dangerAccent };
  return { label: "offline", color: islandTheme.color.textMuted };
}

/** Human-readable presence line: rich presence text > voice > status word. */
export function presenceTextOf(m: PresenceLike): string {
  if (m.richPresenceText) return m.richPresenceText;
  if (m.inVoice) return "In voice";
  if (m.presenceStatus === "online") return "Online";
  if (m.presenceStatus === "idle") return "Idle";
  if (m.presenceStatus === "dnd") return "Do not disturb";
  return "Offline";
}
