import type { PageId } from "../types.js";

const prefetched = new Set<PageId>();

const PAGE_IMPORTS: Partial<Record<PageId, () => Promise<unknown>>> = {
  games: () => import("../pages/Games.js"),
  "games-news": () => import("../pages/GamingNews.js"),
  library: () => import("../pages/Library.js"),
  community: () => import("../pages/Community.js"),
  "community-forums": () => import("../pages/Forums.js"),
  "community-leaderboard": () => import("../pages/CommunityLeaderboard.js"),
  "crew-achievements": () => import("../pages/CrewAchievements.js"),
  nuggies: () => import("../pages/Achievements.js"),
  "nuggies-casino": () => import("../pages/games/CasinoPage.js"),
  "nuggies-history": () => import("../pages/NuggiesHistory.js"),
  "nuggies-loans": () => import("../pages/NuggiesLoans.js"),
  "nuggies-milestones": () => import("../pages/Milestones.js"),
  profile: () => import("../pages/Profile.js"),
  settings: () => import("../pages/Settings.js"),
  "tide-check": () => import("../pages/TideCheck.js"),
  "islander-profile": () => import("../pages/IslanderProfile.js"),
  admin: () => import("../pages/Admin.js"),
};

export function prefetchPage(page: PageId) {
  if (page === "home" || prefetched.has(page)) return;
  const load = PAGE_IMPORTS[page];
  if (!load) return;
  prefetched.add(page);
  void load();
}
