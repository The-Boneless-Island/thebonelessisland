/**
 * Shared, data-level formatter for activity_events rows shown on member-facing
 * surfaces (Community feed, Home feed default arm, islander profile "Recent
 * Activity"). Each caller adapts the {emoji, action, target, detail} shape to
 * its own rendering — this module owns *what the copy says*, not how it's laid
 * out. Reuses activityEventCopy.ts's Title-Case humanizer as the universal
 * fallback so a raw dotted event kind is never surfaced to a member.
 *
 * Every payload field read here is guarded (typeof/defined checks) because
 * some rows are legacy: backfilled milestone.reached rows may lack `key`,
 * old achievement rows may lack `emoji`, etc.
 */

import { activityEventLabel } from "./activityEventCopy.js";
import { casinoGameLabel } from "./nuggiesTransactionCopy.js";

export type ActivityFeedEventInput = {
  eventType: string;
  payload: Record<string, unknown>;
  /** Optional resolved game name (from a joined `games` row), preferred over payload.gameName when present. */
  gameName?: string | null;
};

export type ActivityFeedCopy = {
  emoji: string;
  action: string;
  target: string | null;
  detail: string | null;
};

const FALLBACK_EMOJI = "✨";
const ACHIEVEMENT_FALLBACK_EMOJI = "🏆";
const MILESTONE_FALLBACK_EMOJI = "⭐";

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function money(amount: number): string {
  return `₦${Math.abs(amount).toLocaleString("en-US")}`;
}

/**
 * Describe one activity_events row for member-facing surfaces. The default
 * arm (any kind not explicitly handled below, including future/unknown ones)
 * always builds copy via activityEventLabel's Title-Case humanizer — it never
 * returns the raw dotted event kind string to a caller.
 */
export function describeActivityFeedEvent(event: ActivityFeedEventInput): ActivityFeedCopy {
  const { eventType, payload: p } = event;
  const gameName = event.gameName ?? str(p.gameName);

  switch (eventType) {
    case "game_night.created":
      return {
        emoji: "🌴",
        action: "scheduled",
        target: str(p.title) ?? "a game night",
        detail: "Hosting the next session",
      };
    case "game_night.rsvp_joined":
      return {
        emoji: "🪵",
        action: "RSVP'd to",
        target: "the next game night",
        detail: "On the invite list",
      };
    case "game_night.rsvp_left":
      return {
        emoji: "🌫",
        action: "stepped away from",
        target: "the next game night",
        detail: "Off the dock for now",
      };
    case "game_night.game_picked":
      return {
        emoji: "🎯",
        action: "picked",
        target: gameName ?? "a game",
        detail: "Locked in for the next session",
      };
    case "game_night.admin_updated":
      return {
        emoji: "🛠️",
        action: "updated",
        target: str(p.title) ?? "a game night",
        detail: "Admin edit",
      };
    case "game_night.admin_deleted":
      return {
        emoji: "🗑️",
        action: "deleted",
        target: str(p.title) ?? "a game night",
        detail: "Admin removal",
      };
    case "steam.linked":
      return {
        emoji: "🔗",
        action: "linked",
        target: "their Steam account",
        detail: "Library now visible to the crew",
      };
    case "steam.unlinked":
      return {
        emoji: "🪢",
        action: "unlinked",
        target: "their Steam account",
        detail: "Library hidden from the crew",
      };
    case "steam.synced": {
      const synced = num(p.syncedGames) ?? 0;
      return {
        emoji: "🔄",
        action: "resynced",
        target: "their library",
        detail: `${synced} game${synced === 1 ? "" : "s"} on the boat`,
      };
    }
    case "achievement.steam_progress": {
      const delta = num(p.unlockedDelta) ?? 0;
      const game = gameName ?? "a game";
      return {
        emoji: ACHIEVEMENT_FALLBACK_EMOJI,
        action: "unlocked",
        target: `${delta} achievement${delta === 1 ? "" : "s"} in ${game}`,
        detail: "Steam progress on the island",
      };
    }
    case "achievement.unlocked": {
      const name = str(p.name) ?? "an achievement";
      const emoji = str(p.emoji) ?? ACHIEVEMENT_FALLBACK_EMOJI;
      return {
        emoji,
        action: "unlocked",
        target: name,
        detail: "Island achievement",
      };
    }
    case "milestone.reached": {
      const label = str(p.label) ?? str(p.tierLabel) ?? "a new milestone";
      const emoji = str(p.emoji) ?? MILESTONE_FALLBACK_EMOJI;
      const threshold = num(p.threshold);
      return {
        emoji,
        action: "reached",
        target: label,
        detail: threshold != null ? `${money(threshold)} lifetime` : "Milestone rank",
      };
    }
    case "forum_thread_created":
      return {
        emoji: "💬",
        action: "posted",
        target: str(p.title) ?? "in the forums",
        detail: "Forum post",
      };
    case "forum_reply_created":
      return {
        emoji: "💬",
        action: "replied to",
        target: str(p.threadTitle) ?? "a thread",
        detail: "Forum reply",
      };
    case "forum.reactions_milestone": {
      const count = num(p.count) ?? 0;
      return {
        emoji: "🔥",
        action: "earned",
        target: `${count} reaction${count === 1 ? "" : "s"}`,
        detail: str(p.threadTitle) ?? "A popular post",
      };
    }
    case "news.card_published":
      return {
        emoji: "📰",
        action: "posted",
        target: str(p.title) ?? "an update",
        detail: "Drift log",
      };
    case "news.card_updated":
      return {
        emoji: "📰",
        action: "updated",
        target: str(p.title) ?? "a drift log card",
        detail: "Drift log edit",
      };
    case "news.card_archived":
      return {
        emoji: "📰",
        action: "archived",
        target: str(p.title) ?? "a drift log card",
        detail: "Drift log archive",
      };
    case "member.joined":
      return {
        emoji: "🌴",
        action: "joined",
        target: "the crew",
        detail: "New islander — welcome aboard",
      };
    case "nuggies.daily_claimed": {
      const amount = num(p.amount) ?? 0;
      return {
        emoji: "🍗",
        action: "claimed their daily",
        target: money(amount),
        detail: "Daily Nuggies",
      };
    }
    case "nuggies.loan_accepted": {
      const principal = num(p.principal) ?? 0;
      return {
        emoji: "🤝",
        action: "took a loan of",
        target: money(principal),
        detail: "Loan accepted",
      };
    }
    case "nuggies.loan_repaid": {
      const amount = num(p.amount) ?? 0;
      return {
        emoji: "💸",
        action: "repaid",
        target: money(amount),
        detail: "Loan repaid",
      };
    }
    case "nuggies.admin_adjustment": {
      const amount = num(p.amount) ?? 0;
      return {
        emoji: "⚙️",
        action: "received a crew adjustment of",
        target: `${amount >= 0 ? "+" : ""}${money(amount)}`,
        detail: str(p.reason) ?? "Admin adjustment",
      };
    }
    case "nuggies.attendance_awarded": {
      const gameNightId = num(p.gameNightId);
      const perPerson = num(p.amountPerPerson);
      return {
        emoji: "🎟️",
        action: "awarded",
        target: gameNightId != null ? `game night #${gameNightId}` : "game night attendance",
        detail: perPerson != null ? `${money(perPerson)} per person` : "Attendance reward",
      };
    }
    case "nuggies.shop_item_changed": {
      const action = str(p.action) === "created" ? "added" : "updated";
      return {
        emoji: "🛒",
        action,
        target: str(p.name) ?? "an island shop item",
        detail: "Island shop",
      };
    }
    case "admin.settings_changed":
      return {
        emoji: "⚙️",
        action: "changed",
        target: str(p.key) ?? "a server setting",
        detail: "Server settings",
      };
    case "admin.onboarding_reset_all": {
      const count = num(p.resetCount);
      return {
        emoji: "🔁",
        action: "reset onboarding for",
        target: count != null ? `${count} crew member${count === 1 ? "" : "s"}` : "all crew",
        detail: "Admin action",
      };
    }
    case "casino.big_win": {
      const net = num(p.net) ?? 0;
      const game = str(p.game);
      return {
        emoji: "🎰",
        action: "won big at",
        target: game ? casinoGameLabel(game) : "the casino",
        detail: `+${money(net)}`,
      };
    }
    default:
      return {
        emoji: FALLBACK_EMOJI,
        action: activityEventLabel(eventType),
        target: null,
        detail: null,
      };
  }
}
