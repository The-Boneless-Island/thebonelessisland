import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollRestoration, useLocation, useNavigate } from "react-router";
import { SITE_BRAND_NAME } from "@island/shared";
import { API_BASE_URL, apiFetch } from "./api/client.js";
import { putClientState } from "./api/clientState.js";
import { consumePendingLoginReturn, LoginScreen } from "./pages/LoginScreen.js";
import { HomePage } from "./pages/Home.js";
import { useLoginOverlay } from "./scene/LoginOverlayContext.js";
import { NotFoundPage } from "./pages/NotFound.js";
import { preloadRankBadge } from "./lib/preloadRankBadge.js";
import { AuthBootShell } from "./components/AuthBootShell.js";
import {
  islanderIdFromPath,
  pageFromPath,
  pathForForumThread,
  pathForIslander,
  pathForPage
} from "./lib/routes.js";

// Route-level code splitting: each routed page is lazy-loaded so its bundle is
// only fetched when the page is first rendered. Named-export pages are mapped to
// a default export; the new leaderboard/history pages are already default exports.
const AdminPage = lazy(() => import("./pages/Admin.js").then((m) => ({ default: m.AdminPage })));
const CommunityPage = lazy(() => import("./pages/Community.js").then((m) => ({ default: m.CommunityPage })));
const GamesPage = lazy(() => import("./pages/Games.js").then((m) => ({ default: m.GamesPage })));
const GamingNewsPage = lazy(() => import("./pages/GamingNews.js").then((m) => ({ default: m.GamingNewsPage })));
const LibraryPage = lazy(() => import("./pages/Library.js").then((m) => ({ default: m.LibraryPage })));
const AchievementsPage = lazy(() => import("./pages/Achievements.js").then((m) => ({ default: m.AchievementsPage })));
const MilestonesPage = lazy(() => import("./pages/Milestones.js").then((m) => ({ default: m.MilestonesPage })));
const CasinoPage = lazy(() => import("./pages/games/CasinoPage.js").then((m) => ({ default: m.CasinoPage })));
const ForumsPage = lazy(() => import("./pages/Forums.js").then((m) => ({ default: m.ForumsPage })));
const ProfilePage = lazy(() => import("./pages/Profile.js").then((m) => ({ default: m.ProfilePage })));
const SettingsPage = lazy(() => import("./pages/Settings.js").then((m) => ({ default: m.SettingsPage })));
const CommunityLeaderboardPage = lazy(() => import("./pages/CommunityLeaderboard.js"));
const CrewAchievementsPage = lazy(() => import("./pages/CrewAchievements.js"));
const NuggiesHistoryPage = lazy(() => import("./pages/NuggiesHistory.js"));
const NuggiesLoansPage = lazy(() => import("./pages/NuggiesLoans.js"));
const TideCheckPage = lazy(() => import("./pages/TideCheck.js"));
const IslanderProfilePage = lazy(() => import("./pages/IslanderProfile.js"));
import { ToastHost, ToastQueueProvider, useToastQueue, useToastsFromStatus } from "./system/toast.js";
import { ActivityRefetchProvider } from "./system/activityContext.js";
import { NuggiesSignalProvider } from "./system/nuggiesSignal.js";
import { AchievementCelebration, useCelebrationQueue } from "./system/celebration.js";
import { islandCopy, islandTheme } from "./theme.js";
import { useDayNight } from "./scene/useDayNight.js";
import { Topbar } from "./components/Topbar.js";
import { MobileTabBar } from "./components/MobileTabBar.js";
import { QuickSwitcher } from "./components/QuickSwitcher.js";
import {
  CURRENT_ONBOARDING_VERSION,
  OnboardingFlow
} from "./components/OnboardingFlow.js";
import type {
  ActivityEvent,
  CrewOwnedGame,
  CrewWishlistGame,
  FeaturedRecommendation,
  FeaturedRecommendationResponse,
  GameNewsItem,
  GeneralNewsItem,
  GameNight,
  GameNightAttendee,
  GuildMember,
  MeProfile,
  NewsCard,
  OwnedGameLite,
  PageId,
  Recommendation,
  ServerSetting
} from "./types.js";
import { useAppPolling, useInvalidateAppQueries } from "./hooks/useAppPolling.js";

function PageLoadingFallback() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "40vh",
        fontSize: 15,
        opacity: 0.6,
      }}
    >
      Loading…
    </div>
  );
}

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loginExiting, setLoginExiting] = useState(false);
  const exitSafetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setLoginOverlayActive } = useLoginOverlay();
  // Last-applied snapshots for polled loaders — used to skip redundant setStates
  // (which would otherwise re-render the whole tree every poll tick).
  const lastGuildMembersRef = useRef<string | null>(null);
  const lastGameNightsRef = useRef<string | null>(null);
  const lastSelectedNightRef = useRef<string | null>(null);
  // Routing: the URL is the source of truth. `page` is derived from the path so
  // refresh / back-forward / shared links all land on the right page; navigation
  // goes through the router via navigateToPage. `null` page → unknown path → 404.
  const location = useLocation();
  const navigate = useNavigate();
  const page = pageFromPath(location.pathname);
  const navigateToPage = useCallback((next: PageId) => navigate(pathForPage(next)), [navigate]);
  const selectedProfileId = islanderIdFromPath(location.pathname);
  const [composerScrollNonce, setComposerScrollNonce] = useState(0);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [results, setResults] = useState<Recommendation[]>([]);
  const [status, setStatus] = useState("Idle");
  const [profileJson, setProfileJson] = useState("Not loaded");
  const [profileData, setProfileData] = useState<MeProfile | null>(null);
  const [gameNights, setGameNights] = useState<GameNight[]>([]);
  const [newNightTitle, setNewNightTitle] = useState<string>(islandCopy.placeholders.title);
  const [newNightScheduledFor, setNewNightScheduledFor] = useState("");
  const [selectedNightId, setSelectedNightId] = useState<number | null>(null);
  const [nightAttendees, setNightAttendees] = useState<GameNightAttendee[]>([]);
  const [currentUserAttendingSelectedNight, setCurrentUserAttendingSelectedNight] = useState(false);
  const [guildMembers, setGuildMembers] = useState<GuildMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [profileSteamVisibility, setProfileSteamVisibility] = useState<"private" | "members" | "public">("members");
  const [profileFeatureOptIn, setProfileFeatureOptIn] = useState(true);
  const [ownedGames, setOwnedGames] = useState<OwnedGameLite[]>([]);
  const [ownedGameSearch, setOwnedGameSearch] = useState("");
  const [excludedOwnedGameAppIds, setExcludedOwnedGameAppIds] = useState<number[]>([]);
  const [crewGames, setCrewGames] = useState<CrewOwnedGame[]>([]);
  const [crewWishlist, setCrewWishlist] = useState<CrewWishlistGame[]>([]);
  const [featuredRecommendation, setFeaturedRecommendation] = useState<FeaturedRecommendation | null>(null);
  const [composerRecommendations, setComposerRecommendations] = useState<Recommendation[]>([]);
  const [draftAppId, setDraftAppId] = useState<number | null>(null);
  const [lockNonce, setLockNonce] = useState(0);
  const [gameNews, setGameNews] = useState<GameNewsItem[]>([]);
  const [generalNews, setGeneralNews] = useState<GeneralNewsItem[]>([]);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [newsCards, setNewsCards] = useState<NewsCard[]>([]);
  const [serverSettings, setServerSettings] = useState<ServerSetting[] | null>(null);
  const [quickSwitchOpen, setQuickSwitchOpen] = useState(false);
  const [tagline, setTagline] = useState<string>("");
  const toastQueue = useToastQueue();
  useToastsFromStatus(status, toastQueue.pushToast);
  const celebrationQueue = useCelebrationQueue();
  // Destructure the stable enqueue callback so the celebration effect's dep array
  // doesn't hold the whole celebrationQueue object (a fresh object each render).
  const { enqueue: enqueueCelebration } = celebrationQueue;
  const { preference: dayNightPreference, setPreference: setDayNightPreference } = useDayNight();

  // Bumped whenever the SSE bus reports this member's Nuggies balance changed,
  // so the Balance/Milestones surfaces refetch immediately (see NuggiesSignal).
  const [nuggiesSignal, setNuggiesSignal] = useState(0);
  const myDiscordIdRef = useRef<string | null>(null);
  const invalidate = useInvalidateAppQueries();

  useAppPolling({
    isAuthenticated,
    page: page ?? "home",
    selectedNightId,
    steamLinked: Boolean(profileData?.steamId64),
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
  });

  useEffect(() => {
    myDiscordIdRef.current = profileData?.discordUserId ?? null;
  }, [profileData?.discordUserId]);

  // ── Achievement / milestone unlock celebration ──────────────────────────────
  // Subscribes to the activity_events feed for the current user's
  // achievement.unlocked + milestone.reached rows. Server-side cursor
  // (last_unlock_seen_at in user_client_state) prevents re-firing across
  // devices and browsers. First-ever load seeds the cursor to NOW so
  // historical unlocks don't spam. Each fresh event is pushed onto the
  // celebration queue; the overlay shows them one at a time.
  //
  // The cursor is held in a ref so writes don't depend on a state update or
  // profile reload — the ref is updated immediately after any write.
  const lastUnlockSeenRef = useRef<string | null>(null);

  // Seed the cursor from profile on load (once profileData is available).
  // We only initialize from profile if the ref hasn't been set yet (avoids
  // overwriting on re-renders after we've already started running).
  useEffect(() => {
    if (lastUnlockSeenRef.current !== null) return;
    const stored = profileData?.clientState?.last_unlock_seen_at;
    if (typeof stored === "string" && stored) {
      lastUnlockSeenRef.current = stored;
    }
    // If not set in profile yet, leave null — the effect below will handle seeding to now.
  }, [profileData]);

  useEffect(() => {
    const myId = profileData?.discordUserId;
    if (!myId || activityEvents.length === 0) return;

    if (lastUnlockSeenRef.current === null) {
      // First visit (no server record yet) — seed to now so we don't celebrate historical events.
      const now = new Date().toISOString();
      lastUnlockSeenRef.current = now;
      void putClientState("last_unlock_seen_at", now);
      return;
    }
    const lastSeenMs = new Date(lastUnlockSeenRef.current).getTime();
    if (!Number.isFinite(lastSeenMs)) {
      const now = new Date().toISOString();
      lastUnlockSeenRef.current = now;
      void putClientState("last_unlock_seen_at", now);
      return;
    }

    const fresh = activityEvents
      .filter((e) => {
        if (e.actor?.discordUserId !== myId) return false;
        if (e.eventType !== "achievement.unlocked" && e.eventType !== "milestone.reached") return false;
        const t = new Date(e.createdAt).getTime();
        return Number.isFinite(t) && t > lastSeenMs;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (fresh.length === 0) return;

    let maxSeen = lastSeenMs;
    for (const e of fresh) {
      const p = e.payload ?? {};
      const emoji = typeof p.emoji === "string" ? p.emoji : "🎉";
      if (e.eventType === "achievement.unlocked") {
        const name = typeof p.name === "string" ? p.name : "Achievement";
        const itemType = typeof p.itemType === "string" ? p.itemType : "badge";
        enqueueCelebration({
          id: e.id,
          kind: "achievement",
          emoji,
          title: name,
          itemType,
          description: `A new ${itemType} just washed ashore — find it in your Milestones stash.`,
        });
      } else {
        const label = typeof p.label === "string" ? p.label : "New rank";
        const threshold = typeof p.threshold === "number" ? p.threshold : 0;
        const bonus = typeof p.bonus === "number" ? p.bonus : 0;
        const emblem = typeof p.emblem === "string" ? p.emblem : emoji;
        enqueueCelebration({
          id: e.id,
          kind: "milestone",
          emoji,
          emblem,
          title: label,
          description: threshold > 0
            ? `Your lifetime haul crossed ₦${threshold.toLocaleString()}.`
            : "You climbed a rung on the island ladder.",
          bonus,
        });
      }
      const t = new Date(e.createdAt).getTime();
      if (t > maxSeen) maxSeen = t;
    }
    const newCursor = new Date(maxSeen).toISOString();
    lastUnlockSeenRef.current = newCursor;
    void putClientState("last_unlock_seen_at", newCursor);
  }, [activityEvents, profileData?.discordUserId, enqueueCelebration]);

  // ── Theme preference — reconcile (server wins) + mirror to server ──────────
  // useDayNight stores preference in localStorage for first-paint (pre-auth).
  // Once profileData loads with a theme_pref, apply it if it differs from the
  // current local preference (server wins for logged-in members — keeps pref
  // consistent across devices). After that, any preference change is mirrored
  // to the server so future logins on other devices get the same preference.
  const profileLoadedRef = useRef(false);
  // Tracks the last theme value we wrote/confirmed so the mirror effect skips
  // the redundant write-back on login when the local pref already matches server.
  const lastSyncedThemeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!profileData) return;
    const serverPref = profileData.clientState?.theme_pref;
    if (serverPref !== "auto" && serverPref !== "day" && serverPref !== "night") return;
    // Only reconcile once per profile load — don't fight the user's live changes.
    if (profileLoadedRef.current) return;
    profileLoadedRef.current = true;
    // Mark this pref as synced whether or not we apply it, so the mirror below
    // doesn't fire a redundant PUT immediately after reconcile.
    lastSyncedThemeRef.current = serverPref;
    if (serverPref !== dayNightPreference) {
      setDayNightPreference(serverPref);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileData]);

  // Mirror: any time the preference changes while the user is logged in, write
  // the new value to the server. Guard with isAuthenticated so we don't fire
  // on the pre-login default. Skip when the value matches lastSyncedThemeRef so
  // we don't fire a redundant PUT right after reconcile or on login when unchanged.
  useEffect(() => {
    if (isAuthenticated !== true) return;
    if (dayNightPreference === lastSyncedThemeRef.current) return;
    lastSyncedThemeRef.current = dayNightPreference;
    void putClientState("theme_pref", dayNightPreference);
  }, [dayNightPreference, isAuthenticated]);

  const filteredGuildMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return guildMembers;
    return guildMembers.filter(
      (member) =>
        member.displayName.toLowerCase().includes(query) ||
        member.username.toLowerCase().includes(query) ||
        member.discordUserId.toLowerCase().includes(query)
    );
  }, [guildMembers, memberSearch]);
  const selectedNight = useMemo(
    () => gameNights.find((night) => night.id === selectedNightId) ?? null,
    [gameNights, selectedNightId]
  );
  const isAdmin = Boolean(profileData?.roleNames.includes("Parent"));

  useEffect(() => {
    try {
      const savedSelectedMemberIds = window.localStorage.getItem("island.selectedMemberIds");
      const savedMemberSearch = window.localStorage.getItem("island.memberSearch");

      if (savedSelectedMemberIds) {
        const parsed = JSON.parse(savedSelectedMemberIds) as unknown;
        if (Array.isArray(parsed)) {
          const normalized = parsed.filter((item): item is string => typeof item === "string");
          setSelectedMemberIds(normalized);
        }
      }
      if (savedMemberSearch !== null) {
        setMemberSearch(savedMemberSearch);
      }
    } catch {
      // Ignore local storage parse issues.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("island.selectedMemberIds", JSON.stringify(selectedMemberIds));
  }, [selectedMemberIds]);

  useEffect(() => {
    window.localStorage.setItem("island.memberSearch", memberSearch);
  }, [memberSearch]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch("/taglines");
        if (!res.ok) return;
        const data = (await res.json()) as { taglines: string[] };
        const list = data.taglines;
        if (!list?.length) return;
        setTagline(list[Math.floor(Math.random() * list.length)]);
      } catch {
        // Non-critical — site works fine without tagline
      }
    })();
  }, []);

  useEffect(() => {
    document.title = tagline ? `${SITE_BRAND_NAME} — ${tagline}` : SITE_BRAND_NAME;
  }, [tagline]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authErrorCode = params.get("authError");
    if (!authErrorCode) {
      return;
    }

    const authErrorMessage =
      authErrorCode === "not_in_guild"
        ? `Access is limited to members of ${SITE_BRAND_NAME} Discord.`
        : authErrorCode === "guild_not_configured"
          ? "Discord guild membership checks are not configured yet."
          : "Discord login failed. Please try again.";
    setAuthError(authErrorMessage);
    params.delete("authError");
    const nextQuery = params.toString();
    navigate(`${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`, { replace: true });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const steamFlag = params.get("steam");
    if (!steamFlag) return;

    if (steamFlag === "linked") {
      setStatus("Steam linked. Pulling your library...");
      void (async () => {
        await loadProfile(true);
        await syncSteamGames(false);
      })();
    } else if (steamFlag === "error") {
      const reason = params.get("steamReason");
      setStatus(
        reason === "cancelled"
          ? "Steam sign-in was cancelled."
          : reason === "verification_failed"
            ? "Steam couldn't verify the sign-in. Please try again."
            : reason === "not_authenticated"
              ? "Sign in with Discord first, then link Steam."
              : "Steam sign-in failed. Please try again."
      );
    }

    params.delete("steam");
    params.delete("steamReason");
    const nextQuery = params.toString();
    navigate(`${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`, { replace: true });
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const bootstrapAuth = async () => {
      const authed = await loadProfile(true);
      if (isCancelled) return;
      const playReturnVideo = authed && consumePendingLoginReturn();
      if (playReturnVideo) setLoginExiting(true);
      setIsAuthenticated(authed);
      if (authed) {
        await Promise.all([
          loadGuildMembers(true),
          loadFeaturedRecommendation(true),
          loadActivity(true),
        ]);
        const deferSecondaryLoads = () => {
          void Promise.all([
            loadCrewGames(true),
            loadCrewWishlist(true),
            loadAllNews(true),
            loadNewsCards(true),
          ]);
        };
        if (typeof requestIdleCallback !== "undefined") {
          requestIdleCallback(deferSecondaryLoads, { timeout: 2000 });
        } else {
          setTimeout(deferSecondaryLoads, 0);
        }
      }
    };

    void bootstrapAuth();

    return () => {
      isCancelled = true;
    };
  }, []);

  // Auth-aware deep links. When a logged-out visitor hits a protected path, stash
  // the intended destination so we can return them to it after the Discord OAuth
  // round-trip (which is a full-page redirect, so sessionStorage carries it).
  useEffect(() => {
    if (isAuthenticated === false && location.pathname !== "/") {
      sessionStorage.setItem("returnTo", location.pathname + location.search);
    }
  }, [isAuthenticated, location.pathname, location.search]);

  // After login lands the SPA back at "/", resume the stashed deep link. Reject
  // anything that isn't a same-origin path (no protocol-relative "//evil.com").
  useEffect(() => {
    if (isAuthenticated !== true) return;
    const returnTo = sessionStorage.getItem("returnTo");
    if (!returnTo) return;
    sessionStorage.removeItem("returnTo");
    const current = location.pathname + location.search;
    if (returnTo.startsWith("/") && !returnTo.startsWith("//") && returnTo !== current) {
      navigate(returnTo, { replace: true });
    }
    // Only fire when auth flips true; intentionally not depending on location.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Server-sent events give near-instant freshness for member presence and
  // game-night changes. This is additive on top of the polling fallbacks below —
  // if SSE never flows (e.g. blocked by an edge proxy), polling still keeps the
  // UI correct. EventSource auto-reconnects on error, so no manual retry logic.
  useEffect(() => {
    if (isAuthenticated !== true) return;

    const es = new EventSource(`${API_BASE_URL}/events`, { withCredentials: true });
    es.addEventListener("members-changed", () => {
      void invalidate.invalidateMembers();
    });
    es.addEventListener("nights-changed", () => {
      void invalidate.invalidateNights();
    });
    es.addEventListener("activity-changed", () => {
      void invalidate.invalidateActivity();
    });
    es.addEventListener("nuggies-changed", (ev) => {
      // Only nudge a refetch when it's THIS member's balance that changed, so
      // the Balance/Milestones pages update live after a grant/claim/etc.
      try {
        const data = JSON.parse((ev as MessageEvent).data) as { discordUserId?: string };
        if (data?.discordUserId && data.discordUserId === myDiscordIdRef.current) {
          setNuggiesSignal((s) => s + 1);
        }
      } catch {
        // Malformed frame — ignore.
      }
    });

    return () => {
      es.close();
    };
  }, [isAuthenticated, invalidate]);

  useEffect(() => {
    if (isAuthenticated !== true || page !== "games") return;
    void loadComposerRecommendations(selectedMemberIds, true);
  }, [isAuthenticated, page, selectedMemberIds]);

  useEffect(() => {
    // Wait for the profile before bouncing — otherwise an admin deep link
    // gets redirected home during the auth bootstrap.
    if (profileData && !isAdmin && location.pathname.startsWith("/admin")) {
      navigate("/", { replace: true });
    }
  }, [profileData, isAdmin, location.pathname, navigate]);

  // Per-page scene tint: subtly recolor the backdrop vignette so sections
  // feel distinct (news cool, arcade/economy warm) without new scene layers.
  useEffect(() => {
    const tint =
      page === "games-news"
        ? "rgba(34, 211, 238, 0.06)"
        : page === "nuggies-casino"
          ? "rgba(20, 83, 45, 0.16)" // casino felt green
          : page === "nuggies" || page === "nuggies-milestones" || page === "nuggies-history" || page === "nuggies-loans"
            ? "rgba(251, 191, 119, 0.05)"
            : "transparent";
    document.documentElement.style.setProperty("--bi-scene-tint", tint);
  }, [page]);

  // Ctrl/Cmd+K opens the quick switcher from anywhere.
  useEffect(() => {
    if (isAuthenticated !== true) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuickSwitchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!selectedNightId) return;
    const exists = gameNights.some((night) => night.id === selectedNightId);
    if (exists) return;
    setSelectedNightId(null);
    setNightAttendees([]);
    setCurrentUserAttendingSelectedNight(false);
  }, [gameNights, selectedNightId]);

  async function runRecommendation() {
    if (!selectedMemberIds.length) {
      setStatus("Select one or more members first");
      return;
    }
    setStatus("Loading recommendations...");
    try {
      const response = await apiFetch("/recommendations/what-can-we-play", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          memberIds: selectedMemberIds,
          sessionLength: "any",
          maxGroupSize: selectedMemberIds.length
        })
      });
      if (!response.ok) {
        throw new Error(`Recommendation request failed (${response.status})`);
      }
      const data = (await response.json()) as { recommendations: Recommendation[] };
      setResults(data.recommendations);
      setStatus(`Loaded ${data.recommendations.length} recommendation(s)`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Recommendation request failed");
    }
  }

  async function loadProfile(silent = false) {
    if (!silent) {
      setStatus("Loading profile...");
    }
    try {
      const response = await apiFetch(`/profile/me`, { credentials: "include" });
      const data = (await response.json()) as { profile?: MeProfile | null };
      if (response.status === 401 || response.status === 403) {
        setProfileData(null);
        setIsAuthenticated(false);
        if (!silent) {
          setStatus("Session expired. Login with Discord.");
        }
        return false;
      }
      if (!response.ok) {
        throw new Error(`Profile load failed (${response.status})`);
      }
      const profile = data.profile ?? null;
      setProfileData(profile);
      setIsAuthenticated(true);
      if (profile) {
        preloadRankBadge(profile.lifetimeEarned ?? 0);
        setProfileSteamVisibility(profile.steamVisibility);
        setProfileFeatureOptIn(profile.featureOptIn);
        if (profile.steamId64) {
          void loadOwnedGames(true);
          void loadSteamExclusions();
        } else {
          setOwnedGames([]);
          setExcludedOwnedGameAppIds([]);
        }
      }
      setProfileJson(JSON.stringify(data, null, 2));
      if (!silent) {
        setStatus("Profile loaded");
      }
      return true;
    } catch (error) {
      if (!silent) {
        setStatus(error instanceof Error ? error.message : "Profile load failed");
      }
      return false;
    }
  }

  async function logout() {
    setStatus("Logging out...");
    await apiFetch(`/auth/logout`, {
      method: "POST",
      credentials: "include"
    }).catch(() => undefined);
    setProfileData(null);
    setIsAuthenticated(false);
    setStatus("Logged out. Use Login with Discord.");
  }

  async function saveProfileSettings() {
    setStatus("Saving profile settings...");
    try {
      const response = await apiFetch("/profile/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          steamVisibility: profileSteamVisibility,
          featureOptIn: profileFeatureOptIn
        })
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? `Profile save failed (${response.status})`);
      }
      await loadProfile(true);
      setStatus("Profile settings saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Profile save failed");
    }
  }

  async function loadOwnedGames(silent = false) {
    if (!silent) {
      setStatus("Loading your owned games...");
    }
    try {
      const response = await apiFetch("/steam/my-games", { credentials: "include" });
      const data = (await response.json().catch(() => null)) as { games?: OwnedGameLite[]; error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? `Owned games load failed (${response.status})`);
      }
      setOwnedGames(data?.games ?? []);
      if (!silent) {
        setStatus(`Loaded ${data?.games?.length ?? 0} owned game(s)`);
      }
    } catch (error) {
      if (!silent) {
        setStatus(error instanceof Error ? error.message : "Owned games load failed");
      }
    }
  }

  async function syncSteamGames(silent = false) {
    if (!silent) {
      setStatus("Syncing owned Steam games...");
    }
    try {
      const response = await apiFetch("/steam/sync-owned-games", {
        method: "POST",
        credentials: "include"
      });
      const data = (await response.json().catch(() => null)) as
        | {
            syncedGames?: number;
            privateLibrary?: boolean;
            error?: string;
            wishlist?: { ok?: boolean; syncedItems?: number; reason?: string };
          }
        | null;
      if (!response.ok) {
        throw new Error(data?.error ?? `Steam sync failed (${response.status})`);
      }
      await Promise.all([
        loadOwnedGames(true),
        loadCrewGames(true),
        loadCrewWishlist(true),
        loadFeaturedRecommendation(true),
        loadAllNews(true),
        loadActivity(true),
      ]);
      if (!silent) {
        if ((data?.syncedGames ?? 0) === 0 && data?.privateLibrary) {
          setStatus(
            "Your Steam library is private. In Steam: Profile -> Edit Profile -> Privacy -> set Game details to Public, then sync again."
          );
        } else {
          const wishlistInfo = data?.wishlist;
          const wishlistDetails =
            wishlistInfo?.ok === false
              ? ` Wishlist sync skipped: ${wishlistInfo.reason ?? "unavailable"}.`
              : wishlistInfo?.ok
                ? ` Wishlist: ${wishlistInfo.syncedItems ?? 0}.`
                : "";
          setStatus(`Steam sync complete (${data?.syncedGames ?? 0} game(s)).${wishlistDetails}`);
        }
      }
    } catch (error) {
      if (!silent) {
        setStatus(error instanceof Error ? error.message : "Steam sync failed");
      }
    }
  }

  async function loadCrewGames(silent = false) {
    if (!silent) {
      setStatus("Loading crew library...");
    }
    try {
      const response = await apiFetch("/steam/crew-games", { credentials: "include" });
      const data = (await response.json().catch(() => null)) as { games?: CrewOwnedGame[]; error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? `Crew library load failed (${response.status})`);
      }
      setCrewGames(data?.games ?? []);
      if (!silent) {
        setStatus(`Loaded ${data?.games?.length ?? 0} crew game(s)`);
      }
    } catch (error) {
      if (!silent) {
        setStatus(error instanceof Error ? error.message : "Crew library load failed");
      }
    }
  }

  async function loadCrewWishlist(silent = true) {
    try {
      const response = await apiFetch("/steam/crew-wishlist", { credentials: "include" });
      const data = (await response.json().catch(() => null)) as { games?: CrewWishlistGame[]; error?: string } | null;
      if (!response.ok) {
        if (!silent) {
          setStatus(data?.error ?? `Crew wishlist load failed (${response.status})`);
        }
        return;
      }
      setCrewWishlist(data?.games ?? []);
    } catch (error) {
      if (!silent) {
        setStatus(error instanceof Error ? error.message : "Crew wishlist load failed");
      }
    }
  }

  async function loadFeaturedRecommendation(silent = true) {
    try {
      const response = await apiFetch("/recommendations/featured", { credentials: "include" });
      if (!response.ok) {
        if (!silent) {
          setStatus(`Featured pick load failed (${response.status})`);
        }
        return;
      }
      const data = (await response.json().catch(() => null)) as FeaturedRecommendationResponse | null;
      setFeaturedRecommendation(data?.featured ?? null);
    } catch (error) {
      if (!silent) {
        setStatus(error instanceof Error ? error.message : "Featured pick load failed");
      }
    }
  }

  async function loadAllNews(silent = true) {
    await Promise.all([loadGameNews(silent), loadGeneralNews(silent)]);
  }

  async function loadGameNews(silent = true) {
    try {
      const response = await apiFetch("/games/news", { credentials: "include" });
      const data = (await response.json().catch(() => null)) as { news?: GameNewsItem[]; error?: string } | null;
      if (!response.ok) {
        if (!silent) setStatus(data?.error ?? `Game news load failed (${response.status})`);
        return;
      }
      setGameNews(data?.news ?? []);
    } catch (error) {
      if (!silent) setStatus(error instanceof Error ? error.message : "Game news load failed");
    }
  }

  async function loadGeneralNews(silent = true) {
    try {
      const response = await apiFetch("/news/general", { credentials: "include" });
      const data = (await response.json().catch(() => null)) as { news?: GeneralNewsItem[]; error?: string } | null;
      if (!response.ok) {
        if (!silent) setStatus(data?.error ?? `General news load failed (${response.status})`);
        return;
      }
      setGeneralNews(data?.news ?? []);
    } catch (error) {
      if (!silent) setStatus(error instanceof Error ? error.message : "General news load failed");
    }
  }

  async function loadActivity(silent = true) {
    try {
      const response = await apiFetch("/activity?limit=25", { credentials: "include" });
      const data = (await response.json().catch(() => null)) as { events?: ActivityEvent[]; error?: string } | null;
      if (!response.ok) {
        if (!silent) {
          setStatus(data?.error ?? `Activity feed load failed (${response.status})`);
        }
        return;
      }
      setActivityEvents(data?.events ?? []);
    } catch (error) {
      if (!silent) {
        setStatus(error instanceof Error ? error.message : "Activity feed load failed");
      }
    }
  }

  async function loadNewsCards(silent = true) {
    try {
      const response = await apiFetch("/news-cards", { credentials: "include" });
      const data = (await response.json().catch(() => null)) as { cards?: NewsCard[]; error?: string } | null;
      if (!response.ok) {
        if (!silent) {
          setStatus(data?.error ?? `Drift log load failed (${response.status})`);
        }
        return;
      }
      setNewsCards(data?.cards ?? []);
    } catch (error) {
      if (!silent) {
        setStatus(error instanceof Error ? error.message : "Drift log load failed");
      }
    }
  }

  async function loadServerSettings() {
    try {
      const response = await apiFetch("/settings", { credentials: "include" });
      if (!response.ok) return;
      const data = (await response.json().catch(() => null)) as { settings?: ServerSetting[] } | null;
      setServerSettings(data?.settings ?? []);
    } catch {
      // non-admin users will get 401/403 — silently ignore
    }
  }

  async function updateServerSetting(key: string, value: string) {
    setStatus("Saving setting…");
    try {
      const response = await apiFetch("/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, value })
      });
      const data = (await response.json().catch(() => null)) as { settings?: ServerSetting[]; error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? `Save failed (${response.status})`);
      setServerSettings(data?.settings ?? []);
      setStatus("Setting saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed");
    }
  }

  async function testAIConnection(opts: { provider: string; model?: string; apiKey?: string }) {
    try {
      const response = await apiFetch("/settings/ai/test", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(opts)
      });
      const data = (await response.json().catch(() => null)) as {
        ok: boolean;
        provider?: string;
        model?: string;
        error?: string;
      } | null;
      return data ?? { ok: false, error: "No response" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Request failed" };
    }
  }

  async function sendChatMessage(message: string, history: Array<{ role: "user" | "assistant"; content: string }>) {
    try {
      const response = await apiFetch("/ai/chat", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, history })
      });
      const data = (await response.json().catch(() => null)) as { reply?: string; error?: string } | null;
      if (!response.ok) return { reply: "", error: data?.error ?? "AI unavailable" };
      return { reply: data?.reply ?? "" };
    } catch (error) {
      return { reply: "", error: error instanceof Error ? error.message : "Request failed" };
    }
  }

  async function triggerNewsCuration() {
    try {
      const response = await apiFetch("/games/news/curate", {
        method: "POST",
        credentials: "include"
      });
      const data = (await response.json().catch(() => null)) as {
        ok: boolean;
        curated?: number;
        error?: string;
      } | null;
      return data ?? { ok: false, error: "No response" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Request failed" };
    }
  }

  async function triggerGeneralNewsIngest() {
    try {
      const response = await apiFetch("/news/general/ingest", { method: "POST", credentials: "include" });
      const data = (await response.json().catch(() => null)) as {
        ok: boolean;
        fetched?: number;
        curated?: number;
        embedded?: number;
        error?: string;
      } | null;
      return data ?? { ok: false, error: "No response" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Request failed" };
    }
  }

  async function triggerGeneralNewsCurate() {
    try {
      const response = await apiFetch("/news/general/curate", { method: "POST", credentials: "include" });
      const data = (await response.json().catch(() => null)) as {
        ok: boolean;
        curated?: number;
        remaining?: number;
        error?: string;
      } | null;
      return data ?? { ok: false, error: "No response" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Request failed" };
    }
  }

  async function resetGeneralNewsCorpus(opts: { confirm: string; ingestAfter?: boolean }) {
    try {
      const response = await apiFetch("/news/general/reset-corpus", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts)
      });
      const data = (await response.json().catch(() => null)) as {
        ok: boolean;
        deletedArticles?: number;
        deletedFeedback?: number;
        ingestStarted?: boolean;
        error?: string;
      } | null;
      if (!response.ok && data?.ok !== true) {
        return { ok: false, error: data?.error ?? `Request failed (${response.status})` };
      }
      return data ?? { ok: false, error: "No response" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Request failed" };
    }
  }

  async function triggerGeneralNewsEmbedBackfill(
    onProgress?: (snap: {
      state: "running" | "done" | "error";
      total: number;
      embedded: number;
      skipped: number;
      remaining: number;
      batches: number;
      error: string | null;
    }) => void
  ) {
    type JobShape = {
      state: "idle" | "running" | "done" | "error";
      total: number;
      embedded: number;
      skipped?: number;
      remaining: number;
      batches: number;
      error: string | null;
    };
    const snap = (job: JobShape, state: "running" | "done" | "error") => ({
      state,
      total: job.total,
      embedded: job.embedded,
      skipped: job.skipped ?? 0,
      remaining: job.remaining,
      batches: job.batches,
      error: state === "error" ? job.error : null
    });
    try {
      const kickResp = await apiFetch("/news/general/embed-backfill/start", {
        method: "POST",
        credentials: "include"
      });
      if (!kickResp.ok && kickResp.status !== 202 && kickResp.status !== 409) {
        const body = (await kickResp.json().catch(() => null)) as { error?: string } | null;
        return { ok: false, error: body?.error ?? `HTTP ${kickResp.status}` };
      }

      const POLL_INTERVAL_MS = 1500;
      const MAX_POLLS = 7200; // ~3 hours
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const statusResp = await apiFetch("/news/general/embed-backfill/status", { credentials: "include" });
        if (!statusResp.ok) continue;
        const data = (await statusResp.json().catch(() => null)) as { job?: JobShape } | null;
        const job = data?.job;
        if (!job) continue;

        if (job.state === "running") {
          onProgress?.(snap(job, "running"));
          continue;
        }
        if (job.state === "done") {
          onProgress?.(snap(job, "done"));
          return { ok: true, embedded: job.embedded, remaining: job.remaining };
        }
        if (job.state === "error") {
          onProgress?.(snap(job, "error"));
          return { ok: false, error: job.error ?? "Embed backfill failed" };
        }
      }
      return { ok: false, error: "Timed out waiting for embed job (still running on server — refresh to check)" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Request failed" };
    }
  }

  async function cancelGeneralNewsEmbedBackfill() {
    try {
      const response = await apiFetch("/news/general/embed-backfill/cancel", {
        method: "POST",
        credentials: "include"
      });
      const data = (await response.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      return data ?? { ok: false, error: "No response" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Request failed" };
    }
  }

  async function fetchGeneralNewsEmbedBackfillStatus() {
    try {
      const resp = await apiFetch("/news/general/embed-backfill/status", { credentials: "include" });
      if (!resp.ok) return null;
      const data = (await resp.json().catch(() => null)) as {
        job?: {
          state: "idle" | "running" | "done" | "error";
          total: number;
          embedded: number;
          skipped?: number;
          remaining: number;
          batches: number;
          error: string | null;
        };
      } | null;
      const job = data?.job;
      return job ? { ...job, skipped: job.skipped ?? 0 } : null;
    } catch {
      return null;
    }
  }

  async function triggerGeneralNewsImageBackfill(limit = 50) {
    try {
      const response = await apiFetch("/news/general/image-backfill", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit })
      });
      const data = (await response.json().catch(() => null)) as {
        ok: boolean; scanned?: number; resolved?: number; remaining?: number; error?: string;
      } | null;
      return data ?? { ok: false, error: "No response" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Request failed" };
    }
  }

  async function triggerGeneralNewsRecurate(
    onProgress?: (snap: {
      state: "running" | "done" | "error";
      reset: number;
      curated: number;
      processed: number;
      remaining: number;
      merged: number;
      duplicates: number;
      failed: number;
      costUsd: number;
      total: number;
      error: string | null;
    }) => void
  ) {
    type JobShape = {
      state: "idle" | "running" | "done" | "error";
      reset: number;
      curated: number;
      processed?: number;
      remaining?: number;
      merged?: number;
      duplicates?: number;
      failed?: number;
      costUsd?: number;
      total: number;
      error: string | null;
    };
    const snap = (job: JobShape, state: "running" | "done" | "error") => ({
      state,
      reset: job.reset,
      curated: job.curated,
      processed: job.processed ?? 0,
      remaining: job.remaining ?? 0,
      merged: job.merged ?? 0,
      duplicates: job.duplicates ?? 0,
      failed: job.failed ?? 0,
      costUsd: job.costUsd ?? 0,
      total: job.total,
      error: state === "error" ? job.error : null
    });
    try {
      const kickResp = await apiFetch("/news/general/recurate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true })
      });
      // 202 = newly started, 409 = already running (we just attach to it). Anything else = error.
      if (!kickResp.ok && kickResp.status !== 202 && kickResp.status !== 409) {
        const body = (await kickResp.json().catch(() => null)) as { error?: string } | null;
        return { ok: false, error: body?.error ?? `HTTP ${kickResp.status}` };
      }

      const POLL_INTERVAL_MS = 2000;
      const MAX_POLLS = 14400; // ~8 hours for full-corpus re-curate
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const statusResp = await apiFetch("/news/general/recurate/status", { credentials: "include" });
        if (!statusResp.ok) continue; // transient — retry on next tick
        const data = (await statusResp.json().catch(() => null)) as {
          ok?: boolean;
          job?: JobShape;
        } | null;
        const job = data?.job;
        if (!job) continue;

        if (job.state === "running") {
          onProgress?.(snap(job, "running"));
          continue;
        }
        if (job.state === "done") {
          onProgress?.(snap(job, "done"));
          return { ok: true, reset: job.reset, curated: job.curated };
        }
        if (job.state === "error") {
          onProgress?.(snap(job, "error"));
          return { ok: false, error: job.error ?? "Recurate failed" };
        }
        // state === "idle" before our kickoff registered — keep polling
      }
      return { ok: false, error: "Timed out waiting for job (still running on server — refresh to check)" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Request failed" };
    }
  }

  async function cancelGeneralNewsRecurate() {
    try {
      const response = await apiFetch("/news/general/recurate/cancel", {
        method: "POST",
        credentials: "include"
      });
      const data = (await response.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      return data ?? { ok: false, error: "No response" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Request failed" };
    }
  }

  async function fetchGeneralNewsRecurateStatus() {
    try {
      const resp = await apiFetch("/news/general/recurate/status", { credentials: "include" });
      if (!resp.ok) return null;
      const data = (await resp.json().catch(() => null)) as {
        ok?: boolean;
        job?: {
          state: "idle" | "running" | "done" | "error";
          reset: number;
          curated: number;
          processed?: number;
          remaining?: number;
          merged?: number;
          duplicates?: number;
          failed?: number;
          costUsd?: number;
          total: number;
          error: string | null;
        };
      } | null;
      return data?.job ?? null;
    } catch {
      return null;
    }
  }

  async function createNewsCard(input: {
    title: string;
    body: string;
    icon?: string;
    tag?: string | null;
    sourceUrl?: string | null;
  }) {
    setStatus("Posting drift log card...");
    try {
      const response = await apiFetch("/news-cards", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      const data = (await response.json().catch(() => null)) as { card?: NewsCard; error?: string } | null;
      if (!response.ok || !data?.card) {
        throw new Error(data?.error ?? `Drift log post failed (${response.status})`);
      }
      await loadNewsCards(true);
      setStatus(`Posted "${data.card.title}"`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Drift log post failed");
    }
  }

  async function updateNewsCard(
    id: string,
    input: { title?: string; body?: string; icon?: string; tag?: string | null; sourceUrl?: string | null }
  ) {
    setStatus("Updating drift log card...");
    try {
      const response = await apiFetch(`/news-cards/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      const data = (await response.json().catch(() => null)) as { card?: NewsCard; error?: string } | null;
      if (!response.ok || !data?.card) {
        throw new Error(data?.error ?? `Drift log update failed (${response.status})`);
      }
      await loadNewsCards(true);
      setStatus(`Updated "${data.card.title}"`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Drift log update failed");
    }
  }

  async function archiveNewsCard(id: string) {
    setStatus("Archiving drift log card...");
    try {
      const response = await apiFetch(`/news-cards/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Drift log archive failed (${response.status})`);
      }
      await loadNewsCards(true);
      setStatus("Archived drift log card");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Drift log archive failed");
    }
  }

  async function loadComposerRecommendations(memberIds: string[], silent = true) {
    if (memberIds.length === 0) {
      setComposerRecommendations([]);
      return;
    }
    try {
      const response = await apiFetch("/recommendations/what-can-we-play", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          memberIds,
          sessionLength: "any",
          maxGroupSize: memberIds.length
        })
      });
      if (!response.ok) {
        if (!silent) {
          setStatus(`Composer recommendation load failed (${response.status})`);
        }
        return;
      }
      const data = (await response.json()) as { recommendations: Recommendation[] };
      setComposerRecommendations(data.recommendations);
    } catch (error) {
      if (!silent) {
        setStatus(error instanceof Error ? error.message : "Composer recommendation load failed");
      }
    }
  }

  async function loadGuildMembers(silent = false) {
    if (!silent) {
      setStatus("Loading guild members...");
    }
    try {
      const response = await apiFetch("/members", { credentials: "include" });
      const data = (await response.json().catch(() => null)) as { members?: GuildMember[]; error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? `Member load failed (${response.status})`);
      }
      const nextMembers = data?.members ?? [];
      // Equality guard: avoid a tree-wide re-render when the 60s poll returns
      // identical member data.
      const signature = JSON.stringify(nextMembers);
      if (signature !== lastGuildMembersRef.current) {
        lastGuildMembersRef.current = signature;
        setGuildMembers(nextMembers);
      }
      if (!silent) {
        setStatus(`Loaded ${nextMembers.length} guild member(s)`);
      }
    } catch (error) {
      if (!silent) {
        setStatus(error instanceof Error ? error.message : "Member load failed");
      }
    }
  }

  async function syncGuildMembers(silent = false) {
    if (!silent) {
      setStatus("Syncing guild members from Discord...");
    }
    try {
      const response = await apiFetch(`/members/sync`, {
        method: "POST",
        credentials: "include"
      });
      const data = (await response.json().catch(() => null)) as
        | {
            syncedMembers?: number;
            error?: string;
            details?: string;
            voice?: { ok?: boolean; status?: number | null; count?: number; details?: string };
          }
        | null;
      if (!response.ok) {
        throw new Error(data?.details ?? data?.error ?? `Member sync failed (${response.status})`);
      }
      if (!silent) {
        const voiceInfo = data?.voice;
        const voiceDetails =
          voiceInfo?.ok === false
            ? ` Voice states unavailable (${voiceInfo.status ?? "no status"}). ${voiceInfo.details ?? ""}`.trim()
            : voiceInfo?.ok
              ? ` Voice states: ${voiceInfo.count ?? 0}.`
              : "";
        setStatus(`Synced ${data?.syncedMembers ?? 0} guild member(s).${voiceDetails}`);
      }
    } catch (error) {
      if (!silent) {
        setStatus(error instanceof Error ? error.message : "Member sync failed");
      }
    }
  }

  function toggleSelectedMember(discordUserId: string) {
    const next = new Set(selectedMemberIds);
    if (next.has(discordUserId)) next.delete(discordUserId);
    else next.add(discordUserId);
    setSelectedMemberIds(Array.from(next));
  }

  function selectAllFilteredMembers() {
    const next = new Set(selectedMemberIds);
    for (const member of filteredGuildMembers) {
      next.add(member.discordUserId);
    }
    setSelectedMemberIds(Array.from(next));
  }

  function clearSelectedMembers() {
    setSelectedMemberIds([]);
  }

  function useSelectedNightAttendeesAsSelection() {
    setSelectedMemberIds(nightAttendees.map((attendee) => attendee.discordUserId));
  }

  // Library "Plan" seed: resolve the owners of the chosen game from the crew
  // library, seed them as the selected members (which auto-refires the composer
  // recommendation), bump the scroll nonce so Games scrolls to its composer, and
  // hop over to Games.
  function onPlan(appId: number) {
    const game = crewGames.find((row) => row.appId === appId);
    const ownerIds = game?.owners.map((owner) => owner.discordUserId) ?? [];
    setSelectedMemberIds(ownerIds);
    setComposerScrollNonce((nonce) => nonce + 1);
    navigateToPage("games");
    toastQueue.pushToast(`Planning around ${game?.name ?? "this game"}`, "info");
  }

  function openProfile(discordUserId: string) {
    navigate(pathForIslander(discordUserId));
  }

  async function loadSteamExclusions() {
    try {
      const res = await apiFetch("/profile/steam-exclusions", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as { appIds?: number[] };
      const ids = Array.isArray(data.appIds)
        ? data.appIds.filter((v) => Number.isInteger(v) && v > 0)
        : [];
      setExcludedOwnedGameAppIds(ids);
    } catch {
      // leave current state
    }
  }

  // Server-persisted + enforced: toggling hides/shows the game across every crew
  // surface (recommender, round-ups, achievements, activity). Optimistic update,
  // revert on failure.
  function toggleExcludedOwnedGame(appId: number) {
    const isExcluded = excludedOwnedGameAppIds.includes(appId);
    setExcludedOwnedGameAppIds((current) =>
      isExcluded ? current.filter((v) => v !== appId) : [...current, appId]
    );
    void (async () => {
      try {
        const res = await apiFetch(`/profile/steam-exclusions/${appId}`, {
          method: isExcluded ? "DELETE" : "PUT",
          credentials: "include"
        });
        if (!res.ok) throw new Error("toggle failed");
      } catch {
        // revert
        setExcludedOwnedGameAppIds((current) =>
          isExcluded ? [...current, appId] : current.filter((v) => v !== appId)
        );
      }
    })();
  }

  async function loadGameNights(silent = false) {
    if (!silent) {
      setStatus("Loading game nights...");
    }
    try {
      const response = await apiFetch("/game-nights", { credentials: "include" });
      const data = (await response.json().catch(() => null)) as { gameNights?: GameNight[]; error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? `Game nights request failed (${response.status})`);
      }
      const nextNights = data?.gameNights ?? [];
      // Equality guard: avoid a tree-wide re-render when the poll returns
      // identical game-night data.
      const signature = JSON.stringify(nextNights);
      if (signature !== lastGameNightsRef.current) {
        lastGameNightsRef.current = signature;
        setGameNights(nextNights);
      }
      if (!silent) {
        setStatus(`Loaded ${nextNights.length} game night(s)`);
      }
    } catch (error) {
      if (!silent) {
        setStatus(error instanceof Error ? error.message : "Game nights request failed");
      }
    }
  }

  async function createGameNight(joinAsHost = true) {
    setStatus("Creating game night...");
    try {
      const iso = newNightScheduledFor ? new Date(newNightScheduledFor).toISOString() : "";
      const response = await apiFetch("/game-nights", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: newNightTitle,
          scheduledFor: iso,
          selectedAppId: draftAppId,
          joinAsHost,
          attendeeIds: selectedMemberIds.length ? selectedMemberIds : undefined
        })
      });
      const data = (await response.json().catch(() => null)) as { id?: number; error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? `Create game night failed (${response.status})`);
      }
      await loadGameNights();
      if (data?.id) {
        await selectNight(data.id);
      }
      setLockNonce((n) => n + 1);
      setStatus("Created game night");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Create game night failed");
    }
  }

  async function setNightGame(nightId: number, appId: number | null) {
    setStatus(appId === null ? "Clearing game..." : "Setting game...");
    try {
      const response = await apiFetch(`/game-nights/${nightId}/game`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appId })
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? `Set game failed (${response.status})`);
      await loadGameNights();
      if (selectedNightId === nightId) await loadAttendees(nightId);
      setStatus(appId === null ? "Cleared game" : "Set game for night");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Set game failed");
    }
  }

  async function selectNight(gameNightId: number, nightTitle?: string, silent = false) {
    if (!silent) {
      setStatus(`Loading ${nightTitle ?? "selected game night"}...`);
    }
    try {
      setSelectedNightId(gameNightId);
      await loadAttendees(gameNightId);
      if (!silent) {
        setStatus(`Loaded selected night`);
      }
    } catch (error) {
      if (!silent) {
        setStatus(error instanceof Error ? error.message : "Night load failed");
      }
    }
  }

  async function loadAttendees(gameNightId: number) {
    const response = await apiFetch(`/game-nights/${gameNightId}/attendees`, {
      credentials: "include"
    });
    const data = (await response.json().catch(() => null)) as
      | { attendees?: GameNightAttendee[]; currentUserIsAttending?: boolean; error?: string }
      | null;
    if (!response.ok) {
      throw new Error(data?.error ?? `Attendee load failed (${response.status})`);
    }
    const nextAttendees = data?.attendees ?? [];
    const nextAttending = Boolean(data?.currentUserIsAttending);
    // Equality guard: skip setState when the polled payload is unchanged so we
    // don't re-render the whole tree on every selected-night poll tick.
    const signature = JSON.stringify({ gameNightId, nextAttendees, nextAttending });
    if (signature === lastSelectedNightRef.current) return;
    lastSelectedNightRef.current = signature;
    setNightAttendees(nextAttendees);
    setCurrentUserAttendingSelectedNight(nextAttending);
  }

  async function joinSelectedNight() {
    if (!selectedNightId) return setStatus("Pick a game night first");
    setStatus("Joining game night...");
    try {
      const response = await apiFetch(`/game-nights/${selectedNightId}/attendees/me`, {
        method: "POST",
        credentials: "include"
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? `Join failed (${response.status})`);
      await loadGameNights();
      await loadAttendees(selectedNightId);
      setStatus("Joined game night");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Join failed");
    }
  }

  async function leaveSelectedNight() {
    if (!selectedNightId) return setStatus("Pick a game night first");
    setStatus("Leaving game night...");
    try {
      const response = await apiFetch(`/game-nights/${selectedNightId}/attendees/me`, {
        method: "DELETE",
        credentials: "include"
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? `Leave failed (${response.status})`);
      await loadGameNights();
      await loadAttendees(selectedNightId);
      setStatus("Left game night");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Leave failed");
    }
  }

  async function addSelectedMembersToNight() {
    if (!selectedNightId) return setStatus("Pick a game night first");
    if (!selectedMemberIds.length) return setStatus("Pick at least one member first");

    setStatus(`Adding ${selectedMemberIds.length} member(s) to selected game night...`);
    try {
      const response = await apiFetch(`/game-nights/${selectedNightId}/attendees`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberIds: selectedMemberIds })
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? `Add attendees failed (${response.status})`);
      await loadGameNights();
      await loadAttendees(selectedNightId);
      setStatus("Added selected members to night");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Add attendees failed");
    }
  }

  async function removeSelectedMembersFromNight() {
    if (!selectedNightId) return setStatus("Pick a game night first");
    if (!selectedMemberIds.length) return setStatus("Pick at least one member first");

    setStatus(`Removing ${selectedMemberIds.length} member(s) from selected game night...`);
    try {
      const response = await apiFetch(`/game-nights/${selectedNightId}/attendees`, {
        method: "DELETE",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberIds: selectedMemberIds })
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? `Remove attendees failed (${response.status})`);
      await loadGameNights();
      await loadAttendees(selectedNightId);
      setStatus("Removed selected members from night");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Remove attendees failed");
    }
  }

  const activeMembers = guildMembers.filter(
    (member) =>
      member.inVoice ||
      member.richPresenceText !== null ||
      (member.presenceStatus !== null && member.presenceStatus !== "offline")
  );

  // On real login (false → true), play the return cinematic.
  // OAuth is a full-page redirect, so we detect return via sessionStorage
  // (set when the user clicks "Sign in with Discord") instead of prevAuth.
  const handleLoginExitComplete = useCallback(() => {
    if (exitSafetyRef.current) {
      clearTimeout(exitSafetyRef.current);
      exitSafetyRef.current = null;
    }
    setLoginExiting(false);
  }, []);

  useEffect(() => {
    setLoginOverlayActive(isAuthenticated !== true || loginExiting);
  }, [isAuthenticated, loginExiting, setLoginOverlayActive]);

  useEffect(() => {
    if (!loginExiting) return;
    exitSafetyRef.current = setTimeout(handleLoginExitComplete, 5000);
    return () => {
      if (exitSafetyRef.current) {
        clearTimeout(exitSafetyRef.current);
        exitSafetyRef.current = null;
      }
    };
  }, [loginExiting, handleLoginExitComplete]);

  if (isAuthenticated === null) {
    return <AuthBootShell />;
  }

  if (isAuthenticated !== true || loginExiting) {
    return (
      <LoginScreen
        loading={false}
        authError={authError}
        exiting={loginExiting}
        onExitComplete={handleLoginExitComplete}
      />
    );
  }

  // ── Onboarding gate ─────────────────────────────────────────────────────────
  // Show the "Washed Ashore" tour when the member hasn't completed the current
  // onboarding version. Absent key (null / undefined) is treated as version 0.
  const showOnboarding =
    isAuthenticated === true &&
    !!profileData &&
    Number(profileData.clientState?.onboarding_version ?? 0) < (profileData.currentOnboardingVersion ?? CURRENT_ONBOARDING_VERSION);

  async function finishOnboarding() {
    // Remove sessionStorage redirect-resume key (clearSavedStep is inside
    // OnboardingFlow; this is the App-level safety net on the POST path).
    try { sessionStorage.removeItem("bi:onboarding-step"); } catch { /* ignore */ }
    try {
      await apiFetch("/profile/onboarding/complete", { method: "POST" });
    } catch {
      // Best-effort — the gate will re-show on next load if this fails,
      // but don't block the user from using the app.
    }
    await loadProfile(true);
  }

  const handleSyncSteam = () => {
    void syncSteamGames(false);
  };
  const handleLinkSteam = () => {
    // When explicitly re-linking from Settings, just redirect to Steam OAuth.
    // The onboarding tour is no longer triggered from here.
    window.location.href = `${API_BASE_URL}/steam/openid/start`;
  };

  return (
    <NuggiesSignalProvider signal={nuggiesSignal}>
    <ActivityRefetchProvider refetch={() => { void invalidate.invalidateActivity(); }}>
    <ToastQueueProvider queue={toastQueue}>
      <ScrollRestoration getKey={(loc) => loc.pathname} />
      <Topbar
        page={page ?? "home"}
        onNavigate={navigateToPage}
        profile={profileData}
        isAdmin={isAdmin}
        tagline={tagline}
        onLogout={() => void logout()}
        onOpenSearch={() => setQuickSwitchOpen(true)}
        onOpenForumThread={(threadId, postId) => {
          navigate(pathForForumThread(threadId, postId));
        }}
      />
      <div className="bi-topbar-spacer" aria-hidden="true" />
      <QuickSwitcher
        open={quickSwitchOpen}
        onClose={() => setQuickSwitchOpen(false)}
        isAdmin={isAdmin}
        guildMembers={guildMembers}
        crewGames={crewGames}
        onNavigate={navigateToPage}
        onOpenProfile={openProfile}
      />
      <OnboardingFlow
        open={showOnboarding}
        profile={profileData}
        onFinish={() => void finishOnboarding()}
      />
      <main
        className="bi-main"
        style={{
          color: islandTheme.color.textPrimary,
          backgroundColor: islandTheme.color.appBg,
          backdropFilter: islandTheme.glass.blurStrong,
          WebkitBackdropFilter: islandTheme.glass.blurStrong,
        }}
      >

      <Suspense fallback={<PageLoadingFallback />}>
      {/* Keyed on page id: remounts per top-level route so the enter animation
          replays — a 150ms fade/rise instead of a hard cut between pages. Keyed
          on page (not full pathname) so within-section navigation (forum
          threads, library filters) doesn't remount and refetch. */}
      <div key={page ?? "not-found"} className="bi-page-enter">

      {page === "home" ? (
        <HomePage
          profile={profileData}
          activeMembers={activeMembers}
          totalMemberCount={guildMembers.length}
          generalNews={generalNews}
          activityEvents={activityEvents}
          newsCards={newsCards}
          tagline={tagline}
          onNavigate={navigateToPage}
        />
      ) : null}

      {page === "games" ? (
        <GamesPage
          gameNights={gameNights}
          selectedNight={selectedNight}
          selectedNightId={selectedNightId}
          nightAttendees={nightAttendees}
          filteredGuildMembers={filteredGuildMembers}
          selectedMemberIds={selectedMemberIds}
          newNightTitle={newNightTitle}
          newNightScheduledFor={newNightScheduledFor}
          currentUserAttendingSelectedNight={currentUserAttendingSelectedNight}
          composerRecommendations={composerRecommendations}
          featuredRecommendation={featuredRecommendation}
          crewGames={crewGames}
          crewWishlist={crewWishlist}
          gameNews={gameNews}
          composerScrollNonce={composerScrollNonce}
          draftAppId={draftAppId}
          lockNonce={lockNonce}
          currentDiscordUserId={profileData?.discordUserId ?? null}
          isAdmin={isAdmin}
          onSelectNight={(id, title) => void selectNight(id, title)}
          onNewNightTitleChange={setNewNightTitle}
          onNewNightScheduledForChange={setNewNightScheduledFor}
          onToggleSelectedMember={toggleSelectedMember}
          onDraftAppIdChange={setDraftAppId}
          onSetNightGame={(nightId, appId) => void setNightGame(nightId, appId)}
          onCreateGameNight={createGameNight}
          onJoinSelectedNight={joinSelectedNight}
          onLeaveSelectedNight={leaveSelectedNight}
          onAddSelectedMembersToNight={addSelectedMembersToNight}
          onRemoveSelectedMembersFromNight={removeSelectedMembersFromNight}
          onNavigate={navigateToPage}
          onSendChatMessage={sendChatMessage}
        />
      ) : null}

      {page === "library" ? (
        <LibraryPage
          crewGames={crewGames}
          guildMembers={guildMembers}
          currentDiscordUserId={profileData?.discordUserId ?? null}
          onNavigate={navigateToPage}
          onPlan={onPlan}
        />
      ) : null}

      {page === "community" ? (
        <CommunityPage
          isAdmin={isAdmin}
          activityEvents={activityEvents}
          guildMembers={guildMembers}
          gameNights={gameNights}
          onNavigate={navigateToPage}
          openProfile={openProfile}
        />
      ) : null}

      {page === "tide-check" ? (
        <TideCheckPage onNavigate={navigateToPage} />
      ) : null}

      {page === "islander-profile" ? (
        <IslanderProfilePage targetDiscordUserId={selectedProfileId} onNavigate={navigateToPage} />
      ) : null}

      {page === "games-news" ? (
        <GamingNewsPage generalNews={generalNews} />
      ) : null}

      {page === "community-forums" ? (
        <ForumsPage profile={profileData} isAdmin={isAdmin} crewGames={crewGames} />
      ) : null}

      {page === "community-leaderboard" ? (
        <CommunityLeaderboardPage onNavigate={navigateToPage} />
      ) : null}

      {page === "crew-achievements" ? (
        <CrewAchievementsPage onNavigate={navigateToPage} />
      ) : null}

      {page === "nuggies" ? <AchievementsPage onProfileChanged={() => void loadProfile(true)} /> : null}

      {page === "nuggies-casino" ? <CasinoPage /> : null}

      {page === "nuggies-history" ? (
        <NuggiesHistoryPage onNavigate={navigateToPage} />
      ) : null}

      {page === "nuggies-loans" ? (
        <NuggiesLoansPage
          onNavigate={navigateToPage}
          guildMembers={guildMembers}
          selfDiscordUserId={profileData?.discordUserId ?? ""}
        />
      ) : null}

      {page === "nuggies-milestones" ? <MilestonesPage /> : null}

      {page === "profile" ? (
        <ProfilePage
          profileData={profileData}
          steamVisibility={profileSteamVisibility}
          onSteamVisibilityChange={setProfileSteamVisibility}
          ownedGames={ownedGames}
          ownedGameSearch={ownedGameSearch}
          onOwnedGameSearchChange={setOwnedGameSearch}
          excludedOwnedGameAppIds={excludedOwnedGameAppIds}
          onToggleExcludedOwnedGame={toggleExcludedOwnedGame}
          featureOptIn={profileFeatureOptIn}
          onFeatureOptInChange={setProfileFeatureOptIn}
          onSave={saveProfileSettings}
        />
      ) : null}

      {page === "settings" ? (
        <SettingsPage
          profileData={profileData}
          steamVisibility={profileSteamVisibility}
          onSteamVisibilityChange={setProfileSteamVisibility}
          ownedGames={ownedGames}
          ownedGameSearch={ownedGameSearch}
          onOwnedGameSearchChange={setOwnedGameSearch}
          excludedOwnedGameAppIds={excludedOwnedGameAppIds}
          onToggleExcludedOwnedGame={toggleExcludedOwnedGame}
          featureOptIn={profileFeatureOptIn}
          onFeatureOptInChange={setProfileFeatureOptIn}
          onSave={saveProfileSettings}
          onSyncSteam={handleSyncSteam}
          onLinkSteam={handleLinkSteam}
        />
      ) : null}

      {page === "admin" ? (
        <AdminPage
          selectedMemberCount={selectedMemberIds.length}
          recommendations={results}
          onRunRecommendation={runRecommendation}
          profileJson={profileJson}
          newsCards={newsCards}
          onCreateNewsCard={createNewsCard}
          onUpdateNewsCard={updateNewsCard}
          onArchiveNewsCard={archiveNewsCard}
          serverSettings={serverSettings}
          onLoadServerSettings={loadServerSettings}
          onUpdateServerSetting={updateServerSetting}
          onTestAIConnection={testAIConnection}
          onTriggerNewsCuration={triggerNewsCuration}
          onTriggerGeneralNewsIngest={triggerGeneralNewsIngest}
          onTriggerGeneralNewsCurate={triggerGeneralNewsCurate}
          onTriggerGeneralNewsRecurate={triggerGeneralNewsRecurate}
          onCancelGeneralNewsRecurate={cancelGeneralNewsRecurate}
          onTriggerGeneralNewsEmbedBackfill={triggerGeneralNewsEmbedBackfill}
          onCancelGeneralNewsEmbedBackfill={cancelGeneralNewsEmbedBackfill}
          onFetchGeneralNewsEmbedBackfillStatus={fetchGeneralNewsEmbedBackfillStatus}
          onTriggerGeneralNewsImageBackfill={triggerGeneralNewsImageBackfill}
          onFetchGeneralNewsRecurateStatus={fetchGeneralNewsRecurateStatus}
          onResetGeneralNewsCorpus={resetGeneralNewsCorpus}
        />
      ) : null}

      {page === null ? <NotFoundPage /> : null}

      </div>
      </Suspense>

      <style>{`
        .bi-page-enter {
          animation: biPageEnter 150ms ease-out;
        }
        @keyframes biPageEnter {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .bi-page-enter { animation: none; }
        }
        @keyframes islandBladePulse {
          0% {
            transform: translateY(0) scale(1);
            box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.65);
          }
          40% {
            transform: translateY(-1px) scale(1.012);
            box-shadow: 0 0 0 7px rgba(56, 189, 248, 0.18);
          }
          100% {
            transform: translateY(0) scale(1);
            box-shadow: 0 0 0 0 rgba(56, 189, 248, 0);
          }
        }
        @keyframes islandVoteBadgePop {
          0% {
            opacity: 0;
            transform: translateY(-5px) scale(0.9);
          }
          20% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-8px) scale(0.98);
          }
        }
      `}</style>

      </main>
      <MobileTabBar page={page ?? "home"} onNavigate={navigateToPage} />
      <ToastHost toasts={toastQueue.toasts} onDismiss={toastQueue.dismiss} />
      <AchievementCelebration current={celebrationQueue.current} onDismiss={celebrationQueue.dismiss} remaining={celebrationQueue.remaining} />
    </ToastQueueProvider>
    </ActivityRefetchProvider>
    </NuggiesSignalProvider>
  );
}
