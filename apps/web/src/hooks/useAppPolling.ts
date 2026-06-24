import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, type MutableRefObject } from "react";
import { apiFetch } from "../api/client.js";
import { appQueryKeys } from "../lib/queryClient.js";
import type {
  ActivityEvent,
  FeaturedRecommendation,
  FeaturedRecommendationResponse,
  GameNewsItem,
  GameNight,
  GameNightAttendee,
  GeneralNewsItem,
  GuildMember,
  NewsCard,
  PageId,
} from "../types.js";

type SelectedNightPayload = {
  attendees: GameNightAttendee[];
  currentUserIsAttending: boolean;
};

type UseAppPollingOptions = {
  isAuthenticated: boolean | null;
  page: PageId;
  selectedNightId: number | null;
  steamLinked: boolean;
  lastGuildMembersRef: MutableRefObject<string | null>;
  lastGameNightsRef: MutableRefObject<string | null>;
  lastSelectedNightRef: MutableRefObject<string | null>;
  setGuildMembers: (members: GuildMember[]) => void;
  setGameNights: (nights: GameNight[]) => void;
  setNightAttendees: (attendees: GameNightAttendee[]) => void;
  setCurrentUserAttendingSelectedNight: (v: boolean) => void;
  setFeaturedRecommendation: (v: FeaturedRecommendation | null) => void;
  setActivityEvents: (v: ActivityEvent[]) => void;
  setGameNews: (v: GameNewsItem[]) => void;
  setGeneralNews: (v: GeneralNewsItem[]) => void;
};

async function fetchGuildMembers(): Promise<GuildMember[]> {
  const response = await apiFetch("/members", { credentials: "include" });
  const data = (await response.json().catch(() => null)) as { members?: GuildMember[]; error?: string } | null;
  if (!response.ok) throw new Error(data?.error ?? `Member load failed (${response.status})`);
  return data?.members ?? [];
}

async function fetchGameNights(): Promise<GameNight[]> {
  const response = await apiFetch("/game-nights", { credentials: "include" });
  const data = (await response.json().catch(() => null)) as { gameNights?: GameNight[]; error?: string } | null;
  if (!response.ok) throw new Error(data?.error ?? `Game nights request failed (${response.status})`);
  return data?.gameNights ?? [];
}

async function fetchSelectedNight(gameNightId: number): Promise<SelectedNightPayload> {
  const response = await apiFetch(`/game-nights/${gameNightId}/attendees`, { credentials: "include" });
  const data = (await response.json().catch(() => null)) as
    | { attendees?: GameNightAttendee[]; currentUserIsAttending?: boolean; error?: string }
    | null;
  if (!response.ok) throw new Error(data?.error ?? `Attendee load failed (${response.status})`);
  return {
    attendees: data?.attendees ?? [],
    currentUserIsAttending: Boolean(data?.currentUserIsAttending),
  };
}

async function fetchFeatured(): Promise<FeaturedRecommendation | null> {
  const response = await apiFetch("/recommendations/featured", { credentials: "include" });
  if (!response.ok) throw new Error(`Featured pick load failed (${response.status})`);
  const data = (await response.json().catch(() => null)) as FeaturedRecommendationResponse | null;
  return data?.featured ?? null;
}

async function fetchActivity(): Promise<ActivityEvent[]> {
  const response = await apiFetch("/activity?limit=25", { credentials: "include" });
  if (!response.ok) throw new Error(`Activity load failed (${response.status})`);
  const data = (await response.json().catch(() => null)) as { events?: ActivityEvent[] } | null;
  return data?.events ?? [];
}

async function fetchNewsBundle(): Promise<{ gameNews: GameNewsItem[]; generalNews: GeneralNewsItem[] }> {
  const [gameRes, generalRes] = await Promise.all([
    apiFetch("/games/news", { credentials: "include" }),
    apiFetch("/news/general", { credentials: "include" }),
  ]);
  const gameData = gameRes.ok
    ? ((await gameRes.json().catch(() => null)) as { news?: GameNewsItem[] } | null)
    : null;
  const generalData = generalRes.ok
    ? ((await generalRes.json().catch(() => null)) as { news?: GeneralNewsItem[] } | null)
    : null;
  return {
    gameNews: gameData?.news ?? [],
    generalNews: generalData?.news ?? [],
  };
}

async function syncOwnedSteamGames(): Promise<void> {
  const response = await apiFetch("/steam/sync-owned-games", { method: "POST", credentials: "include" });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Steam sync failed (${response.status})`);
  }
}

async function syncRecentSteamGames(): Promise<void> {
  await apiFetch("/steam/sync-recent-games", { method: "POST", credentials: "include" });
}

export function useAppPolling(options: UseAppPollingOptions) {
  const {
    isAuthenticated,
    page,
    selectedNightId,
    steamLinked,
    lastGuildMembersRef,
    lastGameNightsRef,
    lastSelectedNightRef,
    setGuildMembers,
    setGameNights,
    setNightAttendees,
    setCurrentUserAttendingSelectedNight,
    setFeaturedRecommendation,
    setActivityEvents,
    setGameNews,
    setGeneralNews,
  } = options;

  const authed = isAuthenticated === true;

  const guildMembersQuery = useQuery({
    queryKey: appQueryKeys.guildMembers,
    queryFn: fetchGuildMembers,
    enabled: authed,
    refetchInterval: 180_000,
    staleTime: 120_000,
  });

  const gameNightsQuery = useQuery({
    queryKey: appQueryKeys.gameNights,
    queryFn: fetchGameNights,
    enabled: authed && page === "games",
    refetchInterval: 90_000,
    staleTime: 60_000,
  });

  const selectedNightQuery = useQuery({
    queryKey: appQueryKeys.selectedNight(selectedNightId ?? 0),
    queryFn: () => fetchSelectedNight(selectedNightId as number),
    enabled: authed && page === "games" && selectedNightId != null,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const featuredQuery = useQuery({
    queryKey: appQueryKeys.featured,
    queryFn: fetchFeatured,
    enabled: authed,
    refetchInterval: 20 * 60 * 1000,
    staleTime: 15 * 60 * 1000,
  });

  const activityQuery = useQuery({
    queryKey: appQueryKeys.activity,
    queryFn: fetchActivity,
    enabled: authed,
    refetchInterval: 20 * 60 * 1000,
    staleTime: 15 * 60 * 1000,
  });

  const newsQuery = useQuery({
    queryKey: [...appQueryKeys.gameNews, ...appQueryKeys.generalNews],
    queryFn: fetchNewsBundle,
    enabled: authed,
    refetchInterval: 20 * 60 * 1000,
    staleTime: 15 * 60 * 1000,
  });

  useQuery({
    queryKey: ["steam-sync-owned"],
    queryFn: syncOwnedSteamGames,
    enabled: authed && steamLinked,
    refetchInterval: 10 * 60 * 1000,
    staleTime: 8 * 60 * 1000,
  });

  useQuery({
    queryKey: ["steam-sync-recent"],
    queryFn: syncRecentSteamGames,
    enabled: authed && steamLinked,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });

  useEffect(() => {
    if (!guildMembersQuery.data) return;
    const signature = JSON.stringify(guildMembersQuery.data);
    if (signature === lastGuildMembersRef.current) return;
    lastGuildMembersRef.current = signature;
    setGuildMembers(guildMembersQuery.data);
  }, [guildMembersQuery.data, lastGuildMembersRef, setGuildMembers]);

  useEffect(() => {
    if (!gameNightsQuery.data) return;
    const signature = JSON.stringify(gameNightsQuery.data);
    if (signature === lastGameNightsRef.current) return;
    lastGameNightsRef.current = signature;
    setGameNights(gameNightsQuery.data);
  }, [gameNightsQuery.data, lastGameNightsRef, setGameNights]);

  useEffect(() => {
    if (!selectedNightQuery.data || selectedNightId == null) return;
    const signature = JSON.stringify({ gameNightId: selectedNightId, ...selectedNightQuery.data });
    if (signature === lastSelectedNightRef.current) return;
    lastSelectedNightRef.current = signature;
    setNightAttendees(selectedNightQuery.data.attendees);
    setCurrentUserAttendingSelectedNight(selectedNightQuery.data.currentUserIsAttending);
  }, [selectedNightQuery.data, selectedNightId, lastSelectedNightRef, setNightAttendees, setCurrentUserAttendingSelectedNight]);

  useEffect(() => {
    if (featuredQuery.data !== undefined) {
      setFeaturedRecommendation(featuredQuery.data);
    }
  }, [featuredQuery.data, setFeaturedRecommendation]);

  useEffect(() => {
    if (activityQuery.data) setActivityEvents(activityQuery.data);
  }, [activityQuery.data, setActivityEvents]);

  useEffect(() => {
    if (!newsQuery.data) return;
    setGameNews(newsQuery.data.gameNews);
    setGeneralNews(newsQuery.data.generalNews);
  }, [newsQuery.data, setGameNews, setGeneralNews]);
}

export function useInvalidateAppQueries() {
  const queryClient = useQueryClient();
  return {
    invalidateMembers: () => queryClient.invalidateQueries({ queryKey: appQueryKeys.guildMembers }),
    invalidateNights: () => queryClient.invalidateQueries({ queryKey: appQueryKeys.gameNights }),
    invalidateActivity: () => queryClient.invalidateQueries({ queryKey: appQueryKeys.activity }),
    invalidateFeatured: () => queryClient.invalidateQueries({ queryKey: appQueryKeys.featured }),
    invalidateNews: () =>
      queryClient.invalidateQueries({ queryKey: [...appQueryKeys.gameNews, ...appQueryKeys.generalNews] }),
    invalidateSelectedNight: (id: number) =>
      queryClient.invalidateQueries({ queryKey: appQueryKeys.selectedNight(id) }),
    invalidateSteamSync: () => {
      void queryClient.invalidateQueries({ queryKey: ["steam-sync-owned"] });
      void queryClient.invalidateQueries({ queryKey: ["steam-sync-recent"] });
    },
  };
}
