/** Admin audit log helpers — Entra-style labels, scopes, and detail fields. */

import { activityEventDetail, activityEventLabel } from "./activityEventCopy.js";

export type AuditScope = "admin" | "economy" | "moderation" | "community" | "all";

export type AuditDetailField = { label: string; value: string };

export type ActivityAuditInput = {
  id: string;
  eventType: string;
  createdAt: string;
  actor: { displayName: string; discordUserId?: string | null } | null;
  target: { displayName: string; discordUserId?: string | null } | null;
  game: { name: string; appId?: number } | null;
  gameNightId: string | null;
  payload: Record<string, unknown>;
};

const ADMIN_ACTIVITY_PREFIXES = ["admin.", "game_night.admin_", "news.card_"] as const;

const ADMIN_ACTIVITY_TYPES = new Set([
  "nuggies.admin_adjustment",
  "nuggies.attendance_awarded",
  "nuggies.shop_item_changed",
]);

const ECONOMY_ACTIVITY_TYPES = new Set([
  "nuggies.admin_adjustment",
  "nuggies.attendance_awarded",
  "nuggies.loan_accepted",
  "nuggies.loan_repaid",
  "nuggies.daily_claimed",
  "casino.big_win",
]);

const FORUM_MOD_ACTIONS: Record<string, string> = {
  ban_user: "Banned a forum user",
  unban_user: "Unbanned a forum user",
  delete_post: "Deleted a forum post",
  delete_thread: "Deleted a forum thread",
  edit_post: "Edited a forum post (mod)",
  edit_thread: "Edited a forum thread (mod)",
};

export function isAdminActivityEvent(eventType: string): boolean {
  if (ADMIN_ACTIVITY_TYPES.has(eventType)) return true;
  return ADMIN_ACTIVITY_PREFIXES.some((p) => eventType.startsWith(p));
}

export function activityAuditScope(eventType: string): Exclude<AuditScope, "moderation" | "all"> {
  if (isAdminActivityEvent(eventType)) return "admin";
  if (ECONOMY_ACTIVITY_TYPES.has(eventType)) return "economy";
  return "community";
}

export function modLogActionLabel(action: string): string {
  return FORUM_MOD_ACTIONS[action] ?? action.replace(/_/g, " ");
}

function payloadString(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatMoney(amount: unknown): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  return `${amount >= 0 ? "+" : ""}₦${Math.abs(amount).toLocaleString("en-US")}`;
}

/** Rich detail fields for the admin audit detail panel. */
export function activityAuditDetailFields(event: ActivityAuditInput): AuditDetailField[] {
  const fields: AuditDetailField[] = [
    { label: "Event", value: activityEventLabel(event.eventType) },
    { label: "Type code", value: event.eventType },
    { label: "When", value: new Date(event.createdAt).toLocaleString() },
  ];

  if (event.actor) {
    fields.push({
      label: "Actor",
      value: event.actor.discordUserId
        ? `${event.actor.displayName} (${event.actor.discordUserId})`
        : event.actor.displayName,
    });
  }
  if (event.target) {
    fields.push({
      label: "Target user",
      value: event.target.discordUserId
        ? `${event.target.displayName} (${event.target.discordUserId})`
        : event.target.displayName,
    });
  }
  if (event.game) {
    fields.push({ label: "Game", value: event.game.name });
  }
  if (event.gameNightId) {
    fields.push({ label: "Game night", value: `#${event.gameNightId}` });
  }

  const p = event.payload;

  switch (event.eventType) {
    case "admin.settings_changed": {
      fields.push({ label: "Setting", value: payloadString(p.key) });
      fields.push({ label: "Previous", value: payloadString(p.oldValue) });
      fields.push({ label: "New", value: payloadString(p.newValue) });
      break;
    }
    case "nuggies.admin_adjustment": {
      const amt = formatMoney(p.amount);
      if (amt) fields.push({ label: "Amount", value: amt });
      if (typeof p.reason === "string" && p.reason) fields.push({ label: "Reason", value: p.reason });
      break;
    }
    case "nuggies.attendance_awarded": {
      fields.push({ label: "Game night", value: payloadString(p.gameNightId) });
      fields.push({ label: "Crew awarded", value: payloadString(p.awardedCount) });
      fields.push({ label: "Per person", value: formatMoney(p.amountPerPerson) ?? "—" });
      break;
    }
    case "nuggies.shop_item_changed": {
      fields.push({ label: "Item", value: payloadString(p.name) });
      fields.push({ label: "Price", value: formatMoney(p.price) ?? "—" });
      fields.push({ label: "Action", value: payloadString(p.action) });
      break;
    }
    case "game_night.admin_updated": {
      if (p.title !== undefined) fields.push({ label: "Title", value: payloadString(p.title) });
      if (p.scheduledFor !== undefined) fields.push({ label: "Scheduled", value: payloadString(p.scheduledFor) });
      if (p.selectedAppId !== undefined) fields.push({ label: "Game app ID", value: payloadString(p.selectedAppId) });
      break;
    }
    case "game_night.admin_deleted": {
      if (typeof p.title === "string") fields.push({ label: "Title", value: p.title });
      break;
    }
    case "news.card_published":
    case "news.card_updated":
    case "news.card_archived": {
      if (typeof p.title === "string") fields.push({ label: "Card title", value: p.title });
      if (p.cardId != null) fields.push({ label: "Card ID", value: payloadString(p.cardId) });
      break;
    }
    case "admin.onboarding_reset_all": {
      fields.push({ label: "Profiles reset", value: payloadString(p.resetCount) });
      break;
    }
    case "milestone.reached": {
      const label = typeof p.label === "string" ? p.label : typeof p.tierLabel === "string" ? p.tierLabel : null;
      if (label) fields.push({ label: "Rank", value: label });
      break;
    }
    default: {
      const detail = activityEventDetail(event.eventType, p);
      if (detail) fields.push({ label: "Detail", value: detail });
      const extraKeys = Object.keys(p).filter(
        (k) => !["title", "threadTitle", "name", "reason", "amount"].includes(k)
      );
      for (const key of extraKeys.slice(0, 6)) {
        fields.push({ label: key, value: payloadString(p[key]) });
      }
    }
  }

  return fields;
}

export function activityAuditSummary(event: ActivityAuditInput): string {
  const label = activityEventLabel(event.eventType);
  const detail =
    activityEventDetail(event.eventType, event.payload) ??
    event.game?.name ??
    event.target?.displayName ??
    (event.gameNightId ? `night #${event.gameNightId}` : null);
  return detail ? `${label} · ${detail}` : label;
}

export type ModLogAuditInput = {
  id: number;
  action: string;
  createdAt: string;
  moderatorDisplayName: string;
  targetThreadTitle: string | null;
  targetThreadId: number | null;
  targetPostId: number | null;
  targetUserDisplayName: string | null;
  notes: string | null;
};

export function modLogAuditDetailFields(entry: ModLogAuditInput): AuditDetailField[] {
  const fields: AuditDetailField[] = [
    { label: "Action", value: modLogActionLabel(entry.action) },
    { label: "When", value: new Date(entry.createdAt).toLocaleString() },
    { label: "Moderator", value: entry.moderatorDisplayName },
  ];
  if (entry.targetUserDisplayName) fields.push({ label: "Target user", value: entry.targetUserDisplayName });
  if (entry.targetThreadTitle) fields.push({ label: "Thread", value: entry.targetThreadTitle });
  if (entry.targetThreadId != null) fields.push({ label: "Thread ID", value: String(entry.targetThreadId) });
  if (entry.targetPostId != null) fields.push({ label: "Post ID", value: String(entry.targetPostId) });
  if (entry.notes) fields.push({ label: "Notes", value: entry.notes });
  return fields;
}

export function modLogAuditSummary(entry: ModLogAuditInput): string {
  const action = modLogActionLabel(entry.action);
  const target =
    entry.targetUserDisplayName ??
    entry.targetThreadTitle ??
    (entry.targetPostId != null ? `post #${entry.targetPostId}` : null);
  return target ? `${action} · ${target}` : action;
}

/** CSV export for filtered audit rows (activity + mod). */
export function auditRowsToCsv(
  rows: Array<{ kind: "activity" | "mod"; createdAt: string; actor: string; summary: string; detail: string }>
): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = ["Time,Actor,Summary,Detail"];
  for (const row of rows) {
    lines.push(
      [row.createdAt, row.actor, row.summary, row.detail].map((c) => escape(c)).join(",")
    );
  }
  return lines.join("\n");
}
