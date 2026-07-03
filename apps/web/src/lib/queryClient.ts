import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      refetchIntervalInBackground: false,
    },
  },
});

export const appQueryKeys = {
  guildMembers: ["guild-members"] as const,
  gameNights: ["game-nights"] as const,
  selectedNight: (id: number) => ["game-night", id] as const,
  featured: ["featured-recommendation"] as const,
  activity: ["activity"] as const,
  gameNews: ["game-news"] as const,
  generalNews: ["general-news"] as const,
  newsCards: ["news-cards"] as const,
  nuggiesMe: ["nuggies-me"] as const,
  nuggiesAchievements: ["nuggies-achievements"] as const,
  digestLatest: ["digest-latest"] as const,
  steamCrewAchievements: ["steam-crew-achievements"] as const,
  islanderProfile: (discordUserId: string) => ["islander-profile", discordUserId] as const,
  nuggiesLeaderboard: ["nuggies-leaderboard"] as const,
  forumThreadFeed: (sort: string, category: string | null, type: string | null, appId: number | null) =>
    ["forum-thread-feed", sort, category, type, appId] as const,
};
