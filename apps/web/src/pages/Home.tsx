import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { apiFetch } from "../api/client.js";
import { activityHref, pathForGame, pathForIslander } from "../lib/routes.js";
import { ConfettiBurst } from "../system/celebration.js";
import { LOGO_BG_URL } from "../assets.js";
import { IslandCard, IslandEmptyState, IslandSkeleton, IslandTag, islandInputStyle, useCountUp } from "../islandUi.js";
import { NuggieBadge } from "../components/NuggieBadge.js";
import { NuggieCoin } from "../components/NuggieCoin.js";
import { islandTheme } from "../theme.js";
import { GameCover, steamArt } from "../steamArt.js";
import { useRefetchActivity } from "../system/activityContext.js";
import type {
  ActivityActor,
  ActivityCategory,
  ActivityEvent,
  GeneralNewsItem,
  GuildMember,
  MeProfile,
  NewsCard as NewsCardData,
  PageId
} from "../types.js";

type HomePageProps = {
  profile: MeProfile | null;
  activeMembers: GuildMember[];
  totalMemberCount: number;
  generalNews: GeneralNewsItem[];
  activityEvents: ActivityEvent[];
  newsCards: NewsCardData[];
  tagline?: string;
  onNavigate: (page: PageId) => void;
};

type HeroPhase = "visible" | "fading" | "collapsing" | "gone";

function HomePageInner({
  profile,
  activeMembers,
  totalMemberCount,
  generalNews,
  activityEvents,
  newsCards,
  tagline,
  onNavigate
}: HomePageProps) {
  const alreadySeen = sessionStorage.getItem("hero_seen") === "1";
  const [heroPhase, setHeroPhase] = useState<HeroPhase>(alreadySeen ? "gone" : "visible");

  useEffect(() => {
    if (alreadySeen) return;
    const t1 = setTimeout(() => setHeroPhase("fading"), 4000);
    const t2 = setTimeout(() => setHeroPhase("collapsing"), 4400);
    const t3 = setTimeout(() => {
      setHeroPhase("gone");
      sessionStorage.setItem("hero_seen", "1");
    }, 4950);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const featuredArticle = generalNews[0] ?? null;
  const trending = useCrewTrending();

  return (
    <div>
      {heroPhase !== "gone" && (
        <div
          style={{
            display: "grid",
            gridTemplateRows: heroPhase === "collapsing" ? "0fr" : "1fr",
            opacity: heroPhase === "visible" ? 1 : 0,
            marginBottom: heroPhase === "collapsing" ? 0 : 28,
            transition:
              heroPhase === "collapsing"
                ? "grid-template-rows 500ms cubic-bezier(0.4,0,0.2,1), margin-bottom 500ms cubic-bezier(0.4,0,0.2,1)"
                : "opacity 360ms ease"
          }}
        >
          <div style={{ overflow: "hidden", minHeight: 0 }}>
            <Hero
              profile={profile}
              onlineCount={activeMembers.length}
              tagline={tagline}
              collageGames={trending.games ?? []}
              onNavigate={onNavigate}
            />
          </div>
        </div>
      )}
      <div style={{ display: "grid", gap: 20 }}>
        <section className="bi-home-top">
          <NuggiesSnapshot profile={profile} onNavigate={onNavigate} />
          <HomeLogoMark />
          <FriendsOnline
            activeMembers={activeMembers}
            totalMemberCount={totalMemberCount}
            onNavigate={onNavigate}
          />
        </section>
        {featuredArticle && <FeaturedNewsCard item={featuredArticle} onNavigate={onNavigate} />}
        <CrewTrending onNavigate={onNavigate} games={trending.games} loading={trending.loading} />
        <ActivityFeed events={activityEvents} onNavigate={onNavigate} />
        <DriftLog cards={newsCards} onNavigate={onNavigate} />
        <BotAndRitualRow guildId={profile?.guildId ?? null} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

export const HomePage = memo(HomePageInner);

function Hero({
  profile,
  onlineCount,
  tagline,
  collageGames,
  onNavigate
}: {
  profile: MeProfile | null;
  onlineCount: number;
  tagline?: string;
  collageGames: TrendingGame[];
  onNavigate: (page: PageId) => void;
}) {
  const name = profile?.displayName ?? "friend";
  const hour = new Date().getHours();
  const greeting =
    hour < 5
      ? { lead: "Still up,", subline: "The island's quiet and the tide's low. Night-owl co-op, anyone?" }
      : hour < 12
        ? { lead: "Morning,", subline: "Fresh coffee, calm waters. Plenty of daylight to fill the queue." }
        : hour < 17
          ? { lead: "Afternoon,", subline: "Game nights, low-stakes co-op, and a lounge that lives on Discord. Here's what's happening on the island today." }
          : hour < 22
            ? { lead: "Evening,", subline: "Prime time on the island. Round up the crew and pick something to play." }
            : { lead: "Late night,", subline: "The good hours. Low-stakes co-op while the rest of the island sleeps." };
  return (
    <section
      style={{
        position: "relative",
        isolation: "isolate",
        padding: "48px clamp(16px, 3vw, 32px) 56px",
        textAlign: "center",
        minHeight: "55vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 20
      }}
    >
      <HeroCollage games={collageGames} />
      <IslandTag tone="success" style={{ gap: 6 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: "#22c55e",
            boxShadow: "0 0 0 3px rgba(34, 197, 94, 0.18)"
          }}
        />
        {onlineCount} on the island right now
      </IslandTag>

      <h1
        className="island-display"
        style={{
          margin: 0,
          fontSize: "clamp(38px, 6vw, 68px)",
          fontWeight: 800,
          lineHeight: 1.08,
          textShadow: "0 4px 28px rgba(0,0,0,0.45)"
        }}
      >
        {greeting.lead}
        <br />
        <span style={{ fontStyle: "italic", color: islandTheme.palette.sandWarmAccent }}>{name}</span>
      </h1>

      {tagline ? (
        <div
          className="island-mono"
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: islandTheme.palette.sandWarmAccent,
            letterSpacing: "0.03em",
            opacity: 0.9,
            textShadow: "0 2px 12px rgba(251,191,119,0.35)"
          }}
        >
          {tagline}
        </div>
      ) : null}

      <p
        style={{
          margin: 0,
          maxWidth: 560,
          fontSize: 16,
          lineHeight: 1.5,
          color: islandTheme.color.textSubtle,
          opacity: 0.95
        }}
      >
        {greeting.subline}{" "}
        {onlineCount === 1 ? "1 crewmate is on the island right now." : `${onlineCount} crewmates are on the island right now.`}
      </p>

      <HeroButton variant="ghost" onClick={() => onNavigate("games")}>
        Browse games
      </HeroButton>
    </section>
  );
}


// Ambient backdrop for the hero, collaged from what the crew actually played
// this fortnight. Header art (the most reliably-present Steam asset) blurred
// into a wash — it sets mood, it isn't a showcase. Static first frame under
// prefers-reduced-motion.
function HeroCollage({ games }: { games: TrendingGame[] }) {
  const top = games.slice(0, 3).map((g) => g.appId);
  if (top.length === 0) return null;
  // Pad to 3 slots so the fixed keyframe windows always cross-fade cleanly.
  while (top.length < 3) top.push(top[top.length % games.length] ?? top[0]);
  const allSame = top.every((id) => id === top[0]);

  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: -1, overflow: "hidden", borderRadius: 24 }}>
      {top.map((appId, i) => {
        if (allSame && i > 0) return null;
        const layer: CSSProperties = {
          position: "absolute",
          inset: -24,
          background: `center / cover no-repeat url(${JSON.stringify(steamArt.header(appId))})`,
          filter: "blur(10px) saturate(118%)"
        };
        if (allSame) {
          layer.opacity = 0.3;
        } else {
          layer.opacity = 0;
          layer.animation = "biHeroCollage 24s linear infinite";
          layer.animationDelay = `${i * 8}s`;
        }
        return <div key={`${appId}-${i}`} style={layer} />;
      })}
      {/* Scrim: readable text in the middle, dissolve into the scene at the edges. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, rgba(2,6,23,0.42) 0%, rgba(2,6,23,0.18) 55%, rgba(2,6,23,0) 100%)"
        }}
      />
      <style>{`
        @keyframes biHeroCollage {
          0%   { opacity: 0; }
          6%   { opacity: 0.3; }
          33%  { opacity: 0.3; }
          41%  { opacity: 0; }
          100% { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes biHeroCollage {
            0%, 100% { opacity: 0.18; }
          }
        }
      `}</style>
    </div>
  );
}

type HeroButtonProps = {
  variant: "primary" | "ghost";
  onClick: () => void;
  children: ReactNode;
};

function HeroButton({ variant, onClick, children }: HeroButtonProps) {
  const style: CSSProperties =
    variant === "primary"
      ? {
          background: islandTheme.color.primary,
          border: `1px solid ${islandTheme.color.primary}`,
          color: islandTheme.color.primaryText
        }
      : {
          background: "transparent",
          border: `1px solid ${islandTheme.color.cardBorder}`,
          color: islandTheme.color.textPrimary
        };
  return (
    <button
      type="button"
      className="island-btn"
      onClick={onClick}
      style={{
        ...style,
        padding: "10px 18px",
        borderRadius: 999,
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
        font: "inherit"
      }}
    >
      {children}
    </button>
  );
}

// â"€â"€ Featured News Card (home snapshot) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function FeaturedNewsCard({
  item,
  onNavigate
}: {
  item: GeneralNewsItem;
  onNavigate: (page: PageId) => void;
}) {
  const displayTags = (item.aiTags?.length ?? 0) > 0 ? item.aiTags.slice(0, 3) : [item.sourceName];

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onNavigate("games-news")}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onNavigate("games-news"); }}
      style={{
        position: "relative",
        borderRadius: 14,
        overflow: "hidden",
        background: item.imageUrl
          ? `linear-gradient(135deg, rgba(8,16,34,0.93) 35%, rgba(8,16,34,0.55) 75%, rgba(8,16,34,0.2) 100%), url("${item.imageUrl}") center / cover no-repeat`
          : `linear-gradient(135deg, rgba(37,99,235,0.22) 0%, ${islandTheme.color.panelBg} 80%)`,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        cursor: "pointer",
        transition: "transform 160ms ease, box-shadow 160ms ease"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow = islandTheme.shadow.cardHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap"
        }}
      >
        <div style={{ flex: "1 1 0", minWidth: 0, display: "grid", gap: 6 }}>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {displayTags.map((tag) => (
              <IslandTag key={tag}>{tag}</IslandTag>
            ))}
          </div>
          <h3
            className="island-display"
            style={{ margin: 0, fontSize: "clamp(15px, 2vw, 18px)", lineHeight: 1.2, color: islandTheme.color.textPrimary }}
          >
            {item.title}
          </h3>
          {item.aiSubtitle && (
            <p style={{ margin: 0, fontSize: 12, color: islandTheme.color.textSubtle, lineHeight: 1.35, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {item.aiSubtitle}
            </p>
          )}
        </div>
        <button
          type="button"
          className="island-btn"
          onClick={(e) => { e.stopPropagation(); onNavigate("games-news"); }}
          style={{
            flexShrink: 0,
            background: "transparent",
            border: `1px solid ${islandTheme.color.cardBorder}`,
            color: islandTheme.color.textPrimary,
            padding: "7px 14px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            font: "inherit",
            whiteSpace: "nowrap"
          }}
        >
          All gaming news →
        </button>
      </div>
    </article>
  );
}

// â"€â"€ Crew Trending (hot this week) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type TrendingGame = {
  appId: number;
  name: string;
  headerImageUrl: string | null;
  totalMinutes2Weeks: number;
  /** Rolling window from ~a fortnight ago; null until snapshots accrue. */
  prevMinutes2Weeks?: number | null;
  players: number;
  topPlayer: { displayName: string; minutes: number } | null;
};

// Fetched once at page level — the hero collage and the trending list share it.
function useCrewTrending(): { games: TrendingGame[] | null; loading: boolean } {
  const [games, setGames] = useState<TrendingGame[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void apiFetch("/steam/crew-trending")
      .then(async (r) => {
        if (!r.ok || cancelled) return;
        const d = (await r.json().catch(() => null)) as { games?: TrendingGame[] } | null;
        if (!cancelled) setGames(Array.isArray(d?.games) ? d.games : []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { games, loading };
}

function CrewTrending({
  onNavigate,
  games,
  loading
}: {
  onNavigate: (page: PageId) => void;
  games: TrendingGame[] | null;
  loading: boolean;
}) {
  // Hide entirely on a quiet week (no trending data) so the home page stays tidy.
  if (!loading && (!games || games.length === 0)) return null;

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <SectionHead
        title="Hot this week on the island"
        meta="What the crew's actually bingeing — playtime from the last fortnight."
        action="Browse games →"
        onAction={() => onNavigate("games")}
      />
      <IslandCard style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14 }}>
        {loading ? (
          // Skeleton mirrors the final row layout (rank · art · text · stats)
          // so the card doesn't reflow when data lands.
          <>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                aria-hidden="true"
                style={{
                  display: "grid",
                  gridTemplateColumns: "18px 92px minmax(0, 1fr) auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "8px 10px",
                  borderRadius: 10,
                  background: islandTheme.color.panelMutedBg,
                  border: `1px solid ${islandTheme.color.cardBorder}`
                }}
              >
                <IslandSkeleton width={14} height={16} />
                <IslandSkeleton width={92} height={43} radius={8} />
                <div style={{ display: "grid", gap: 6 }}>
                  <IslandSkeleton width="55%" height={12} />
                  <IslandSkeleton width="35%" height={10} />
                </div>
                <IslandSkeleton width={48} height={26} />
              </div>
            ))}
          </>
        ) : (
          (games ?? []).map((game, i) => <TrendingRow key={game.appId} game={game} rank={i + 1} />)
        )}
      </IslandCard>
    </section>
  );
}

const TRENDING_RANK_COLORS = [islandTheme.color.nuggieGold, "#cbd5e1", "#d4956a"];

function TrendingRow({ game, rank }: { game: TrendingGame; rank: number }) {
  const hours = (game.totalMinutes2Weeks / 60).toFixed(1);
  const leaderHours = game.topPlayer ? Math.round(game.topPlayer.minutes / 60) : 0;
  // Delta vs the snapshot from ~14 days back; hidden until |Δ| ≥ 1h or no history.
  const deltaMin =
    typeof game.prevMinutes2Weeks === "number" ? game.totalMinutes2Weeks - game.prevMinutes2Weeks : null;
  const deltaHours = deltaMin !== null ? Math.round(Math.abs(deltaMin) / 60) : 0;
  const showDelta = deltaMin !== null && deltaHours >= 1;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "18px 92px minmax(0, 1fr) auto",
        gap: 12,
        alignItems: "center",
        padding: "8px 10px",
        borderRadius: 10,
        background: islandTheme.color.panelMutedBg,
        border: `1px solid ${islandTheme.color.cardBorder}`
      }}
    >
      <span
        className="island-display"
        aria-hidden="true"
        style={{
          fontSize: 15,
          fontWeight: 800,
          textAlign: "center",
          color: TRENDING_RANK_COLORS[rank - 1] ?? islandTheme.color.textMuted
        }}
      >
        {rank}
      </span>
      {/* GameCover walks stored URL → Steam CDN header → 🎮 placeholder, so the
          row never renders an empty box when enrichment hasn't run yet. */}
      <GameCover
        appId={game.appId}
        storedUrl={game.headerImageUrl}
        alt={game.name}
        style={{
          width: 92,
          height: 43,
          borderRadius: 8,
          border: `1px solid ${islandTheme.color.cardBorder}`
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {game.name}
        </div>
        {game.topPlayer ? (
          <div
            style={{
              fontSize: 12,
              color: islandTheme.color.textMuted,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis"
            }}
          >
            led by {game.topPlayer.displayName}
            {leaderHours > 0 ? ` · ${leaderHours}h logged` : ""}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.1 }}>
        <span className="island-display" style={{ fontSize: 16, fontWeight: 800, color: islandTheme.color.nuggieGold }}>
          {hours}h
          {showDelta ? (
            <span
              className="island-mono"
              title={`vs last fortnight: ${deltaMin! > 0 ? "+" : "−"}${deltaHours}h`}
              style={{
                marginLeft: 6,
                fontSize: 12,
                fontWeight: 700,
                color: deltaMin! > 0 ? islandTheme.color.successAccent : islandTheme.color.dangerSoft
              }}
            >
              {deltaMin! > 0 ? "↑" : "↓"}{deltaHours}h
            </span>
          ) : null}
        </span>
        <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {game.players === 1 ? "1 player" : `${game.players} players`}
        </span>
      </div>
    </div>
  );
}

// â"€â"€ Nuggies Snapshot â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const NUGGIE_SLOTS: Array<{ type: "title" | "flair" | "badge"; emoji: string; label: string }> = [
  { type: "title", emoji: "🏷", label: "Title" },
  { type: "flair", emoji: "✨", label: "Flair" },
  { type: "badge", emoji: "🎖", label: "Badge" }
];

type DailyTx = { type: string; createdAt: string };

// Daily reset boundary: midnight in America/Halifax (= 11pm ET year-round).
const RESET_TZ = "America/Halifax";

function isClaimedToday(txs: DailyTx[]): boolean {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: RESET_TZ });
  return txs.some((tx) => {
    if (tx.type !== "daily") return false;
    const d = new Date(tx.createdAt).toLocaleDateString("en-CA", { timeZone: RESET_TZ });
    return d === today;
  });
}

function msUntilNextDailyReset(): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: RESET_TZ,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = fmt.formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const h = Number(map.hour) || 0;
  const m = Number(map.minute) || 0;
  const s = Number(map.second) || 0;
  const msOfDay = h * 3_600_000 + m * 60_000 + s * 1000;
  return Math.max(0, 86_400_000 - msOfDay);
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function HomeLogoMark() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "relative",
        alignSelf: "stretch",
        minHeight: 320,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "visible"
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "-10% -8%",
          background:
            "radial-gradient(closest-side, rgba(251,191,119,0.22) 0%, rgba(56,189,248,0.10) 38%, transparent 72%)",
          filter: "blur(6px)",
          pointerEvents: "none"
        }}
      />
      <img
        src={LOGO_BG_URL}
        alt=""
        style={{
          position: "relative",
          width: 275,
          height: 275,
          display: "block",
          clipPath: "circle(40%)",
          WebkitClipPath: "circle(40%)",
          filter:
            "drop-shadow(0 0 18px rgba(251,191,119,0.35)) drop-shadow(0 14px 24px rgba(0,0,0,0.45))",
          animation: "homeLogoFloat 6s ease-in-out infinite"
        }}
      />
      <style>{`
        @keyframes homeLogoFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}

function NuggiesSnapshot({ profile, onNavigate }: { profile: MeProfile | null; onNavigate: (page: PageId) => void }) {
  const baseBalance = profile?.nuggieBalance;
  const optedOut = profile?.nuggiesOptedOut ?? false;
  const equipped = profile?.equippedItems ?? [];
  const equippedCount = equipped.length;

  const [balanceOverride, setBalanceOverride] = useState<number | null>(null);
  const [claimedToday, setClaimedToday] = useState<boolean | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimFlash, setClaimFlash] = useState<{ amount: number } | null>(null);
  const [claimConfetti, setClaimConfetti] = useState(0);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [msLeft, setMsLeft] = useState(() => msUntilNextDailyReset());
  const refetchActivity = useRefetchActivity();

  useEffect(() => {
    if (optedOut) return;
    let cancelled = false;
    void apiFetch("/nuggies/me").then(async (r) => {
      if (!r.ok || cancelled) return;
      const d = (await r.json()) as { claimedToday?: boolean; transactions?: DailyTx[] };
      // Server-side flag is authoritative — the transactions list is capped at
      // 20 rows, so a busy casino day pushes the daily claim off the page and
      // the legacy scan would wrongly re-show the button.
      if (!cancelled) {
        setClaimedToday(
          typeof d.claimedToday === "boolean" ? d.claimedToday : isClaimedToday(d.transactions ?? [])
        );
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [optedOut]);

  useEffect(() => {
    if (claimedToday !== true) return;
    setMsLeft(msUntilNextDailyReset());
    const id = setInterval(() => {
      const next = msUntilNextDailyReset();
      setMsLeft(next);
      if (next === 0) setClaimedToday(false);
    }, 1000);
    return () => clearInterval(id);
  }, [claimedToday]);

  const balance = balanceOverride ?? baseBalance;
  // Count-up instead of snapping when the balance changes (claim, SSE update).
  const animatedBalance = useCountUp(balance ?? 0);

  async function handleClaim() {
    if (claiming || claimedToday) return;
    setClaiming(true);
    setClaimError(null);
    try {
      const res = await apiFetch("/nuggies/daily", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { newBalance?: number; amount?: number; error?: string };
      if (res.ok && body.newBalance !== undefined) {
        setBalanceOverride(body.newBalance);
        setClaimedToday(true);
        setClaimFlash({ amount: body.amount ?? 0 });
        setClaimConfetti((n) => n + 1);
        setTimeout(() => setClaimFlash(null), 3500);
        void refetchActivity();
      } else if (res.status === 409) {
        setClaimedToday(true);
      } else {
        setClaimError(body.error ?? "Claim failed");
      }
    } catch (e) {
      setClaimError(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <IslandCard
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 14,
        background: `linear-gradient(135deg, rgba(251,191,119,0.12) 0%, ${islandTheme.color.panelBg} 100%)`,
        border: `1px solid rgba(251,191,119,0.2)`
      }}
    >
      <ConfettiBurst trigger={claimConfetti} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3 className="island-display" style={{ margin: 0, fontSize: 16 }}>Nuggies</h3>
        <NuggieCoin size={22} />
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          className="island-display"
          style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1, color: islandTheme.color.nuggieGold }}
        >
          {balance !== undefined && !optedOut ? `₦${animatedBalance.toLocaleString()}` : "—"}
        </span>
        <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          available
        </span>
      </div>

      {!optedOut ? (
        <>
          <div
            className="island-mono"
            style={{
              display: "flex",
              gap: 6,
              fontSize: 12,
              color: islandTheme.color.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.06em"
            }}
          >
            <span>Equipped</span>
            <span style={{ color: islandTheme.color.textPrimary }}>{equippedCount} / 3</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {NUGGIE_SLOTS.map((slot) => {
              const item = equipped.find((e) => e.itemType === slot.type);
              return item ? (
                <div key={slot.type} style={{ display: "flex" }}>
                  <NuggieBadge item={item} size="sm" />
                </div>
              ) : (
                <div
                  key={slot.type}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    padding: "4px 6px",
                    borderRadius: 8,
                    border: `1px dashed ${islandTheme.color.cardBorder}`,
                    fontSize: 12,
                    color: islandTheme.color.textMuted
                  }}
                  title={`No ${slot.label.toLowerCase()} equipped`}
                >
                  <span style={{ opacity: 0.5 }}>{slot.emoji}</span>
                  <span className="island-mono" style={{ textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 12 }}>
                    {slot.label}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: islandTheme.color.textSubtle }}>
          Balance hidden (opted out)
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 4,
          paddingTop: 8,
          borderTop: `1px solid ${islandTheme.color.cardBorder}`
        }}
      >
        {claimFlash ? (
          <div style={{ ...nuggieFooterBtnStyle("#22c55e"), cursor: "default", color: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            +{claimFlash.amount} <NuggieCoin size={16} /> claimed!
          </div>
        ) : !optedOut && claimedToday === true ? (
          <div style={{ ...nuggieFooterBtnStyle(islandTheme.color.nuggieGold), cursor: "default", display: "flex", flexDirection: "column", alignItems: "center", gap: 1, lineHeight: 1.1, padding: "4px 10px" }}>
            <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Next claim
            </span>
            <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.nuggieGold, fontWeight: 700 }}>
              {formatCountdown(msLeft)}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void handleClaim()}
            disabled={claiming || optedOut || claimedToday === null}
            style={{
              ...nuggieFooterBtnStyle(islandTheme.color.nuggieGold),
              opacity: claiming || optedOut || claimedToday === null ? 0.6 : 1,
              cursor: claiming ? "wait" : optedOut ? "not-allowed" : "pointer"
            }}
          >
            {!claiming && !optedOut && claimedToday === false ? (
              <GlowFollower
                accent={islandTheme.color.nuggieGold}
                colors={{ primary: "rgba(251, 191, 119, 0.55)", secondary: "rgba(245, 158, 11, 0.45)" }}
              />
            ) : null}
            <span style={{ position: "relative", zIndex: 1 }}>
              {claiming ? "Claiming…" : "🎁 Claim daily"}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => onNavigate("nuggies")}
          style={nuggieFooterBtnStyle(islandTheme.color.primaryGlow)}
        >
          <GlowFollower
            accent={islandTheme.color.primaryGlow}
            colors={{ primary: "rgba(56, 189, 248, 0.55)", secondary: "rgba(168, 85, 247, 0.45)" }}
          />
          <span style={{ position: "relative", zIndex: 1 }}>🛍 Shop</span>
        </button>
      </div>
      {claimError && (
        <div style={{ fontSize: 12, color: islandTheme.color.dangerAccent, marginTop: 4 }}>
          {claimError}
        </div>
      )}
    </IslandCard>
  );
}

function nuggieFooterBtnStyle(accent: string): CSSProperties {
  return {
    flex: 1,
    position: "relative",
    overflow: "hidden",
    background: "transparent",
    border: `1px solid ${islandTheme.color.cardBorder}`,
    color: accent,
    fontSize: 12,
    fontWeight: 700,
    padding: "6px 10px",
    borderRadius: 8,
    cursor: "pointer",
    font: "inherit",
    textAlign: "center",
    transition: "border-color 180ms ease, box-shadow 180ms ease"
  };
}

type GlowColors = { primary: string; secondary: string };

/**
 * Wraps a button's content with a mouse-following radial highlight + an
 * outer box-shadow glow that fades in on hover. Glow intensifies near the
 * cursor's position relative to the button.
 */
function GlowFollower({ colors, accent }: { colors: GlowColors; accent: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState(false);

  // Attach listeners to the parent button via a ref-effect dance. The
  // parent doesn't need to wire them itself.
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const span = ref.current;
    const parent = span?.parentElement;
    if (!parent) return;
    const onEnter = () => setHover(true);
    const onLeave = () => { setHover(false); setPos(null); };
    const onMove = (e: MouseEvent) => {
      const rect = parent.getBoundingClientRect();
      setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    parent.addEventListener("mouseenter", onEnter);
    parent.addEventListener("mouseleave", onLeave);
    parent.addEventListener("mousemove", onMove);
    return () => {
      parent.removeEventListener("mouseenter", onEnter);
      parent.removeEventListener("mouseleave", onLeave);
      parent.removeEventListener("mousemove", onMove);
    };
  }, []);

  // Outer glow strength: scales with cursor proximity to button center,
  // capped so corners still feel "lit". When pos unknown, use a soft static.
  const parent = ref.current?.parentElement as HTMLElement | undefined;
  let outerShadow: string | undefined;
  if (hover && parent) {
    outerShadow = `0 0 12px ${colors.primary}, 0 0 24px ${colors.secondary}`;
  }
  // Apply outer shadow + border accent to the parent imperatively so it
  // doesn't fight the parent's inline style props.
  useEffect(() => {
    if (!parent) return;
    if (hover) {
      parent.style.boxShadow = outerShadow ?? "";
      parent.style.borderColor = accent;
    } else {
      parent.style.boxShadow = "";
      parent.style.borderColor = "";
    }
  }, [hover, outerShadow, parent, accent]);

  const mx = pos ? `${pos.x}px` : "50%";
  const my = pos ? `${pos.y}px` : "50%";

  return (
    <span
      ref={ref}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity: hover ? 1 : 0,
        transition: "opacity 160ms ease",
        background: `radial-gradient(120px circle at ${mx} ${my}, ${colors.primary} 0%, ${colors.secondary} 35%, transparent 70%)`,
        mixBlendMode: "screen",
      }}
    />
  );
}
function FriendsOnline({
  activeMembers,
  totalMemberCount,
  onNavigate
}: {
  activeMembers: GuildMember[];
  totalMemberCount: number;
  onNavigate: (page: PageId) => void;
}) {
  const display = activeMembers.slice(0, 5);
  return (
    <IslandCard
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 14
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 className="island-display" style={{ margin: 0, fontSize: 16 }}>
          Friends online
        </h3>
        <span
          className="island-mono"
          style={{ fontSize: 12, color: islandTheme.color.textMuted }}
        >
          {activeMembers.length} / {totalMemberCount || '—'}
        </span>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {display.length ? (
          display.map((m) => <CrewRow key={m.discordUserId} member={m} />)
        ) : (
          <IslandEmptyState
            pose="snooze"
            compact
            title="Quiet shoreline right now"
            body="Crew sync runs every minute — friends show up here the moment they're online."
          />
        )}
      </div>
      <button
        type="button"
        className="island-btn"
        onClick={() => onNavigate("community")}
        style={{
          marginTop: 6,
          alignSelf: "flex-start",
          background: "transparent",
          border: "none",
          color: islandTheme.color.primaryGlow,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          padding: 0,
          font: "inherit"
        }}
      >
        All {totalMemberCount || "—"} crew →
      </button>
    </IslandCard>
  );
}

function CrewRow({ member }: { member: GuildMember }) {
  const status: "voice" | "online" | "idle" | "dnd" = member.inVoice
    ? "voice"
    : member.presenceStatus === "dnd"
      ? "dnd"
      : member.presenceStatus === "idle"
        ? "idle"
        : "online";
  const presence =
    member.richPresenceText ??
    (member.inVoice
      ? "In a voice channel"
      : status === "dnd"
        ? "Do not disturb"
        : status === "idle"
          ? "Idle"
          : "Online");
  const badgeColor =
    status === "voice"
      ? islandTheme.color.successAccent
      : status === "dnd"
        ? islandTheme.color.dangerAccent
        : status === "idle"
          ? islandTheme.color.warnAccent
          : islandTheme.color.primaryGlow;
  const badgeLabel =
    status === "voice" ? "voice" : status === "dnd" ? "dnd" : status === "idle" ? "idle" : "online";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "28px minmax(0, 1fr) auto",
        gap: 8,
        alignItems: "center",
        padding: "5px 8px",
        borderRadius: 10,
        background: islandTheme.color.panelMutedBg,
        border: `1px solid ${islandTheme.color.cardBorder}`
      }}
    >
      <CrewAvatar member={member} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {member.displayName}
        </div>
        <div
          style={{
            fontSize: 12,
            color: islandTheme.color.textMuted,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }}
        >
          {presence}
        </div>
      </div>
      <span
        className="island-mono"
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: badgeColor
        }}
      >
        {badgeLabel}
      </span>
    </div>
  );
}

function CrewAvatar({ member }: { member: GuildMember }) {
  const initials = (member.displayName || member.username || "??").slice(0, 2).toUpperCase();
  if (member.avatarUrl) {
    return (
      <img
        src={member.avatarUrl}
        alt=""
        style={{ width: 28, height: 28, borderRadius: 999, objectFit: "cover" }}
      />
    );
  }
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: 999,
        background: pickColorFor(member.discordUserId),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 800,
        color: islandTheme.color.textDark
      }}
    >
      {initials}
    </div>
  );
}

const AVATAR_PALETTE = islandTheme.categorical.avatars;

function pickColorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function Target({ children }: { children: ReactNode }) {
  return (
    <span style={{ color: islandTheme.color.primaryGlow, fontWeight: 600 }}>{children}</span>
  );
}

const ACTIVITY_TABS: Array<{ id: ActivityCategory; label: string }> = [
  { id: "all", label: "All" },
  { id: "friends", label: "Friends" },
  { id: "forums", label: "Forums" },
  { id: "nuggies", label: "Nuggies" },
  { id: "achievements", label: "Achievements" },
  { id: "milestones", label: "Milestones" },
  { id: "patches", label: "Patch notes" }
];

const ACTOR_COLORS = islandTheme.categorical.avatars;

function colorForActor(id: string | null | undefined): string {
  if (!id) return ACTOR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return ACTOR_COLORS[hash % ACTOR_COLORS.length];
}

function initialsFor(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function relativeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const delta = Math.max(0, Date.now() - then);
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 8) return `${weeks}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}

type ActivityRendered = {
  body: ReactNode;
  icon: string;
  metaText: string;
};

// Actor name that links to the islander's profile (when we have their id).
// stopPropagation so it wins over the whole-row click without double-firing.
function ActorLink({ actor }: { actor: ActivityActor | null }) {
  const name = actor?.displayName ?? "A crew member";
  if (!actor?.discordUserId) return <strong>{name}</strong>;
  return (
    <Link
      to={pathForIslander(actor.discordUserId)}
      onClick={(e) => e.stopPropagation()}
      style={{ fontWeight: 700, color: "inherit", textDecoration: "none" }}
      onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
      onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
    >
      {name}
    </Link>
  );
}

function casinoGameLabel(game: string): string {
  switch (game) {
    case "coinflip":
      return "Coinflip";
    case "blackjack":
      return "Blackjack";
    case "guessnumber":
      return "Guess the Number";
    default:
      return game;
  }
}

function describeEvent(event: ActivityEvent): ActivityRendered | null {
  const actorNode = <ActorLink actor={event.actor} />;
  const game = event.game;
  const ago = relativeAgo(event.createdAt);
  const payload = event.payload as Record<string, unknown>;

  switch (event.eventType) {
    case "game_night.created": {
      const title = typeof payload.title === "string" ? payload.title : "a new session";
      return {
        icon: "🌴",
        metaText: ago,
        body: (
          <>
            {actorNode} scheduled <Target>{title}</Target>.
          </>
        )
      };
    }
    case "game_night.rsvp_joined":
      return {
        icon: "🪵",
        metaText: ago,
        body: (
          <>
            {actorNode} RSVP'd to the next <Target>game night</Target>.
          </>
        )
      };
    case "game_night.rsvp_left":
      return {
        icon: "🌫",
        metaText: ago,
        body: (
          <>
            {actorNode} stepped off the dock for the next session.
          </>
        )
      };
    case "game_night.game_picked":
      return {
        icon: "🎯",
        metaText: ago,
        body: (
          <>
            {actorNode} locked in <Target>{game?.name ?? "a game"}</Target> for the next session.
          </>
        )
      };
    case "steam.linked":
      return {
        icon: "🔗",
        metaText: ago,
        body: (
          <>
            {actorNode} wired up their <Target>Steam library</Target>.
          </>
        )
      };
    case "steam.unlinked":
      return {
        icon: "🪢",
        metaText: ago,
        body: (
          <>
            {actorNode} unhooked their Steam library.
          </>
        )
      };
    case "achievement.unlocked": {
      const name = typeof payload.name === "string" ? payload.name : "an achievement";
      const emoji = typeof payload.emoji === "string" ? payload.emoji : "🏆";
      return {
        icon: emoji,
        metaText: ago,
        body: (
          <>
            {actorNode} unlocked <Target>{name}</Target>.
          </>
        )
      };
    }
    case "achievement.steam_progress": {
      const delta = typeof payload.unlockedDelta === "number" ? payload.unlockedDelta : 0;
      const gameName = typeof payload.gameName === "string" ? payload.gameName : "a game";
      return {
        icon: "🏆",
        metaText: ago,
        body: (
          <>
            {actorNode} unlocked {delta} achievement{delta === 1 ? "" : "s"} in{" "}
            <Target>{gameName}</Target>.
          </>
        )
      };
    }
    case "milestone.reached": {
      const label = typeof payload.label === "string" ? payload.label : "a new tier";
      const emoji = typeof payload.emoji === "string" ? payload.emoji : "⭐";
      const threshold = typeof payload.threshold === "number" ? payload.threshold : null;
      return {
        icon: emoji,
        metaText: ago,
        body: (
          <>
            {actorNode} hit <Target>{label}</Target>
            {threshold !== null ? ` (₦${threshold.toLocaleString()})` : ""}.
          </>
        )
      };
    }
    case "forum_thread_created": {
      const title = typeof payload.title === "string" ? payload.title : "a new thread";
      return {
        icon: "💬",
        metaText: ago,
        body: (
          <>
            {actorNode} started <Target>{title}</Target> in the forums.
          </>
        )
      };
    }
    case "forum_reply_created": {
      const title = typeof payload.threadTitle === "string" ? payload.threadTitle : "a thread";
      return {
        icon: "💬",
        metaText: ago,
        body: (
          <>
            {actorNode} replied to <Target>{title}</Target>.
          </>
        )
      };
    }
    case "news.card_published": {
      const title = typeof payload.title === "string" ? payload.title : "an update";
      return {
        icon: "📰",
        metaText: ago,
        body: (
          <>
            {actorNode} posted <Target>{title}</Target> to the drift log.
          </>
        )
      };
    }
    case "forum.reactions_milestone": {
      const title = typeof payload.threadTitle === "string" ? payload.threadTitle : "a post";
      const count = typeof payload.count === "number" ? payload.count : 0;
      return {
        icon: "🔥",
        metaText: ago,
        body: (
          <>
            {actorNode}'s post in <Target>{title}</Target> hit <strong>{count} reactions</strong>.
          </>
        )
      };
    }
    case "member.joined": {
      const name =
        typeof payload.displayName === "string" && payload.displayName
          ? payload.displayName
          : event.actor?.displayName ?? "A new islander";
      return {
        icon: "🌴",
        metaText: ago,
        body: (
          <>
            <strong>{name}</strong> washed ashore — welcome aboard!
          </>
        )
      };
    }
    case "nuggies.daily_claimed": {
      const amount = typeof payload.amount === "number" ? payload.amount : 0;
      return {
        icon: "🍗",
        metaText: ago,
        body: (
          <>
            {actorNode} claimed their daily <Target>₦{amount.toLocaleString()}</Target>.
          </>
        )
      };
    }
    case "casino.big_win": {
      const net = typeof payload.net === "number" ? payload.net : 0;
      const g = typeof payload.game === "string" ? payload.game : "the casino";
      return {
        icon: "🎰",
        metaText: ago,
        body: (
          <>
            {actorNode} won big at <Target>{casinoGameLabel(g)}</Target> —{" "}
            <strong>+₦{net.toLocaleString()}</strong>.
          </>
        )
      };
    }
    case "nuggies.loan_accepted": {
      const principal = typeof payload.principal === "number" ? payload.principal : 0;
      return {
        icon: "🤝",
        metaText: ago,
        body: (
          <>
            {actorNode} took a <Target>₦{principal.toLocaleString()}</Target> loan
            {event.target ? (
              <>
                {" "}
                from <ActorLink actor={event.target} />
              </>
            ) : null}
            .
          </>
        )
      };
    }
    case "nuggies.loan_repaid": {
      const amount = typeof payload.amount === "number" ? payload.amount : 0;
      return {
        icon: "💸",
        metaText: ago,
        body: (
          <>
            {actorNode} repaid a <Target>₦{amount.toLocaleString()}</Target> loan
            {event.target ? (
              <>
                {" "}
                to <ActorLink actor={event.target} />
              </>
            ) : null}
            .
          </>
        )
      };
    }
    default:
      return {
        icon: "✨",
        metaText: ago,
        body: (
          <>
            {actorNode} · {event.eventType}
          </>
        )
      };
  }
}

const ACTIVITY_INITIAL_LIMIT = 25;
const ACTIVITY_PAGE_SIZE = 25;
const ACTIVITY_MAX_LIMIT = 100;

type ActivitySort = "newest" | "oldest" | "type";
type ActivityDateRange = "all" | "24h" | "7d" | "30d";

const ACTIVITY_DATE_WINDOWS: Record<Exclude<ActivityDateRange, "all">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000
};

const ACTIVITY_LAST_SEEN_KEY = "bi:activity:last-seen";

function readActivityLastSeen(): number {
  try {
    const v = localStorage.getItem(ACTIVITY_LAST_SEEN_KEY);
    const n = v ? Number(v) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeActivityLastSeen(ts: number): void {
  try {
    localStorage.setItem(ACTIVITY_LAST_SEEN_KEY, String(ts));
  } catch {
    // localStorage unavailable (private mode) — the "new" marker just stays off.
  }
}

function eventTs(iso: string): number {
  const n = new Date(iso).getTime();
  return Number.isFinite(n) ? n : 0;
}

function ActivityFeed({ events: initialEvents, onNavigate }: { events: ActivityEvent[]; onNavigate: (page: PageId) => void }) {
  const [tab, setTab] = useState<ActivityCategory>("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<ActivitySort>("newest");
  const [dateRange, setDateRange] = useState<ActivityDateRange>("all");
  const [events, setEvents] = useState<ActivityEvent[]>(initialEvents);
  const [limit, setLimit] = useState(() => Math.max(initialEvents.length, ACTIVITY_INITIAL_LIMIT));
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // "New since last visit": baseline captured once on mount so the markers
  // persist for this view; the newest seen timestamp is persisted so the next
  // visit starts clean. 0 baseline (first-ever visit) shows no markers.
  const [lastSeenBaseline] = useState(() => readActivityLastSeen());
  useEffect(() => {
    if (events.length === 0) return;
    const newest = events.reduce((m, e) => Math.max(m, eventTs(e.createdAt)), 0);
    if (newest > 0) writeActivityLastSeen(newest);
  }, [events]);
  const newCount = useMemo(
    () =>
      lastSeenBaseline > 0
        ? events.filter((e) => eventTs(e.createdAt) > lastSeenBaseline).length
        : 0,
    [events, lastSeenBaseline]
  );

  // Adopt parent refresh only when it has at least as much data as our local
  // copy, so paginated extras aren't wiped by a periodic refresh.
  useEffect(() => {
    setEvents((prev) => (initialEvents.length >= prev.length ? initialEvents : prev));
  }, [initialEvents]);

  const loadMore = useCallback(async () => {
    if (loadingMore || reachedEnd) return;
    const nextLimit = Math.min(ACTIVITY_MAX_LIMIT, limit + ACTIVITY_PAGE_SIZE);
    if (nextLimit <= events.length && nextLimit < ACTIVITY_MAX_LIMIT) {
      // Already have everything we'd ask for; nothing more to fetch.
      setReachedEnd(true);
      return;
    }
    setLoadingMore(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch(`/activity?limit=${nextLimit}`, { credentials: "include" });
      if (!res.ok) {
        throw new Error(`Activity load failed (${res.status})`);
      }
      const data = (await res.json().catch(() => null)) as { events?: ActivityEvent[] } | null;
      const got = Array.isArray(data?.events) ? data!.events : [];
      setEvents(got);
      setLimit(nextLimit);
      if (got.length < nextLimit || nextLimit >= ACTIVITY_MAX_LIMIT) {
        setReachedEnd(true);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Activity load failed");
    } finally {
      setLoadingMore(false);
    }
  }, [events.length, limit, loadingMore, reachedEnd]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void loadMore();
        }
      },
      { rootMargin: "240px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  // Pre-compute timestamp + searchable haystack per event once. Reused by
  // every filter/sort pass so we don't parse Date or stringify payload N times.
  const indexed = useMemo(
    () =>
      events.map((e) => {
        let payloadStr = "";
        try {
          payloadStr = JSON.stringify(e.payload ?? {});
        } catch {
          // ignore non-serializable payloads
        }
        return {
          e,
          ts: new Date(e.createdAt).getTime(),
          hay: [
            e.actor?.displayName ?? "",
            e.target?.displayName ?? "",
            e.game?.name ?? "",
            e.eventType,
            payloadStr,
          ]
            .join(" ")
            .toLowerCase(),
        };
      }),
    [events]
  );

  const counts = useMemo(() => {
    const c: Record<ActivityCategory, number> = {
      all: events.length,
      friends: 0,
      forums: 0,
      nuggies: 0,
      achievements: 0,
      milestones: 0,
      patches: 0,
    };
    for (const e of events) {
      if (e.category in c) c[e.category]++;
    }
    return c;
  }, [events]);

  const visible = useMemo(() => {
    const cutoff =
      dateRange !== "all" ? Date.now() - ACTIVITY_DATE_WINDOWS[dateRange] : -Infinity;
    const q = search.trim().toLowerCase();
    const filtered = indexed.filter(
      ({ e, ts, hay }) =>
        (tab === "all" || e.category === tab) &&
        (cutoff === -Infinity || (Number.isFinite(ts) && ts >= cutoff)) &&
        (!q || hay.includes(q))
    );
    if (sortBy === "oldest") filtered.sort((a, b) => a.ts - b.ts);
    else if (sortBy === "type") filtered.sort((a, b) => a.e.eventType.localeCompare(b.e.eventType));
    else filtered.sort((a, b) => b.ts - a.ts);
    return filtered.map(({ e }) => e);
  }, [indexed, tab, search, sortBy, dateRange]);

  // Coalesce consecutive runs of the same actor + event type (+ same game) into
  // one row with a ×N chip — five casino wins in a row read as one line, not a wall.
  const grouped = useMemo(() => {
    const items: Array<{ event: ActivityEvent; repeat: number }> = [];
    for (const e of visible) {
      const last = items[items.length - 1];
      if (
        last &&
        last.event.eventType === e.eventType &&
        (last.event.actor?.discordUserId ?? null) === (e.actor?.discordUserId ?? null) &&
        (last.event.game?.name ?? null) === (e.game?.name ?? null)
      ) {
        last.repeat++;
        continue;
      }
      items.push({ event: e, repeat: 1 });
    }
    return items;
  }, [visible]);

  const filtersActive =
    tab !== "all" || dateRange !== "all" || search.trim().length > 0 || sortBy !== "newest";

  return (
    <section id="activity" style={{ display: "grid", gap: 14 }}>
      <SectionHead
        title="Activity feed"
        meta={
          newCount > 0
            ? `${newCount} new since your last visit`
            : "Latest from your crew — RSVPs, game picks, and library syncs."
        }
        action="Open community →"
        onAction={() => onNavigate("community")}
      />
      <IslandCard style={{ padding: 0, overflow: "hidden" }}>
        <div
          role="tablist"
          aria-label="Activity categories"
          style={{
            display: "flex",
            gap: 4,
            padding: 8,
            borderBottom: `1px solid ${islandTheme.color.cardBorder}`,
            flexWrap: "wrap"
          }}
        >
          {ACTIVITY_TABS.map((t) => {
            const active = t.id === tab;
            const count = counts[t.id] ?? 0;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                className="island-btn"
                onClick={() => setTab(t.id)}
                style={{
                  border: "none",
                  background: active ? "var(--bi-primary)33" : "transparent",
                  color: active ? islandTheme.color.textPrimary : islandTheme.color.textSubtle,
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: 999,
                  cursor: "pointer",
                  font: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6
                }}
              >
                <span>{t.label}</span>
                <span
                  aria-hidden="true"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "1px 7px",
                    borderRadius: 999,
                    background: active ? "var(--bi-primary)55" : islandTheme.color.panelMutedBg,
                    color: active ? islandTheme.color.textPrimary : islandTheme.color.textMuted,
                    minWidth: 18,
                    textAlign: "center"
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "10px 12px",
            borderBottom: `1px solid ${islandTheme.color.cardBorder}`,
            flexWrap: "wrap",
            alignItems: "center"
          }}
        >
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search activity…"
            aria-label="Search activity"
            style={{
              ...islandInputStyle,
              flex: "1 1 200px",
              minWidth: 160,
              fontSize: 13,
              padding: "0.4rem 0.6rem",
              font: "inherit"
            }}
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as ActivitySort)}
            aria-label="Sort activity"
            style={{
              ...islandInputStyle,
              fontSize: 13,
              padding: "0.4rem 0.55rem",
              font: "inherit",
              cursor: "pointer"
            }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="type">By type</option>
          </select>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as ActivityDateRange)}
            aria-label="Filter by date range"
            style={{
              ...islandInputStyle,
              fontSize: 13,
              padding: "0.4rem 0.55rem",
              font: "inherit",
              cursor: "pointer"
            }}
          >
            <option value="all">All time</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
          <span
            className="island-mono"
            style={{
              marginLeft: "auto",
              fontSize: 12,
              color: islandTheme.color.textMuted,
              whiteSpace: "nowrap"
            }}
          >
            {visible.length} of {events.length}
            {filtersActive ? " (filtered)" : ""}
          </span>
        </div>

        <div
          style={{
            padding: 6,
            maxHeight: 600,
            overflowY: "auto"
          }}
        >
          {visible.length === 0 ? (
            <div
              style={{
                padding: "28px 14px",
                fontSize: 13,
                color: islandTheme.color.textMuted,
                textAlign: "center",
                lineHeight: 1.55
              }}
            >
              {events.length === 0
                ? "No island activity yet — schedule a game night or sync your library to get the dock buzzing."
                : filtersActive
                  ? "No events match these filters. Try a different category, date range, or search term."
                  : "Nothing in this category right now."}
            </div>
          ) : (
            grouped.map((item, i) => (
              <ActivityRow
                key={item.event.id}
                event={item.event}
                repeat={item.repeat}
                firstRow={i === 0}
                isNew={lastSeenBaseline > 0 && eventTs(item.event.createdAt) > lastSeenBaseline}
              />
            ))
          )}

          <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />

          {loadingMore && (
            <div
              role="status"
              style={{
                padding: "12px 14px",
                fontSize: 12,
                color: islandTheme.color.textMuted,
                textAlign: "center"
              }}
            >
              Loading more activity…
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              style={{
                padding: "10px 14px",
                fontSize: 12,
                color: islandTheme.color.dangerAccent,
                textAlign: "center",
                display: "flex",
                gap: 8,
                justifyContent: "center",
                alignItems: "center",
                flexWrap: "wrap"
              }}
            >
              <span>{errorMsg}</span>
              <button
                type="button"
                className="island-btn"
                onClick={() => void loadMore()}
                style={{
                  border: `1px solid ${islandTheme.color.cardBorder}`,
                  background: "transparent",
                  color: islandTheme.color.textPrimary,
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 999,
                  cursor: "pointer",
                  font: "inherit"
                }}
              >
                Retry
              </button>
            </div>
          )}

          {reachedEnd && !loadingMore && !errorMsg && events.length > 0 && (
            <div
              style={{
                padding: "10px 14px",
                fontSize: 12,
                color: islandTheme.color.textMuted,
                textAlign: "center",
                fontFamily: islandTheme.font.mono
              }}
            >
              End of feed · {events.length} event{events.length === 1 ? "" : "s"} loaded
            </div>
          )}
        </div>

        <button
          type="button"
          className="island-btn"
          onClick={() => onNavigate("community")}
          style={{
            display: "block",
            width: "100%",
            padding: "12px 16px",
            background: "transparent",
            border: "none",
            borderTop: `1px solid ${islandTheme.color.cardBorder}`,
            color: islandTheme.color.primaryGlow,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "center",
            font: "inherit"
          }}
        >
          Open community feed →
        </button>
      </IslandCard>
    </section>
  );
}

// Tiny glyph keyed off the event type family — scannable feed without reading.
function activityIcon(eventType: string): string {
  if (eventType.startsWith("forum")) return "💬";
  if (eventType.startsWith("casino.")) return "🎰";
  if (eventType.startsWith("member.")) return "🌴";
  if (eventType.includes("nuggie") || eventType.includes("daily") || eventType.includes("casino") || eventType.includes("loan")) return "🍗";
  if (eventType.includes("game_night") || eventType.includes("rsvp")) return "🎮";
  if (eventType.includes("achievement") || eventType.includes("milestone") || eventType.includes("rank")) return "🏆";
  if (eventType.includes("steam") || eventType.includes("library") || eventType.includes("sync")) return "🔄";
  if (eventType.includes("patch") || eventType.includes("news")) return "📰";
  return "🌊";
}

function ActivityRow({
  event,
  repeat = 1,
  firstRow,
  isNew = false
}: {
  event: ActivityEvent;
  repeat?: number;
  firstRow: boolean;
  isNew?: boolean;
}) {
  const navigate = useNavigate();
  const rendered = describeEvent(event);
  if (!rendered) return null;
  const actorAvatar = event.actor?.avatarUrl ?? null;
  const actorId = event.actor?.discordUserId ?? null;
  const href = activityHref(event);
  // Subtle tint + left accent for events newer than the last visit.
  const baseBg = isNew ? "var(--bi-primary)14" : "transparent";
  const avatarCircle = (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 999,
        background: actorAvatar
          ? `center / cover no-repeat url(${JSON.stringify(actorAvatar)})`
          : colorForActor(actorId),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        fontWeight: 800,
        color: islandTheme.color.textDark
      }}
    >
      {actorAvatar ? null : initialsFor(event.actor?.displayName ?? null)}
    </div>
  );
  return (
    <div
      onClick={href ? () => navigate(href) : undefined}
      role={href ? "link" : undefined}
      tabIndex={href ? 0 : undefined}
      aria-label={href ? `View details for this activity` : undefined}
      onKeyDown={
        href
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate(href);
              }
            }
          : undefined
      }
      onMouseEnter={href ? (e) => (e.currentTarget.style.background = islandTheme.color.panelMutedBg) : undefined}
      onMouseLeave={href ? (e) => (e.currentTarget.style.background = baseBg) : undefined}
      style={{
        display: "grid",
        gridTemplateColumns: "40px 1fr auto",
        gap: 12,
        padding: "12px 10px",
        borderTop: firstRow ? "none" : `1px solid ${islandTheme.color.cardBorder}`,
        alignItems: "start",
        cursor: href ? "pointer" : "default",
        background: baseBg,
        boxShadow: isNew ? `inset 3px 0 0 ${islandTheme.color.primaryGlow}` : "none",
        borderRadius: 10,
        transition: "background 140ms ease"
      }}
    >
      <div style={{ position: "relative", width: 40, height: 40 }}>
        {actorId ? (
          <Link
            to={pathForIslander(actorId)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`${event.actor?.displayName ?? "Crew member"} profile`}
            style={{ display: "block", borderRadius: 999, textDecoration: "none" }}
          >
            {avatarCircle}
          </Link>
        ) : (
          avatarCircle
        )}
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: -4,
            bottom: -4,
            fontSize: 13,
            lineHeight: 1,
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))"
          }}
        >
          {activityIcon(event.eventType)}
        </span>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, lineHeight: 1.45, color: islandTheme.color.textSubtle }}>
          {rendered.body}
          {repeat > 1 ? (
            <span
              className="island-mono"
              title={`${repeat} similar events in a row`}
              style={{
                marginLeft: 8,
                fontSize: 12,
                fontWeight: 800,
                padding: "1px 8px",
                borderRadius: 999,
                background: islandTheme.color.panelMutedBg,
                border: `1px solid ${islandTheme.color.cardBorder}`,
                color: islandTheme.color.textMuted,
                whiteSpace: "nowrap"
              }}
            >
              ×{repeat}
            </span>
          ) : null}
          {isNew ? (
            <span
              title="New since your last visit"
              style={{
                marginLeft: 8,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.06em",
                padding: "1px 7px",
                borderRadius: 999,
                background: islandTheme.color.primaryGlow,
                color: islandTheme.color.textDark,
                whiteSpace: "nowrap",
                verticalAlign: "middle"
              }}
            >
              NEW
            </span>
          ) : null}
        </div>
        {event.game?.headerImageUrl ? (
          <Link
            to={pathForGame(event.game.appId)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Open ${event.game.name}`}
            style={{
              marginTop: 8,
              display: "grid",
              gridTemplateColumns: "44px 1fr",
              gap: 10,
              alignItems: "center",
              padding: "8px 10px",
              borderRadius: 10,
              background: islandTheme.color.panelMutedBg,
              border: `1px solid ${islandTheme.color.cardBorder}`,
              color: "inherit",
              textDecoration: "none",
              transition: "border-color 140ms ease"
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = islandTheme.color.primaryGlow)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = islandTheme.color.cardBorder)}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                background: `center / cover no-repeat url(${JSON.stringify(event.game.headerImageUrl)})`
              }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{event.game.name}</div>
              <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>
                Featured game
              </div>
            </div>
          </Link>
        ) : null}
        <div
          className="island-mono"
          style={{
            marginTop: 6,
            fontSize: 12,
            color: islandTheme.color.textMuted,
            display: "flex",
            alignItems: "center",
            gap: 6
          }}
        >
          <span>{rendered.icon}</span>
          {rendered.metaText}
        </div>
      </div>
      <span
        aria-hidden="true"
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          border: `1px solid ${islandTheme.color.cardBorder}`,
          color: islandTheme.color.textMuted,
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        ···
      </span>
    </div>
  );
}

function DriftLog({ cards, onNavigate }: { cards: NewsCardData[]; onNavigate: (page: PageId) => void }) {
  return (
    <section style={{ display: "grid", gap: 14 }}>
      <SectionHead
        title="Washed up on shore"
        meta="Drift log: news, patch notes, and crew gossip curated by the parents."
        action="Full feed →"
        onAction={() => onNavigate("games-news")}
      />
      {cards.length === 0 ? (
        <IslandCard style={{ padding: "16px 18px" }}>
          <div style={{ fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.55 }}>
            The drift log is quiet right now. Parents can post news cards from the Admin → Drift Log page.
          </div>
        </IslandCard>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12
          }}
        >
          {cards.map((card) => (
            <NewsCardTile key={card.id} card={card} />
          ))}
        </div>
      )}
    </section>
  );
}

function NewsCardTile({ card }: { card: NewsCardData }) {
  const ago = relativeAgo(card.publishedAt);
  const tag = card.tag ? card.tag : "drift log";
  const meta = `${tag} · ${ago}`;
  const content = (
    <article
      style={{
        display: "grid",
        gridTemplateColumns: "44px 1fr",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 14,
        background: islandTheme.color.panelBg,
        backdropFilter: islandTheme.glass.blur,
        WebkitBackdropFilter: islandTheme.glass.blur,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        cursor: card.sourceUrl ? "pointer" : "default",
        transition: "border-color 140ms ease, transform 140ms ease"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = islandTheme.color.primaryGlow;
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = islandTheme.color.cardBorder;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: islandTheme.color.panelMutedBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22
        }}
      >
        {card.icon}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{card.title}</div>
        <div style={{ marginTop: 4, fontSize: 12, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
          {card.body}
        </div>
        <div className="island-mono" style={{ marginTop: 6, fontSize: 12, color: islandTheme.color.textMuted }}>
          {meta}
        </div>
      </div>
    </article>
  );
  if (card.sourceUrl) {
    return (
      <a
        href={card.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: "none", color: "inherit" }}
      >
        {content}
      </a>
    );
  }
  return content;
}

function BotAndRitualRow({ guildId, onNavigate }: { guildId: string | null; onNavigate: (page: PageId) => void }) {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 14
      }}
    >
      <CtaCard
        accent={islandTheme.color.primaryGlow}
        eyebrow="Try the bot"
        title="/whatcanweplay"
        body="Drop the slash command in any island channel. The bot pings the API, scans the crew's libraries, and surfaces overlap and near-matches in three seconds."
        ctaLabel="Open in Discord ↗"
        primary
        onCta={() => {
          if (guildId) {
            window.open(`https://discord.com/channels/${guildId}`, "_blank", "noopener");
            return;
          }
          // No guild id available, so fall back to the in-app
          // "what can we play" surface on the Games page.
          onNavigate("games");
        }}
      />
      <CtaCard
        accent={islandTheme.palette.sandWarmAccent}
        eyebrow="Sunday ritual"
        title="Tide check"
        body="Your weekly island recap — who showed up, what got played, what is queued. The tide rolls in every Sunday with the week's attendance, playtime, and wishlist drift."
        ctaLabel="Read this week's tide →"
        primary={false}
        onCta={() => onNavigate("tide-check")}
      />
    </section>
  );
}

type CtaCardProps = {
  accent: string;
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  primary: boolean;
  onCta?: () => void;
};

function CtaCard({ accent, eyebrow, title, body, ctaLabel, primary, onCta }: CtaCardProps) {
  return (
    <article
      style={{
        background: `linear-gradient(135deg, ${hexToRgba(accent, primary ? 0.32 : 0.22)} 0%, ${islandTheme.color.panelBg} 100%)`,
        backdropFilter: islandTheme.glass.blur,
        WebkitBackdropFilter: islandTheme.glass.blur,
        border: `1px solid ${hexToRgba(accent, 0.4)}`,
        borderRadius: 16,
        padding: 28
      }}
    >
      <div
        className="island-mono"
        style={{
          fontSize: 12,
          color: accent,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: 10
        }}
      >
        {eyebrow}
      </div>
      <div
        className="island-display"
        style={{ fontSize: 24, marginBottom: 8, fontWeight: 800, letterSpacing: "-0.01em" }}
      >
        {title}
      </div>
      <p
        style={{
          margin: "0 0 14px",
          color: islandTheme.color.textSubtle,
          fontSize: 14,
          lineHeight: 1.5
        }}
      >
        {body}
      </p>
      <button
        type="button"
        className="island-btn"
        onClick={onCta}
        style={{
          background: primary ? islandTheme.color.primary : "transparent",
          border: `1px solid ${primary ? islandTheme.color.primary : islandTheme.color.cardBorder}`,
          color: primary ? islandTheme.color.primaryText : islandTheme.color.textPrimary,
          padding: "8px 14px",
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          font: "inherit"
        }}
      >
        {ctaLabel}
      </button>
    </article>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  if (hex.startsWith("#") && hex.length === 7) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

function SectionHead({
  title,
  meta,
  action,
  onAction
}: {
  title: string;
  meta: string;
  action: string;
  onAction?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: 12,
        flexWrap: "wrap"
      }}
    >
      <div>
        <h2 className="island-display" style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>
          {title}
        </h2>
        <div
          className="island-mono"
          style={{ marginTop: 4, fontSize: 12, color: islandTheme.color.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}
        >
          {meta}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onAction?.()}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          color: islandTheme.color.primaryGlow,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          font: "inherit"
        }}
      >
        {action}
      </button>
    </div>
  );
}
