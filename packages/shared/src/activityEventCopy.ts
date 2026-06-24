/** User-facing labels for activity_events (admin audit + feeds). */

export function activityEventLabel(eventType: string): string {
  switch (eventType) {
    case "game_night.created":
      return "Scheduled a game night";
    case "game_night.rsvp_joined":
      return "RSVP'd to a game night";
    case "game_night.rsvp_left":
      return "Left a game night RSVP";
    case "game_night.game_picked":
      return "Picked a game for the session";
    case "game_night.admin_updated":
      return "Updated a game night (admin)";
    case "game_night.admin_deleted":
      return "Deleted a game night (admin)";
    case "steam.linked":
      return "Linked Steam";
    case "steam.unlinked":
      return "Unlinked Steam";
    case "steam.synced":
      return "Resynced Steam library";
    case "achievement.steam_progress":
      return "Unlocked Steam achievements";
    case "achievement.unlocked":
      return "Earned an island achievement";
    case "milestone.reached":
      return "Reached a milestone rank";
    case "forum_thread_created":
      return "Posted in the forums";
    case "forum_reply_created":
      return "Replied in the forums";
    case "forum.reactions_milestone":
      return "Hit a forum reactions milestone";
    case "news.card_published":
      return "Posted to the drift log";
    case "news.card_updated":
      return "Updated a drift log card";
    case "news.card_archived":
      return "Archived a drift log card";
    case "admin.settings_changed":
      return "Changed a server setting";
    case "admin.onboarding_reset_all":
      return "Reset onboarding for all crew";
    case "nuggies.attendance_awarded":
      return "Awarded game night attendance";
    case "nuggies.shop_item_changed":
      return "Changed an island shop item";
    case "member.joined":
      return "Joined the crew";
    case "nuggies.daily_claimed":
      return "Claimed daily Nuggies";
    case "nuggies.loan_accepted":
      return "Accepted a loan";
    case "nuggies.loan_repaid":
      return "Repaid a loan";
    case "nuggies.admin_adjustment":
      return "Admin Nuggies adjustment";
    case "casino.big_win":
      return "Big casino win";
    default:
      return eventType.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export function activityEventDetail(eventType: string, payload: Record<string, unknown>): string | null {
  switch (eventType) {
    case "game_night.created":
      return typeof payload.title === "string" ? payload.title : null;
    case "forum_thread_created":
      return typeof payload.title === "string" ? payload.title : null;
    case "forum_reply_created":
      return typeof payload.threadTitle === "string" ? payload.threadTitle : null;
    case "news.card_published":
    case "news.card_updated":
    case "news.card_archived":
      return typeof payload.title === "string" ? payload.title : null;
    case "admin.settings_changed":
      return typeof payload.key === "string" ? payload.key : null;
    case "nuggies.admin_adjustment": {
      const amt = typeof payload.amount === "number" ? payload.amount : null;
      const reason = typeof payload.reason === "string" ? payload.reason : null;
      if (amt != null && reason) return `${amt >= 0 ? "+" : ""}₦${Math.abs(amt).toLocaleString()} — ${reason}`;
      return reason ?? (amt != null ? `₦${Math.abs(amt).toLocaleString()}` : null);
    }
    case "nuggies.attendance_awarded":
      return typeof payload.gameNightId === "number" ? `Night #${payload.gameNightId}` : null;
    case "nuggies.shop_item_changed":
      return typeof payload.name === "string" ? payload.name : null;
    case "milestone.reached":
      return typeof payload.label === "string"
        ? payload.label
        : typeof payload.tierLabel === "string"
          ? payload.tierLabel
          : null;
    case "achievement.unlocked":
      return typeof payload.name === "string" ? payload.name : null;
    default:
      return null;
  }
}

