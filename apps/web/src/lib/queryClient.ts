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
};
