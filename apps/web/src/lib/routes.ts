// Central URL map for the SPA. Every top-level page has a real path (no hash
// routing), so refresh / back-forward / shareable links Just Work and the
// browser address bar always reflects where you are.
//
// Sub-view routing for Forums and Admin lives inside those pages (they parse
// the path under their prefix); this module owns the top-level page<->path
// mapping plus the helpers nav components use to build <Link> targets.

import type { PageId } from "../types.js";

// Canonical path for each page id. Pages with sub-routes (forums, admin,
// islander-profile) map to their base/landing path here; their deeper paths are
// produced by the page-specific helpers below.
const PAGE_PATHS: Record<PageId, string> = {
  home: "/",
  games: "/games",
  "games-news": "/games/news",
  library: "/library",
  community: "/community",
  "community-forums": "/forums",
  "community-leaderboard": "/community/leaderboard",
  "crew-achievements": "/achievements",
  nuggies: "/nuggies",
  "nuggies-casino": "/nuggies/casino",
  "nuggies-history": "/nuggies/history",
  "nuggies-milestones": "/nuggies/milestones",
  profile: "/profile",
  settings: "/settings",
  "tide-check": "/tide-check",
  "islander-profile": "/islanders",
  admin: "/admin"
};

export function pathForPage(page: PageId): string {
  return PAGE_PATHS[page] ?? "/";
}

// Reverse map: which page does a pathname render? Longest/most-specific
// prefixes are matched first so `/games/news` doesn't get swallowed by
// `/games`. Returns null for unknown paths (→ 404).
export function pageFromPath(pathname: string): PageId | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/") return "home";
  if (p === "/games/news") return "games-news";
  if (p === "/games") return "games";
  if (p === "/library") return "library";
  if (p === "/community/leaderboard") return "community-leaderboard";
  if (p === "/community") return "community";
  if (p === "/forums" || p.startsWith("/forums/")) return "community-forums";
  if (p === "/achievements") return "crew-achievements";
  if (p === "/nuggies/casino") return "nuggies-casino";
  if (p === "/nuggies/history") return "nuggies-history";
  if (p === "/nuggies/milestones") return "nuggies-milestones";
  if (p === "/nuggies") return "nuggies";
  if (p === "/profile") return "profile";
  if (p === "/settings") return "settings";
  if (p === "/tide-check") return "tide-check";
  if (p === "/islanders" || p.startsWith("/islanders/")) return "islander-profile";
  if (p === "/admin" || p.startsWith("/admin/")) return "admin";
  return null;
}

// `/islanders/:userId` → userId (null on the bare `/islanders` path).
export function islanderIdFromPath(pathname: string): string | null {
  const m = /^\/islanders\/([^/]+)/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

export function pathForIslander(discordUserId: string): string {
  return `/islanders/${encodeURIComponent(discordUserId)}`;
}

export function pathForForumThread(threadId: number, postId?: number | null): string {
  return `/forums/thread/${threadId}${postId ? `/post/${postId}` : ""}`;
}

// Opens the crew Library with a game's detail drawer pre-opened (Library reads
// the `game` query param). Used by inline game links in activity feeds.
export function pathForGame(appId: number): string {
  return `/library?game=${appId}`;
}

// Minimal structural shape an activity row needs to resolve a destination.
// Kept structural (not the full ActivityEvent type) so every feed surface
// — Home, Community, and the leaner per-user profile feed — can call this.
type ActivityHrefInput = {
  eventType: string;
  payload?: Record<string, unknown> | null;
  actor?: { discordUserId: string | null } | null;
};

// Coerce a payload field to a positive integer id, or null.
function asId(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Primary click destination for an activity-feed row. Returns null when the
// event has nowhere meaningful to go (row stays non-interactive).
export function activityHref(event: ActivityHrefInput): string | null {
  const type = event.eventType;
  const payload = event.payload ?? {};

  // Any forum event with a thread id deep-links to the thread, plus the exact
  // post when one is carried (replies, reaction milestones).
  if (type.startsWith("forum")) {
    const threadId = asId(payload.threadId);
    return threadId ? pathForForumThread(threadId, asId(payload.postId)) : null;
  }
  if (type.startsWith("game_night.")) return pathForPage("tide-check");
  if (type.startsWith("news.")) return pathForPage("games-news");
  // New member → their profile (id lives in the payload since they may have no
  // account row yet).
  if (type === "member.joined") {
    const id =
      (typeof payload.discordUserId === "string" && payload.discordUserId) ||
      event.actor?.discordUserId ||
      null;
    return id ? pathForIslander(id) : null;
  }
  // Person-centric events → the actor's profile.
  if (
    type.startsWith("achievement.") ||
    type.startsWith("milestone.") ||
    type.startsWith("steam.") ||
    type.startsWith("casino.") ||
    type.startsWith("nuggies.")
  ) {
    return event.actor?.discordUserId ? pathForIslander(event.actor.discordUserId) : null;
  }
  return null;
}
