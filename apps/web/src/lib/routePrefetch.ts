import type { PageId } from "../types.js";

const prefetched = new Set<PageId>();

const PAGE_IMPORTS: Partial<Record<PageId, () => Promise<unknown>>> = {
  admin: () => import("../pages/Admin.js"),
  community: () => import("../pages/Community.js"),
  games: () => import("../pages/Games.js"),
  "games-news": () => import("../pages/GamingNews.js"),
  home: () => import("../pages/Home.js"),
  library: () => import("../pages/Library.js"),
  nuggies: () => import("../pages/Achievements.js"),
  "nuggies-milestones": () => import("../pages/Milestones.js"),
  "nuggies-casino": () => import("../pages/games/CasinoPage.js"),
  "community-forums": () => import("../pages/Forums.js"),
  profile: () => import("../pages/Profile.js"),
  settings: () => import("../pages/Settings.js"),
  "community-leaderboard": () => import("../pages/CommunityLeaderboard.js"),
  "crew-achievements": () => import("../pages/CrewAchievements.js"),
  "nuggies-history": () => import("../pages/NuggiesHistory.js"),
  "nuggies-loans": () => import("../pages/NuggiesLoans.js"),
  "tide-check": () => import("../pages/TideCheck.js"),
  "islander-profile": () => import("../pages/IslanderProfile.js"),
};

export function prefetchPage(page: PageId) {
  if (page === "home" || prefetched.has(page)) return;
  const load = PAGE_IMPORTS[page];
  if (!load) return;
  prefetched.add(page);
  void load().catch(() => {
    prefetched.delete(page);
  });
}

export function prefetchHandler(pageId: PageId) {
  return () => prefetchPage(pageId);
}
