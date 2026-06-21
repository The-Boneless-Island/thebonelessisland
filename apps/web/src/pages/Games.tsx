import React, { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IslandCard, IslandTag, islandInputStyle, islandTagStyle } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import { GameCover, LogoCover, coverUrl, steamArt } from "../steamArt.js";
import { PosterCard, PosterWall, categoryFor } from "../components/PosterCard.js";
import { modePills } from "../gameModes.js";
import { gameAccent, countdownLabel, seatPips, type CountdownTone } from "../gameAccent.js";
import { ConfettiBurst } from "../system/celebration.js";
import type {
  CrewOwnedGame,
  CrewWishlistGame,
  FeaturedRecommendation,
  GameNewsItem,
  GameNewsScope,
  GameNight,
  GameNightAttendee,
  GuildMember,
  PageId,
  Recommendation
} from "../types.js";

type GamesPageProps = {
  gameNights: GameNight[];
  selectedNight: GameNight | null;
  selectedNightId: number | null;
  nightAttendees: GameNightAttendee[];
  filteredGuildMembers: GuildMember[];
  selectedMemberIds: string[];
  newNightTitle: string;
  newNightScheduledFor: string;
  currentUserAttendingSelectedNight: boolean;
  composerRecommendations: Recommendation[];
  featuredRecommendation: FeaturedRecommendation | null;
  crewGames: CrewOwnedGame[];
  crewWishlist: CrewWishlistGame[];
  gameNews: GameNewsItem[];
  composerScrollNonce: number;
  draftAppId: number | null;
  lockNonce: number;
  currentDiscordUserId: string | null;
  isAdmin: boolean;
  onSelectNight: (id: number, title: string) => void;
  onNewNightTitleChange: (value: string) => void;
  onNewNightScheduledForChange: (value: string) => void;
  onToggleSelectedMember: (discordUserId: string) => void;
  onCreateGameNight: (joinAsHost: boolean) => void;
  onSetNightGame: (nightId: number, appId: number | null) => void;
  onDraftAppIdChange: (appId: number | null) => void;
  onJoinSelectedNight: () => void;
  onLeaveSelectedNight: () => void;
  onAddSelectedMembersToNight: () => void;
  onRemoveSelectedMembersFromNight: () => void;
  onNavigate: (page: PageId) => void;
  onSendChatMessage: (message: string, history: ChatMessage[]) => Promise<{ reply: string; error?: string }>;
};

type ChatMessage = { role: "user" | "assistant"; content: string };

type ComposerPick = {
  source: "selection" | "featured";
  appId: number;
  name: string;
  matchPct: number;
  reason: string;
  blurb?: string;
  ownersInScope: number;
  scopeSize: number;
  headerImageUrl: string | null;
  tags: string[];
  maxPlayers: number | null;
};

// Two views: "tonight" is the focused default — pick people, pick a vibe,
// lock a night. "everything" unfolds the full deck (patches, chat, wishlist,
// library, streams) for browsing sessions. Choice sticks per browser.
type GamesView = "tonight" | "everything";

function GamesPageImpl(props: GamesPageProps) {
  const [view, setViewState] = useState<GamesView>(() =>
    localStorage.getItem("bi:games-view") === "everything" ? "everything" : "tonight"
  );
  const setView = (v: GamesView) => {
    setViewState(v);
    localStorage.setItem("bi:games-view", v);
  };

  return (
    <div style={{ display: "grid", gap: 24, position: "relative" }}>
      <GamesHero view={view} onViewChange={setView} />
      {view === "tonight" ? (
        <>
          <PlanNightCard {...props} />
          <ScheduledNights {...props} />
          <CrewChat onSend={props.onSendChatMessage} />
          <EverythingTeaser onOpen={() => setView("everything")} />
        </>
      ) : (
        <>
          <SessionAndPatchesRow {...props} />
          <ScheduledNights {...props} />
          <GroupWishlist crewWishlist={props.crewWishlist} />
          <LibrarySnapshot onNavigate={props.onNavigate} />
          <CrewChat onSend={props.onSendChatMessage} />
          <StreamDrawer members={props.filteredGuildMembers} />
        </>
      )}
    </div>
  );
}

export const GamesPage = React.memo(GamesPageImpl);

function GamesHero({ view, onViewChange }: { view: GamesView; onViewChange: (v: GamesView) => void }) {
  const tabs: Array<{ id: GamesView; label: string }> = [
    { id: "tonight", label: "🌙 Tonight" },
    { id: "everything", label: "🧰 Everything" }
  ];
  return (
    <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          className="island-mono"
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: islandTheme.color.textMuted
          }}
        >
          Plan a session · pick a game · invite the crew
        </span>
        <h1 className="island-display" style={{ margin: 0, fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 700 }}>
          Games
        </h1>
      </div>
      <div
        role="tablist"
        aria-label="Games view"
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          borderRadius: 999,
          background: islandTheme.color.panelMutedBg,
          border: `1px solid ${islandTheme.color.cardBorder}`
        }}
      >
        {tabs.map((t) => {
          const active = view === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onViewChange(t.id)}
              className="island-btn"
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                border: "none",
                background: active ? islandTheme.color.primary : "transparent",
                color: active ? islandTheme.color.primaryText : islandTheme.color.textSubtle,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                font: "inherit"
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}

function EverythingTeaser({ onOpen }: { onOpen: () => void }) {
  return (
    <IslandCard
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        padding: 14,
        background: `linear-gradient(135deg, rgba(56,189,248,0.08) 0%, ${islandTheme.color.panelBg} 70%)`
      }}
    >
      <span style={{ fontSize: 13, color: islandTheme.color.textSubtle }}>
        Patch notes, crew chat, group wishlist, library snapshot, live streams — all in the full deck.
      </span>
      <button
        type="button"
        className="island-btn"
        onClick={onOpen}
        style={{
          background: "transparent",
          border: `1px solid ${islandTheme.color.cardBorder}`,
          color: islandTheme.color.primaryGlow,
          padding: "6px 14px",
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          font: "inherit",
          flexShrink: 0
        }}
      >
        🧰 Open everything →
      </button>
    </IslandCard>
  );
}

function SessionAndPatchesRow(props: GamesPageProps) {
  return (
    <section
      className="bi-games-split"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
        gap: 16,
        alignItems: "start"
      }}
    >
      <PlanNightCard {...props} />
      <PatchesRolodex gameNews={props.gameNews} />
    </section>
  );
}

function buildComposerPick(props: GamesPageProps): ComposerPick | null {
  const { composerRecommendations, featuredRecommendation, crewGames, selectedMemberIds } = props;

  if (selectedMemberIds.length > 0 && composerRecommendations.length > 0) {
    const top = composerRecommendations[0];
    const meta = crewGames.find((game) => game.appId === top.appId) ?? null;
    return {
      source: "selection",
      appId: top.appId,
      name: top.name,
      matchPct: Math.max(0, Math.min(100, Math.round(top.score))),
      reason: top.reason,
      blurb: top.blurb,
      ownersInScope: top.owners,
      scopeSize: selectedMemberIds.length,
      headerImageUrl: meta?.headerImageUrl ?? null,
      tags: meta?.tags ?? [],
      maxPlayers: meta?.maxPlayers ?? null
    };
  }

  if (featuredRecommendation) {
    return {
      source: "featured",
      appId: featuredRecommendation.appId,
      name: featuredRecommendation.name,
      matchPct: Math.max(0, Math.min(100, Math.round(featuredRecommendation.score))),
      reason: featuredRecommendation.reason,
      ownersInScope: featuredRecommendation.owners,
      scopeSize: featuredRecommendation.scopeMemberCount,
      headerImageUrl: featuredRecommendation.headerImageUrl,
      tags: featuredRecommendation.tags,
      maxPlayers: featuredRecommendation.maxPlayers
    };
  }

  return null;
}

function pickCoverInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

// ── Plan a night ──────────────────────────────────────────────────────────────
// One no-scroll card: pick a game (AI / search / later), pick a time, pick the
// crew, lock it. Replaces the old split SessionComposer + CreateNightStrip.

type GameSource = "ai" | "search" | "later";

type PickView = {
  appId: number | null;
  name: string;
  matchPct: number | null;
  tags: string[];
  maxPlayers: number | null;
  ownersInScope: number | null;
  scopeSize: number | null;
  headerImageUrl: string | null;
  source: GameSource;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function tonightAt(hour: number): Date {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
}

function nextWeekdayAt(weekday: number, hour: number): Date {
  const now = new Date();
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  let diff = (weekday - d.getDay() + 7) % 7;
  if (diff === 0 && d.getTime() <= now.getTime()) diff = 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function whenLabel(value: string): string {
  if (!value) return "no time set";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "no time set";
  return d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    border: active ? "none" : `1px solid ${islandTheme.color.cardBorder}`,
    background: active ? islandTheme.color.primary : "transparent",
    color: active ? islandTheme.color.primaryText : islandTheme.color.textSubtle,
    fontSize: 13,
    fontWeight: active ? 700 : 600,
    padding: "7px 14px",
    borderRadius: 999,
    cursor: "pointer",
    font: "inherit"
  };
}

function todayDateStr(): string {
  return toLocalInput(new Date()).slice(0, 10);
}

// Build the "YYYY-MM-DDTHH:mm" local string the create flow expects from the
// split date + time controls. Empty date → empty (Lock stays disabled).
function combineDateTime(date: string, time: string): string {
  if (!date) return "";
  return `${date}T${time || "20:00"}`;
}

// 30-minute slots across the day for the scrollable time <select>.
const TIME_SLOTS: Array<{ value: string; label: string }> = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 1 ? 30 : 0;
  const ampm = h < 12 ? "AM" : "PM";
  const hr12 = h % 12 === 0 ? 12 : h % 12;
  return { value: `${pad2(h)}:${pad2(m)}`, label: `${hr12}:${pad2(m)} ${ampm}` };
});

function PlanNightCard(props: GamesPageProps) {
  const {
    crewGames,
    selectedMemberIds,
    draftAppId,
    onDraftAppIdChange,
    newNightTitle,
    newNightScheduledFor,
    onNewNightTitleChange,
    onNewNightScheduledForChange,
    onCreateGameNight,
    composerScrollNonce,
    lockNonce,
    currentDiscordUserId,
    isAdmin
  } = props;

  const [source, setSource] = useState<GameSource>("ai");
  const [librarySearch, setLibrarySearch] = useState("");
  const [showCustomTime, setShowCustomTime] = useState(false);
  const [joinAsHost, setJoinAsHost] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);

  const aiPick = useMemo(() => buildComposerPick(props), [props]);

  // Keep the parent draft app id in lockstep with the chosen source. AI mode
  // tracks the live recommendation; "later" clears it; search sets it on click.
  useEffect(() => {
    if (source === "ai") onDraftAppIdChange(aiPick?.appId ?? null);
    else if (source === "later") onDraftAppIdChange(null);
  }, [source, aiPick?.appId, onDraftAppIdChange]);

  useEffect(() => {
    if (composerScrollNonce === 0) return;
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [composerScrollNonce]);

  const pick: PickView | null = useMemo(() => {
    if (source === "later") return null;
    if (source === "search") {
      const g = crewGames.find((c) => c.appId === draftAppId);
      if (!g) return null;
      const ownersInScope = selectedMemberIds.length
        ? g.owners.filter((o) => selectedMemberIds.includes(o.discordUserId)).length
        : g.ownerCount;
      return {
        appId: g.appId,
        name: g.name,
        matchPct: null,
        tags: g.tags,
        maxPlayers: g.maxPlayers ?? g.mpMaxPlayersApprox ?? null,
        ownersInScope,
        scopeSize: selectedMemberIds.length || g.ownerCount,
        headerImageUrl: g.headerImageUrl,
        source: "search"
      };
    }
    if (!aiPick) return null;
    return {
      appId: aiPick.appId,
      name: aiPick.name,
      matchPct: aiPick.matchPct,
      tags: aiPick.tags,
      maxPlayers: aiPick.maxPlayers,
      ownersInScope: aiPick.ownersInScope,
      scopeSize: aiPick.scopeSize,
      headerImageUrl: aiPick.headerImageUrl,
      source: "ai"
    };
  }, [source, aiPick, crewGames, draftAppId, selectedMemberIds]);

  const accent = gameAccent(pick?.tags);
  // You always host, so you're never in the invitable roster — you auto-join
  // unless you're an admin who toggled off "I'm playing too".
  const rosterMembers = useMemo(
    () => props.filteredGuildMembers.filter((m) => m.discordUserId !== currentDiscordUserId),
    [props.filteredGuildMembers, currentDiscordUserId]
  );
  const goingCount = selectedMemberIds.length + (joinAsHost ? 1 : 0);
  const goingLabel =
    goingCount === 0
      ? "no one yet"
      : joinAsHost && selectedMemberIds.length === 0
        ? "just you so far"
        : `${goingCount} going`;
  const canLock = Boolean(newNightScheduledFor);

  return (
    <div ref={cardRef} style={{ scrollMarginTop: 90 }}>
      <style>{`
        .bi-plan-hero { box-shadow: 0 6px 18px rgba(0,0,0,0.35); transition: transform 220ms ease, box-shadow 220ms ease; }
        @media (hover: hover) { .bi-plan-hero:hover { transform: translateY(-5px); box-shadow: 0 18px 38px rgba(0,0,0,0.5); } }
        @media (prefers-reduced-motion: reduce) { .bi-plan-hero { transition: none; } .bi-plan-hero:hover { transform: none; } }
      `}</style>
      <IslandCard style={{ padding: 0, overflow: "hidden", position: "relative" }}>
        <ConfettiBurst trigger={lockNonce} />

        <div
          style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${islandTheme.color.cardBorder}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap"
          }}
        >
          <span style={{ fontSize: 16 }} aria-hidden="true">🗓️</span>
          <h2 className="island-display" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
            Plan a night
          </h2>
          <SourceSegmented value={source} onChange={setSource} />
        </div>

        <div style={{ display: "grid", gap: 12, padding: 16 }}>
          <PlanHero pick={pick} accent={accent} />
          <StatChips pick={pick} />

          {source === "search" ? (
            <LibraryResults
              crewGames={crewGames}
              query={librarySearch}
              onQueryChange={setLibrarySearch}
              selectedAppId={draftAppId}
              onPick={(appId) => onDraftAppIdChange(appId)}
            />
          ) : null}

          <FieldRow label="When">
            <TimeChips
              value={newNightScheduledFor}
              showCustom={showCustomTime}
              onPick={(iso) => {
                setShowCustomTime(false);
                onNewNightScheduledForChange(iso);
              }}
              onCustom={() => {
                setShowCustomTime(true);
                if (!newNightScheduledFor) onNewNightScheduledForChange(toLocalInput(tonightAt(20)));
              }}
              onCustomChange={onNewNightScheduledForChange}
            />
          </FieldRow>

          <FieldRow label="Title">
            <input
              value={newNightTitle}
              onChange={(e) => onNewNightTitleChange(e.target.value)}
              placeholder="Friday Island Session"
              style={{ ...islandInputStyle, width: "100%", fontSize: 13, borderRadius: islandTheme.radius.control }}
            />
          </FieldRow>

          <FieldRow label="Who">
            <div style={{ display: "grid", gap: 8 }}>
              {isAdmin ? (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: islandTheme.color.textSubtle,
                    cursor: "pointer"
                  }}
                >
                  <input type="checkbox" checked={joinAsHost} onChange={(e) => setJoinAsHost(e.target.checked)} />
                  I'm playing too
                  {!joinAsHost ? (
                    <span style={{ color: islandTheme.color.textMuted }}>· hosting only, not a player</span>
                  ) : null}
                </label>
              ) : null}
              <RosterPanel
                members={rosterMembers}
                selectedMemberIds={selectedMemberIds}
                onToggle={props.onToggleSelectedMember}
              />
            </div>
          </FieldRow>
        </div>

        <div
          style={{
            padding: "12px 16px",
            borderTop: `1px solid ${islandTheme.color.cardBorder}`,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap"
          }}
        >
          <span style={{ fontSize: 13, color: islandTheme.color.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
            <span aria-hidden="true" style={{ color: pick ? islandTheme.color.successAccent : islandTheme.color.textMuted }}>●</span>
            <span>
              <strong style={{ color: islandTheme.color.textPrimary }}>{pick?.name ?? "No game yet"}</strong>
              {" · "}
              {whenLabel(newNightScheduledFor)}
              {" · "}
              <strong style={{ color: islandTheme.color.textPrimary }}>{goingLabel}</strong>
            </span>
          </span>
          <button
            type="button"
            onClick={() => onCreateGameNight(joinAsHost)}
            disabled={!canLock}
            style={{
              marginLeft: "auto",
              background: canLock ? islandTheme.color.primary : islandTheme.color.panelMutedBg,
              border: "none",
              color: canLock ? islandTheme.color.primaryText : islandTheme.color.textMuted,
              padding: "9px 20px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 700,
              cursor: canLock ? "pointer" : "default",
              font: "inherit"
            }}
          >
            ⚓ Lock the night
          </button>
        </div>
      </IslandCard>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "52px 1fr", gap: 12, alignItems: "start" }}>
      <span
        className="island-mono"
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: islandTheme.color.textMuted,
          paddingTop: 7
        }}
      >
        {label}
      </span>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

const SOURCE_TABS: Array<{ id: GameSource; label: string }> = [
  { id: "ai", label: "✨ AI pick" },
  { id: "search", label: "🔍 Search" },
  { id: "later", label: "🕒 Later" }
];

function SourceSegmented({ value, onChange }: { value: GameSource; onChange: (v: GameSource) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Game source"
      style={{
        marginLeft: "auto",
        display: "inline-flex",
        gap: 2,
        padding: 3,
        borderRadius: 999,
        background: islandTheme.color.panelMutedBg,
        border: `1px solid ${islandTheme.color.cardBorder}`
      }}
    >
      {SOURCE_TABS.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className="island-btn"
            style={{
              padding: "5px 12px",
              borderRadius: 999,
              border: "none",
              background: active ? islandTheme.color.primary : "transparent",
              color: active ? islandTheme.color.primaryText : islandTheme.color.textSubtle,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              font: "inherit"
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function MatchRing({ pct, accent }: { pct: number; accent: string }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c * (1 - clamped / 100);
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" role="img" aria-label={`${clamped}% match`}>
      <circle cx="26" cy="26" r={r} fill="rgba(2,6,23,0.55)" stroke="rgba(148,163,184,0.25)" strokeWidth="5" />
      <circle
        cx="26"
        cy="26"
        r={r}
        fill="none"
        stroke={accent}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 26 26)"
      />
      <text x="26" y="28" textAnchor="middle" fontSize="13" fontWeight="700" fill="#f8fafc">
        {clamped}
      </text>
      <text x="26" y="37" textAnchor="middle" fontSize="7" fill="rgba(226,232,240,0.7)">
        MATCH
      </text>
    </svg>
  );
}

function PlanHero({ pick, accent }: { pick: PickView | null; accent: ReturnType<typeof gameAccent> }) {
  const [logoBroken, setLogoBroken] = useState(false);
  useEffect(() => setLogoBroken(false), [pick?.appId]);

  const heroUrl = coverUrl(pick?.appId, pick?.headerImageUrl);

  if (!pick) {
    return (
      <div
        style={{
          minHeight: 96,
          borderRadius: 12,
          border: `1px dashed ${islandTheme.color.cardBorder}`,
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          textAlign: "center",
          padding: 16
        }}
      >
        <span style={{ fontSize: 26 }} aria-hidden="true">🎲</span>
        <div style={{ fontSize: 13, fontWeight: 700, color: islandTheme.color.textSecondary }}>No game locked yet</div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, maxWidth: 380, lineHeight: 1.5 }}>
          Tap <strong>AI pick</strong> for the strongest crew match, <strong>Search</strong> the crew library, or leave it for
          the host to call at game-time.
        </div>
      </div>
    );
  }

  const showLogo = Boolean(pick.appId) && !logoBroken;

  return (
    <div
      className="bi-plan-hero"
      style={{
        position: "relative",
        minHeight: 176,
        borderRadius: 12,
        overflow: "hidden",
        border: `1px solid ${accent.accent}`,
        display: "flex",
        alignItems: "flex-end"
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: heroUrl ? `url("${heroUrl}") center / cover no-repeat` : "linear-gradient(135deg,#0f172a 0%,#1e293b 100%)"
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(135deg, rgba(8,16,34,0.86) 22%, rgba(8,16,34,0.4) 70%, rgba(8,16,34,0.15) 100%)"
        }}
      />
      <div
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, background: accent.accent, opacity: 0.16, mixBlendMode: "overlay" }}
      />

      {pick.source === "ai" ? (
        <span
          style={{
            position: "absolute",
            top: 10,
            left: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            background: "rgba(8,16,34,0.7)",
            padding: "3px 9px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            color: accent.soft
          }}
        >
          <span aria-hidden="true">🍗</span> Nuggie suggests
        </span>
      ) : null}

      {pick.matchPct != null ? (
        <div style={{ position: "absolute", top: 8, right: 10 }}>
          <MatchRing pct={pick.matchPct} accent={accent.accent} />
        </div>
      ) : null}

      <div style={{ position: "relative", padding: "12px 16px", minWidth: 0, zIndex: 1 }}>
        {showLogo ? (
          <img
            src={steamArt.logo(pick.appId as number)}
            alt={pick.name}
            onError={() => setLogoBroken(true)}
            style={{ maxWidth: "80%", maxHeight: 96, objectFit: "contain", filter: "drop-shadow(0 3px 9px rgba(0,0,0,0.7))" }}
          />
        ) : (
          <>
            {!heroUrl ? (
              <div
                className="island-mono"
                style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", marginBottom: 2 }}
              >
                {pickCoverInitials(pick.name)}
              </div>
            ) : null}
            <h3
              className="island-display"
              style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#f8fafc", textShadow: "0 2px 10px rgba(0,0,0,0.55)" }}
            >
              {pick.name}
            </h3>
          </>
        )}
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: accent.soft,
              background: "rgba(8,16,34,0.55)",
              padding: "2px 8px",
              borderRadius: 999
            }}
          >
            {accent.label}
          </span>
          {pick.ownersInScope != null && pick.scopeSize != null ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#bbf7d0",
                background: "rgba(20,54,31,0.7)",
                padding: "2px 8px",
                borderRadius: 999
              }}
            >
              {pick.ownersInScope}/{pick.scopeSize} own it
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StatChips({ pick }: { pick: PickView | null }) {
  if (!pick) return null;
  const chips: Array<{ icon: string; text: string }> = [];
  if (typeof pick.maxPlayers === "number" && pick.maxPlayers > 0) {
    chips.push({ icon: "👥", text: `up to ${pick.maxPlayers}` });
  }
  for (const tag of pick.tags.slice(0, 3)) {
    chips.push({ icon: "🏷️", text: tag.toLowerCase() });
  }
  if (chips.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {chips.map((c, i) => (
        <span
          key={`${c.text}-${i}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            color: islandTheme.color.textSubtle,
            background: islandTheme.color.panelMutedBg,
            border: `1px solid ${islandTheme.color.cardBorder}`,
            padding: "4px 10px",
            borderRadius: 999
          }}
        >
          <span aria-hidden="true">{c.icon}</span>
          {c.text}
        </span>
      ))}
    </div>
  );
}

function TimeChips({
  value,
  showCustom,
  onPick,
  onCustom,
  onCustomChange
}: {
  value: string;
  showCustom: boolean;
  onPick: (iso: string) => void;
  onCustom: () => void;
  onCustomChange: (v: string) => void;
}) {
  const options = useMemo(
    () => [
      { id: "tonight", label: "Tonight", value: toLocalInput(tonightAt(20)) },
      { id: "fri", label: "Fri 8pm", value: toLocalInput(nextWeekdayAt(5, 20)) },
      { id: "sat", label: "Sat night", value: toLocalInput(nextWeekdayAt(6, 20)) }
    ],
    []
  );
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onPick(o.value)} style={chipStyle(value === o.value && !showCustom)}>
          {o.label}
        </button>
      ))}
      <button type="button" onClick={onCustom} style={chipStyle(showCustom)}>
        📅 Custom…
      </button>
      {showCustom ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="date"
            aria-label="Date"
            value={value.slice(0, 10)}
            min={todayDateStr()}
            onChange={(e) => onCustomChange(combineDateTime(e.target.value, value.slice(11, 16) || "20:00"))}
            style={{ ...islandInputStyle, fontSize: 13, borderRadius: islandTheme.radius.control }}
          />
          <select
            aria-label="Time"
            value={value.slice(11, 16) || "20:00"}
            onChange={(e) => onCustomChange(combineDateTime(value.slice(0, 10) || todayDateStr(), e.target.value))}
            style={{ ...islandInputStyle, fontSize: 13, borderRadius: islandTheme.radius.control, cursor: "pointer" }}
          >
            {TIME_SLOTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

function RosterPanel({
  members,
  selectedMemberIds,
  onToggle
}: {
  members: GuildMember[];
  selectedMemberIds: string[];
  onToggle: (discordUserId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? members.filter((m) => m.displayName.toLowerCase().includes(q)) : members;
    return list.slice(0, 60);
  }, [members, query]);
  const ready = selectedMemberIds.length;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search crew…"
          style={{ ...islandInputStyle, flex: 1, fontSize: 13, borderRadius: islandTheme.radius.control }}
        />
        <span style={{ fontSize: 12, fontWeight: 700, color: islandTheme.color.primaryGlow, whiteSpace: "nowrap" }}>
          {ready} ready
        </span>
      </div>
      {filtered.length ? (
        <div style={{ display: "grid", gap: 4, maxHeight: 220, overflowY: "auto" }}>
          {filtered.map((m) => {
            const selected = selectedMemberIds.includes(m.discordUserId);
            const status = m.inVoice ? "voice" : m.richPresenceText ? "online" : "idle";
            const dotColor =
              status === "voice"
                ? islandTheme.color.successAccent
                : status === "online"
                  ? islandTheme.color.primaryGlow
                  : islandTheme.color.textMuted;
            return (
              <button
                key={m.discordUserId}
                type="button"
                className="island-btn"
                aria-pressed={selected}
                onClick={() => onToggle(m.discordUserId)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "16px 1fr auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: selected ? `1px solid ${islandTheme.color.primaryGlow}` : "1px solid transparent",
                  background: selected ? "rgba(96, 165, 250, 0.12)" : "transparent",
                  color: islandTheme.color.textPrimary,
                  cursor: "pointer",
                  font: "inherit"
                }}
              >
                <input type="checkbox" checked={selected} readOnly style={{ pointerEvents: "none" }} />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    textAlign: "left",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }}
                >
                  {m.displayName}
                </span>
                <span
                  className="island-mono"
                  style={{
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: dotColor,
                    display: "flex",
                    alignItems: "center",
                    gap: 4
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: dotColor }} />
                  {status}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>No crew loaded yet.</p>
      )}
    </div>
  );
}

const VISUALLY_HIDDEN: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0
};

const LIBRARY_IDLE_CAP = 8;

// Command-palette-style crew-library picker. The idle box reframes the first few
// rows as "Popular with the crew" (owner-count sorted) with a visible total +
// "Show all N" affordance, so users never read the sample as the whole catalog.
// (No ⌘K binding here — QuickSwitcher owns that shortcut globally.)
function LibraryResults({
  crewGames,
  query,
  onQueryChange,
  selectedAppId,
  onPick
}: {
  crewGames: CrewOwnedGame[];
  query: string;
  onQueryChange: (v: string) => void;
  selectedAppId: number | null;
  onPick: (appId: number) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [genre, setGenre] = useState<string | null>(null);
  const total = crewGames.length;

  // Genre facets from tags → top buckets by count (skip the neutral default).
  const genres = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of crewGames) {
      const label = gameAccent(g.tags).label;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .filter(([label]) => label !== "game")
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [crewGames]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    let list = crewGames;
    if (genre) list = list.filter((g) => gameAccent(g.tags).label === genre);
    if (q) list = list.filter((g) => g.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => b.ownerCount - a.ownerCount || a.name.localeCompare(b.name));
  }, [crewGames, genre, q]);

  const isIdle = !q && !genre;
  const visible = showAll ? filtered : filtered.slice(0, LIBRARY_IDLE_CAP);
  const hiddenCount = filtered.length - visible.length;
  const sectionLabel = isIdle ? "⭐ Popular with the crew" : genre && !q ? `${genre} games` : "Results";
  const statusText =
    q || genre
      ? `${filtered.length} ${filtered.length === 1 ? "game" : "games"} match`
      : `${total} games in the crew library · showing ${visible.length}`;

  return (
    <div
      style={{
        display: "grid",
        gap: 8,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        borderRadius: 10,
        padding: 10,
        background: islandTheme.color.panelMutedBg
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 10px",
          border: `1px solid ${islandTheme.color.cardBorder}`,
          borderRadius: islandTheme.radius.control,
          background: islandTheme.color.panelBg
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 13, opacity: 0.7 }}>🔍</span>
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={`Search ${total} crew games…`}
          aria-label="Search the crew library"
          role="searchbox"
          style={{ ...islandInputStyle, flex: 1, fontSize: 13, border: "none", background: "transparent", padding: "8px 0" }}
        />
        {query ? (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label="Clear search"
            style={{ background: "transparent", border: "none", color: islandTheme.color.textMuted, cursor: "pointer", fontSize: 15, font: "inherit" }}
          >
            ×
          </button>
        ) : null}
      </div>

      {genres.length ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {genres.map(([label, count]) => {
            const active = genre === label;
            return (
              <button
                key={label}
                type="button"
                aria-pressed={active}
                onClick={() => setGenre(active ? null : label)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 999,
                  cursor: "pointer",
                  font: "inherit",
                  border: active ? "none" : `1px solid ${islandTheme.color.cardBorder}`,
                  background: active ? islandTheme.color.primary : "transparent",
                  color: active ? islandTheme.color.primaryText : islandTheme.color.textSubtle
                }}
              >
                {label}
                <span style={{ opacity: 0.7 }}>{count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          className="island-mono"
          style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: islandTheme.color.textMuted }}
        >
          {sectionLabel}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: islandTheme.color.textMuted }}>{statusText}</span>
      </div>
      <span aria-live="polite" role="status" style={VISUALLY_HIDDEN}>
        {statusText}
      </span>

      {visible.length ? (
        <div role="listbox" aria-label="Crew games" style={{ display: "grid", gap: 4, maxHeight: 220, overflowY: "auto" }}>
          {visible.map((g) => {
            const selected = g.appId === selectedAppId;
            return (
              <button
                key={g.appId}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onPick(g.appId)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 10,
                  alignItems: "center",
                  padding: 6,
                  borderRadius: 8,
                  border: selected ? `1px solid ${islandTheme.color.primaryGlow}` : "1px solid transparent",
                  background: selected ? "rgba(96,165,250,0.12)" : "transparent",
                  color: islandTheme.color.textPrimary,
                  cursor: "pointer",
                  font: "inherit",
                  textAlign: "left"
                }}
              >
                <GameCover
                  appId={g.appId}
                  storedUrl={g.headerImageUrl}
                  variant="header"
                  alt={g.name}
                  style={{ width: 48, height: 22, borderRadius: 4 }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {g.name}
                </span>
                <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
                  {g.ownerCount} own
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: islandTheme.color.textMuted }}>
          {total === 0
            ? "No crew libraries synced yet."
            : `No crew-owned games match “${query.trim()}”. Try another name.`}
        </p>
      )}

      {!showAll && hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          style={{
            background: "transparent",
            border: `1px solid ${islandTheme.color.cardBorder}`,
            color: islandTheme.color.primaryGlow,
            padding: "6px 12px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            font: "inherit"
          }}
        >
          Show all {filtered.length} {genre ? `${genre} ` : ""}games →
        </button>
      ) : null}
    </div>
  );
}

function QuickChip({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <IslandTag tone="primary" active={active} onClick={onClick}>
      {children}
    </IslandTag>
  );
}

type PatchScope = "all" | GameNewsScope;

type PatchKind = "patch" | "dlc" | "blog" | "roadmap" | "sale" | "news";

const PATCH_KIND_ICON: Record<PatchKind, string> = {
  patch: "🛠",
  dlc: "🎁",
  blog: "📝",
  roadmap: "🗺",
  sale: "💸",
  news: "📰"
};

function classifyNewsKind(item: GameNewsItem): PatchKind {
  const haystack = [
    ...(item.tags ?? []),
    item.feedLabel ?? "",
    item.feedName ?? "",
    item.title ?? ""
  ]
    .join(" ")
    .toLowerCase();
  if (haystack.includes("patchnote") || haystack.includes("patch ") || haystack.includes("hotfix") || haystack.includes("update")) {
    return "patch";
  }
  if (haystack.includes("dlc") || haystack.includes("expansion")) return "dlc";
  if (haystack.includes("roadmap")) return "roadmap";
  if (haystack.includes("sale") || haystack.includes("% off") || haystack.includes("discount")) {
    return "sale";
  }
  if (haystack.includes("blog") || haystack.includes("dev diary") || haystack.includes("dev_diary")) {
    return "blog";
  }
  return "news";
}

function relativeAgoLabel(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const now = Date.now();
  const deltaMs = Math.max(0, now - then);
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 8) return `${weeks}w ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

function buildScopeRationale(item: GameNewsItem, kind: PatchKind): string {
  const parts: string[] = [];
  if (item.scopes.includes("library")) parts.push("In your library");
  if (item.scopes.includes("wishlist")) parts.push("On your wishlist");
  if (item.scopes.includes("crew") && !item.scopes.includes("library") && !item.scopes.includes("wishlist")) {
    parts.push("Crew-owned");
  } else if (item.scopes.includes("crew")) {
    parts.push("crew owns it");
  }
  const kindLabel =
    kind === "patch" ? "patch notes"
    : kind === "dlc" ? "DLC reveal"
    : kind === "roadmap" ? "roadmap drop"
    : kind === "sale" ? "sale alert"
    : kind === "blog" ? "dev blog"
    : "fresh news";
  return parts.length ? `${parts.join(" · ")}. Latest ${kindLabel}.` : `Latest ${kindLabel} from the dev team.`;
}

function PatchesRolodex({ gameNews }: { gameNews: GameNewsItem[] }) {
  const [scope, setScope] = useState<PatchScope>("all");

  const decorated = useMemo(
    () =>
      gameNews.map((item) => ({
        item,
        kind: classifyNewsKind(item),
        ago: relativeAgoLabel(item.publishedAt)
      })),
    [gameNews]
  );

  const visible = useMemo(
    () =>
      scope === "all"
        ? decorated
        : decorated.filter((row) => row.item.scopes.includes(scope as GameNewsScope)),
    [decorated, scope]
  );

  const featured = visible[0] ?? null;
  const rest = visible.slice(1);

  return (
    <IslandCard
      style={{
        padding: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        position: "sticky",
        top: 90,
        maxHeight: "calc(100vh - 110px)"
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          borderBottom: `1px solid ${islandTheme.color.cardBorder}`,
          display: "flex",
          alignItems: "center",
          gap: 8
        }}
      >
        <h3 className="island-display" style={{ margin: 0, fontSize: 15 }}>
          Patches & Updates
        </h3>
        <span style={{ fontSize: 12, color: islandTheme.color.textMuted, marginLeft: "auto" }}>
          live from Steam
        </span>
      </div>

      {featured ? (
        <PatchFeatured
          item={featured.item}
          kind={featured.kind}
          ago={featured.ago}
        />
      ) : null}

      <div
        style={{
          padding: "8px 12px",
          borderTop: featured ? `1px solid ${islandTheme.color.cardBorder}` : "none",
          borderBottom: `1px solid ${islandTheme.color.cardBorder}`,
          display: "flex",
          gap: 4,
          flexWrap: "wrap"
        }}
      >
        {(["all", "library", "wishlist", "crew"] as PatchScope[]).map((s) => (
          <QuickChip key={s} active={s === scope} onClick={() => setScope(s)}>
            {s}
          </QuickChip>
        ))}
      </div>

      <div style={{ overflowY: "auto", flex: 1 }}>
        {rest.map((row, i) => (
          <PatchRow key={`${row.item.appId}-${row.item.gid}`} item={row.item} kind={row.kind} ago={row.ago} firstRow={i === 0} />
        ))}
        {visible.length === 0 ? (
          <div style={{ padding: 14, fontSize: 13, color: islandTheme.color.textMuted }}>
            {gameNews.length === 0
              ? "Sync your Steam library to start pulling fresh patch notes from games the crew owns."
              : "No matching news in this scope yet."}
          </div>
        ) : null}
      </div>
    </IslandCard>
  );
}

const AI_LABEL_CONFIG = {
  personal:  { text: "For You",         color: "#22c55e" },
  community: { text: "Crew Trending",   color: "#38bdf8" },
  top_news:  { text: "Top Gaming News", color: "#fb923c" }
} as const;

function AiLabelChip({ label }: { label: "personal" | "community" | "top_news" }) {
  const cfg = AI_LABEL_CONFIG[label];
  return (
    <span className="island-mono" style={{ ...islandTagStyle({ color: cfg.color }), flexShrink: 0 }}>
      {cfg.text}
    </span>
  );
}

function PatchFeatured({ item, kind, ago }: { item: GameNewsItem; kind: PatchKind; ago: string }) {
  const rationale = buildScopeRationale(item, kind);
  const isAIPick = (item.aiRelevanceScore ?? 0) >= 0.75;
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        padding: "12px 14px",
        display: "grid",
        gridTemplateColumns: "44px 1fr",
        gap: 10,
        background: "linear-gradient(135deg, rgba(96, 165, 250, 0.18), rgba(96, 165, 250, 0))",
        textDecoration: "none",
        color: "inherit"
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: coverUrl(item.appId, item.headerImageUrl)
            ? `center / cover no-repeat url(${JSON.stringify(coverUrl(item.appId, item.headerImageUrl))})`
            : islandTheme.color.panelMutedBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22
        }}
      >
        {coverUrl(item.appId, item.headerImageUrl) ? null : PATCH_KIND_ICON[kind]}
      </div>
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: 2
          }}
        >
          <span
            className="island-mono"
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: islandTheme.color.primaryGlow
            }}
          >
            ★ Featured · {item.gameName}
          </span>
          {item.aiLabel ? <AiLabelChip label={item.aiLabel} /> : isAIPick ? (
            <IslandTag color="#a78bfa">AI Pick</IslandTag>
          ) : null}
          {item.aiSpoilerWarning ? (
            <IslandTag tone="danger">⚠ Spoilers</IslandTag>
          ) : null}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{item.title}</div>
        <div style={{ marginTop: 4, fontSize: 12, color: islandTheme.color.textSubtle, lineHeight: 1.4 }}>
          {item.aiSummary || rationale}
        </div>
        <div
          className="island-mono"
          style={{
            marginTop: 6,
            display: "flex",
            gap: 10,
            fontSize: 12,
            color: islandTheme.color.textMuted
          }}
        >
          <span>{kind}</span>
          <span>·</span>
          <span>{formatSourceAttribution(item)}</span>
          <span>·</span>
          <span>{ago}</span>
        </div>
      </div>
    </a>
  );
}

function formatSourceAttribution(item: GameNewsItem): string {
  if (item.sourceKind === "rss") {
    return `via ${item.sourceLabel ?? item.feedLabel ?? "feed"}`;
  }
  return item.feedLabel ?? "Steam";
}

function PatchRow({
  item,
  kind,
  ago,
  firstRow
}: {
  item: GameNewsItem;
  kind: PatchKind;
  ago: string;
  firstRow: boolean;
}) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        padding: "10px 14px",
        display: "grid",
        gridTemplateColumns: "32px 1fr auto",
        gap: 10,
        alignItems: "center",
        borderTop: firstRow ? "none" : `1px solid ${islandTheme.color.cardBorder}`,
        textDecoration: "none",
        color: "inherit"
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: coverUrl(item.appId, item.headerImageUrl)
            ? `center / cover no-repeat url(${JSON.stringify(coverUrl(item.appId, item.headerImageUrl))})`
            : islandTheme.color.panelMutedBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16
        }}
      >
        {coverUrl(item.appId, item.headerImageUrl) ? null : PATCH_KIND_ICON[kind]}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              flex: 1,
              minWidth: 0
            }}
          >
            {item.gameName} — {item.title}
          </div>
          {item.aiLabel ? (
            <AiLabelChip label={item.aiLabel} />
          ) : (item.aiRelevanceScore ?? 0) >= 0.75 ? (
            <span className="island-mono" style={{ ...islandTagStyle({ color: "#a78bfa" }), flexShrink: 0 }}>AI</span>
          ) : null}
          {item.aiSpoilerWarning ? (
            <span className="island-mono" style={{ ...islandTagStyle({ color: "#ef4444" }), flexShrink: 0 }}>⚠ Spoilers</span>
          ) : null}
        </div>
        <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>
          {kind} · {formatSourceAttribution(item)} · {ago}
        </div>
        {item.aiSummary ? (
          <div style={{ fontSize: 12, color: islandTheme.color.textSubtle, marginTop: 3, lineHeight: 1.4 }}>
            {item.aiSummary}
          </div>
        ) : null}
      </div>
      <span
        style={{
          color: islandTheme.color.textMuted,
          fontSize: 14,
          padding: 4,
          flexShrink: 0
        }}
        aria-hidden="true"
      >
        ↗
      </span>
    </a>
  );
}

function ScheduledNights({
  gameNights,
  selectedNightId,
  selectedNight,
  currentUserAttendingSelectedNight,
  crewGames,
  onSelectNight,
  onJoinSelectedNight,
  onLeaveSelectedNight,
  onSetNightGame
}: GamesPageProps) {
  return (
    <section style={{ display: "grid", gap: 12 }}>
      <NightCardStyles />
      <SectionHead
        title="Scheduled game nights"
        meta="Hosts pick the game. RSVP to lock in a seat — no voting, no vibes lost."
      />
      {gameNights.length ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 12
          }}
        >
          {gameNights.map((night) => (
            <NightCard
              key={night.id}
              night={night}
              isSelected={selectedNightId === night.id}
              onSelect={() => onSelectNight(night.id, night.title)}
            />
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>No nights scheduled yet — plan one above.</p>
      )}
      {selectedNight ? (
        <SelectedNightDetail
          night={selectedNight}
          currentUserAttending={currentUserAttendingSelectedNight}
          crewGames={crewGames}
          onJoin={onJoinSelectedNight}
          onLeave={onLeaveSelectedNight}
          onSetNightGame={onSetNightGame}
        />
      ) : null}
    </section>
  );
}

function NightCardStyles() {
  return (
    <style>{`
      .bi-night-card { transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease; }
      @media (hover: hover) {
        .bi-night-card:hover { transform: translateY(-3px); }
      }
      @keyframes bi-countdown-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
      .bi-countdown-live { animation: bi-countdown-pulse 1.4s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .bi-night-card { transition: none; }
        .bi-night-card:hover { transform: none; }
        .bi-countdown-live { animation: none; }
      }
    `}</style>
  );
}

const COUNTDOWN_TONE: Record<CountdownTone, string> = {
  far: islandTheme.color.panelMutedBg,
  soon: "#fbbf24",
  imminent: "#fb923c",
  live: islandTheme.color.successAccent,
  past: islandTheme.color.panelMutedBg
};

function SeatPips({ pips, accent }: { pips: NonNullable<ReturnType<typeof seatPips>>; accent: string }) {
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }} aria-label={`${pips.filled} of ${pips.total} seats filled`}>
      {Array.from({ length: pips.total }).map((_, i) => (
        <span
          key={i}
          style={{ width: 7, height: 7, borderRadius: 999, background: i < pips.filled ? accent : "rgba(148,163,184,0.3)" }}
        />
      ))}
      {pips.overflow > 0 ? (
        <span className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted }}>
          +{pips.overflow}
        </span>
      ) : null}
    </span>
  );
}

function rsvpBtnStyle(attending: boolean): React.CSSProperties {
  return {
    background: attending ? "transparent" : islandTheme.color.primary,
    border: `1px solid ${attending ? islandTheme.color.danger : islandTheme.color.primary}`,
    color: attending ? islandTheme.color.dangerText : islandTheme.color.primaryText,
    padding: "7px 14px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    font: "inherit"
  };
}

function ghostBtnStyle(): React.CSSProperties {
  return {
    background: "transparent",
    border: `1px solid ${islandTheme.color.cardBorder}`,
    color: islandTheme.color.textSubtle,
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    font: "inherit"
  };
}

function NightCard({
  night,
  isSelected,
  onSelect
}: {
  night: GameNight;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const accent = gameAccent(night.selectedTags);
  const countdown = countdownLabel(night.scheduledFor);
  const pips = seatPips(night.attendeeCount, night.selectedMaxPlayers);
  const urgent = countdown.tone === "soon" || countdown.tone === "imminent" || countdown.tone === "live";
  const borderColor = isSelected
    ? islandTheme.color.primaryGlow
    : night.selectedAppId
      ? accent.accent
      : islandTheme.color.cardBorder;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="bi-night-card"
      style={{
        textAlign: "left",
        position: "relative",
        isolation: "isolate",
        overflow: "hidden",
        background: islandTheme.color.panelBg,
        backdropFilter: islandTheme.glass.blur,
        WebkitBackdropFilter: islandTheme.glass.blur,
        border: `1px solid ${borderColor}`,
        borderRadius: 14,
        padding: 14,
        cursor: "pointer",
        font: "inherit",
        color: islandTheme.color.textPrimary,
        boxShadow: isSelected ? "0 0 0 1px rgba(96,165,250,0.5), 0 6px 20px rgba(0,0,0,0.3)" : "none"
      }}
    >
      {night.selectedAppId ? (
        // A night for Lethal Company should look like Lethal Company: the
        // game's own art washes the whole card under a scrim.
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: -12,
            zIndex: -1,
            background: `linear-gradient(180deg, rgba(2,6,23,0.25), rgba(2,6,23,0.78)), center / cover no-repeat url(${JSON.stringify(coverUrl(night.selectedAppId, night.selectedGameImage) ?? "")})`,
            filter: "blur(7px) saturate(115%)",
            opacity: 0.5
          }}
        />
      ) : null}
      <div style={{ position: "relative", marginBottom: 10 }}>
        {night.selectedAppId ? (
          <LogoCover
            appId={night.selectedAppId}
            storedUrl={night.selectedGameImage}
            variant="capsule"
            alt={night.selectedGameName ?? "Selected game"}
            style={{ width: "100%", aspectRatio: "460 / 215", borderRadius: 10, border: `1px solid ${accent.accent}` }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              aspectRatio: "460 / 215",
              borderRadius: 10,
              border: `1px dashed ${islandTheme.color.cardBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              color: islandTheme.color.textMuted,
              fontSize: 13,
              background: "linear-gradient(135deg,#0f172a,#1e293b)"
            }}
          >
            <span aria-hidden="true">🎲</span> No game yet
          </div>
        )}
        <span
          className={countdown.tone === "live" ? "bi-countdown-live" : undefined}
          style={{
            position: "absolute",
            top: 7,
            right: 7,
            fontSize: 11,
            fontWeight: 700,
            color: urgent ? "#0b1220" : islandTheme.color.textSubtle,
            background: COUNTDOWN_TONE[countdown.tone],
            padding: "2px 8px",
            borderRadius: 999
          }}
        >
          ⏱ {countdown.text}
        </span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{night.title}</div>
      <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
        {formatNightDate(night.scheduledFor)}
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 13,
          color: islandTheme.color.textSubtle
        }}
      >
        {night.selectedGameName ? (
          <span>
            🎮 <strong style={{ color: islandTheme.color.textPrimary }}>{night.selectedGameName}</strong>
          </span>
        ) : (
          <span style={{ color: islandTheme.color.textMuted }}>Host hasn't picked yet</span>
        )}
      </div>
      <div
        style={{
          marginTop: 10,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center"
        }}
      >
        <Pill tone={night.currentUserAttending ? "success" : "muted"}>
          {night.currentUserAttending ? "You're in" : "Open seats"}
        </Pill>
        {pips ? <SeatPips pips={pips} accent={accent.accent} /> : <Pill tone="muted">{night.attendeeCount} crew</Pill>}
        <AttendeeAvatars attendees={night.attendees} total={night.attendeeCount} hasGame={Boolean(night.selectedAppId)} />
      </div>
    </button>
  );
}

function AttendeeAvatars({
  attendees,
  total,
  hasGame = false
}: {
  attendees: GameNight["attendees"];
  total: number;
  hasGame?: boolean;
}) {
  if (!attendees || attendees.length === 0) return null;
  const shown = attendees.slice(0, 8);
  const overflow = total - shown.length;
  // Won't-run signal: when a game is locked, members who don't own it are faded
  // and counted. Meaningless (and hidden) until a game is selected.
  const missing = hasGame ? attendees.filter((a) => !a.ownsSelected).length : 0;
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {shown.map((a, i) => {
        const dontOwn = hasGame && !a.ownsSelected;
        return (
          <span
            key={`${a.displayName}-${i}`}
            title={dontOwn ? `${a.displayName} — doesn't own this game` : a.displayName}
            style={{
              width: 26,
              height: 26,
              borderRadius: 999,
              marginLeft: i === 0 ? 0 : -8,
              border: `2px solid ${dontOwn ? islandTheme.color.dangerAccent : islandTheme.color.panelBg}`,
              background: a.avatarUrl ? `url("${a.avatarUrl}") center/cover` : islandTheme.color.panelMutedBg,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: islandTheme.color.textSubtle,
              flexShrink: 0,
              opacity: dontOwn ? 0.45 : 1,
              filter: dontOwn ? "grayscale(1)" : "none"
            }}
          >
            {a.avatarUrl ? "" : (a.displayName || "?").trim().slice(0, 1).toUpperCase()}
          </span>
        );
      })}
      {overflow > 0 ? (
        <span className="island-mono" style={{ marginLeft: 6, fontSize: 12, color: islandTheme.color.textMuted }}>
          +{overflow}
        </span>
      ) : null}
      {missing > 0 ? (
        <span
          className="island-mono"
          style={{ marginLeft: 8, fontSize: 11, color: islandTheme.color.dangerSoft }}
          title="Members who don't own the picked game"
        >
          {missing} can't run it
        </span>
      ) : null}
    </div>
  );
}

function SelectedNightDetail({
  night,
  currentUserAttending,
  crewGames,
  onJoin,
  onLeave,
  onSetNightGame
}: {
  night: GameNight;
  currentUserAttending: boolean;
  crewGames: CrewOwnedGame[];
  onJoin: () => void;
  onLeave: () => void;
  onSetNightGame: (nightId: number, appId: number | null) => void;
}) {
  const [swapping, setSwapping] = useState(false);
  const [swapQuery, setSwapQuery] = useState("");
  const accent = gameAccent(night.selectedTags);
  return (
    <IslandCard style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 className="island-display" style={{ margin: 0, fontSize: 18 }}>
          {night.title}
        </h3>
        <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
          {formatNightDate(night.scheduledFor)}
        </span>
        <button type="button" onClick={currentUserAttending ? onLeave : onJoin} style={{ marginLeft: "auto", ...rsvpBtnStyle(currentUserAttending) }}>
          {currentUserAttending ? "Leave" : "RSVP"}
        </button>
      </div>
      {night.selectedAppId ? (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <LogoCover
            appId={night.selectedAppId}
            storedUrl={night.selectedGameImage}
            variant="capsule"
            alt={night.selectedGameName ?? "Selected game"}
            style={{
              width: 184,
              aspectRatio: "460 / 215",
              borderRadius: 10,
              border: `1px solid ${accent.accent}`,
              flexShrink: 0
            }}
          />
          <div style={{ display: "grid", gap: 6, minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, color: islandTheme.color.textSubtle }}>
              Tonight's pick: <strong style={{ color: islandTheme.color.textPrimary }}>{night.selectedGameName}</strong>
            </div>
            {modePills(night.selectedGameModes).length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {modePills(night.selectedGameModes).map((p) => (
                  <Pill key={p} tone="muted">
                    {p}
                  </Pill>
                ))}
              </div>
            ) : null}
            {night.canManageGame ? (
              <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                <button type="button" onClick={() => setSwapping((v) => !v)} style={ghostBtnStyle()}>
                  🔄 Swap game
                </button>
                <button type="button" onClick={() => onSetNightGame(night.id, null)} style={ghostBtnStyle()}>
                  Clear
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: islandTheme.color.textMuted }}>Host hasn't locked a game yet.</span>
          {night.canManageGame ? (
            <button type="button" onClick={() => setSwapping((v) => !v)} style={ghostBtnStyle()}>
              🎮 Pick a game
            </button>
          ) : null}
        </div>
      )}
      {swapping ? (
        <LibraryResults
          crewGames={crewGames}
          query={swapQuery}
          onQueryChange={setSwapQuery}
          selectedAppId={night.selectedAppId}
          onPick={(appId) => {
            onSetNightGame(night.id, appId);
            setSwapping(false);
          }}
        />
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <AttendeeAvatars attendees={night.attendees} total={night.attendeeCount} hasGame={Boolean(night.selectedAppId)} />
        <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
          {night.attendeeCount} attending
        </span>
      </div>
    </IslandCard>
  );
}

function Pill({ tone, children }: { tone: "success" | "muted" | "danger"; children: ReactNode }) {
  return (
    <IslandTag tone={tone === "muted" ? "default" : tone}>
      {children}
    </IslandTag>
  );
}

function formatNightDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time TBD";
  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatWishlistPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function GroupWishlist({ crewWishlist }: { crewWishlist: CrewWishlistGame[] }) {
  const visible = crewWishlist.slice(0, 12);

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <SectionHead
        title="Group wishlist"
        meta="Pooled Steam wishlists, sorted by crew hype. Most wanted at the top."
      />
      {visible.length === 0 ? (
        <IslandCard style={{ padding: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textSubtle }}>
            No crew wishlists synced yet. Sign in with Steam from Profile and make sure your wishlist is set to public —
            we'll start pooling the hype the moment your next sync runs.
          </p>
        </IslandCard>
      ) : (
        <PosterWall>
          {visible.map((game) => (
            <WishlistPoster key={game.appId} game={game} />
          ))}
        </PosterWall>
      )}
    </section>
  );
}

// Same poster treatment as the Steam library, with crew-hype + price in place of
// ownership. The cover isn't clickable here (no detail drawer on the Games page).
function WishlistPoster({ game }: { game: CrewWishlistGame }) {
  const onSale = typeof game.priceDiscountPct === "number" && game.priceDiscountPct > 0;
  const priceLine = game.isFree
    ? "Free"
    : typeof game.priceFinalCents === "number"
      ? formatWishlistPrice(game.priceFinalCents)
      : null;
  const displayName = game.name.startsWith("app-") ? `App ${game.appId}` : game.name;

  return (
    <PosterCard
      appId={game.appId}
      name={displayName}
      category={categoryFor(game)}
      capabilities={game}
      owners={game.wishlistedBy}
      caption={
        <>
          {game.hypeCount} want
          {priceLine ? ` · ${priceLine}` : ""}
        </>
      }
      badges={
        <>
          {onSale ? <IslandTag tone="success">-{game.priceDiscountPct}%</IslandTag> : null}
          {game.isFree ? <IslandTag tone="primary">FREE</IslandTag> : null}
        </>
      }
    />
  );
}

function LibrarySnapshot({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  return (
    <IslandCard
      style={{
        padding: 16,
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 14,
        alignItems: "center"
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          background: "linear-gradient(135deg, #fbbf24, #ef8354)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 26
        }}
      >
        🗂
      </div>
      <div>
        <div className="island-display" style={{ fontSize: 17, fontWeight: 700 }}>
          Steam library
        </div>
        <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 3 }}>
          Filterable list of all crew-owned games with co-ownership badges. Quick PLAN shortcut on every row.
        </div>
      </div>
      <button
        type="button"
        className="island-btn"
        onClick={() => onNavigate("library")}
        style={{
          background: islandTheme.color.primary,
          border: `1px solid ${islandTheme.color.primary}`,
          color: islandTheme.color.primaryText,
          padding: "7px 14px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          font: "inherit"
        }}
      >
        Browse library →
      </button>
    </IslandCard>
  );
}

function StreamDrawer({ members }: { members: GuildMember[] }) {
  const [open, setOpen] = useState(false);
  const inGame = useMemo(
    () => members.filter((m) => m.inVoice || (m.richPresenceText ?? "").trim().length > 0),
    [members]
  );

  if (inGame.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className="island-btn bi-stream-tab"
        onClick={() => setOpen((v) => !v)}
        style={{
          transform: "translateY(-50%) rotate(180deg)",
          writingMode: "vertical-rl",
          padding: "16px 8px",
          background: islandTheme.color.successAccent,
          color: islandTheme.color.textInverted,
          border: "none",
          borderTopLeftRadius: 12,
          borderBottomLeftRadius: 12,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          cursor: "pointer",
          font: "inherit",
          boxShadow: "-4px 0 14px rgba(0,0,0,0.4)",
          minHeight: 44
        }}
      >
        ● In game · {inGame.length}
      </button>
      <aside
        className={`bi-stream-drawer${open ? " bi-stream-drawer--open" : ""}`}
        style={{
          width: 320,
          maxWidth: "90vw",
          background: islandTheme.color.panelBg,
          backdropFilter: islandTheme.glass.blurStrong,
          WebkitBackdropFilter: islandTheme.glass.blurStrong,
          border: `1px solid ${islandTheme.color.cardBorder}`,
          borderRight: "none",
          borderTopLeftRadius: 14,
          borderBottomLeftRadius: 14,
          padding: "14px 12px",
          overflowY: "auto"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <h3 className="island-display" style={{ margin: 0, fontSize: 15 }}>
            In game now
          </h3>
          <button
            type="button"
            className="island-btn"
            onClick={() => setOpen(false)}
            aria-label="Close"
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "none",
              color: islandTheme.color.textMuted,
              cursor: "pointer",
              fontSize: 16
            }}
          >
            ×
          </button>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {inGame.map((m) => {
            const presence = (m.richPresenceText ?? "").trim() || "In voice";
            return (
              <article
                key={m.discordUserId}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  background: islandTheme.color.panelMutedBg,
                  border: `1px solid ${islandTheme.color.cardBorder}`,
                  display: "grid",
                  gridTemplateColumns: "32px 1fr",
                  gap: 10,
                  alignItems: "center"
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    background: m.avatarUrl
                      ? `center / cover no-repeat url(${JSON.stringify(m.avatarUrl)})`
                      : islandTheme.color.successAccent,
                    color: islandTheme.color.textInverted,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700
                  }}
                >
                  {m.avatarUrl ? "" : (m.displayName[0] ?? "?").toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}
                  >
                    {m.displayName}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: islandTheme.color.textSubtle,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}
                  >
                    {presence}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </aside>
    </>
  );
}

function SectionHead({ title, meta }: { title: string; meta: string }) {
  return (
    <div>
      <h2 className="island-display" style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
        {title}
      </h2>
      <div
        className="island-mono"
        style={{
          marginTop: 4,
          fontSize: 12,
          color: islandTheme.color.textMuted,
          textTransform: "uppercase",
          letterSpacing: "0.06em"
        }}
      >
        {meta}
      </div>
    </div>
  );
}

// ── Crew Chat ─────────────────────────────────────────────────────────────────

const NUGGIE_STARTERS = [
  "What should we play tonight?",
  "Any big patches this week?",
  "Pick a co-op game for 4"
];

function NuggieTyping() {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div
        aria-label="Nuggie is thinking"
        style={{
          padding: "10px 14px",
          borderRadius: "14px 14px 14px 4px",
          background: islandTheme.color.panelMutedBg,
          border: `1px solid ${islandTheme.color.cardBorder}`,
          display: "flex",
          alignItems: "center",
          gap: 5
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="bi-nuggie-dot"
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: islandTheme.color.textMuted,
              animationDelay: `${i * 0.16}s`
            }}
          />
        ))}
      </div>
    </div>
  );
}

function CrewChat({ onSend }: { onSend: (message: string, history: ChatMessage[]) => Promise<{ reply: string; error?: string }> }) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput("");
    setError(null);
    const next: ChatMessage[] = [...history, { role: "user", content: msg }];
    setHistory(next);
    setSending(true);

    const result = await onSend(msg, history);
    setSending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setHistory([...next, { role: "assistant", content: result.reply }]);
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
  };

  return (
    <IslandCard style={{ padding: 0, overflow: "hidden" }}>
      <style>{`
        @keyframes bi-nuggie-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
        .bi-nuggie-dot { animation: bi-nuggie-bounce 1.1s infinite ease-in-out; }
        @media (prefers-reduced-motion: reduce) {
          .bi-nuggie-dot { animation: none; opacity: 0.7; }
        }
      `}</style>
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${islandTheme.color.cardBorder}`,
          display: "flex",
          alignItems: "center",
          gap: 8
        }}
      >
        <span style={{ fontSize: 18 }}>🍗</span>
        <h3 className="island-display" style={{ margin: 0, fontSize: 15 }}>
          Nuggie
        </h3>
        <span style={{ fontSize: 12, color: islandTheme.color.textMuted, marginLeft: "auto" }}>
          Ask what to play, get crew recs, check news
        </span>
      </div>

      {history.length > 0 ? (
        <div
          ref={scrollRef}
          style={{
            maxHeight: 320,
            overflowY: "auto",
            padding: "12px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 10
          }}
        >
          {history.map((msg, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start"
              }}
            >
              <div
                style={{
                  maxWidth: "82%",
                  padding: "8px 12px",
                  borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  background: msg.role === "user"
                    ? "rgba(139, 92, 246, 0.25)"
                    : islandTheme.color.panelMutedBg,
                  border: `1px solid ${msg.role === "user" ? "rgba(139, 92, 246, 0.35)" : islandTheme.color.cardBorder}`,
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: islandTheme.color.textPrimary,
                  whiteSpace: "pre-wrap"
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {sending ? <NuggieTyping /> : null}
          {error ? (
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                background: "rgba(239, 68, 68, 0.12)",
                border: `1px solid rgba(239, 68, 68, 0.3)`,
                fontSize: 12,
                color: islandTheme.color.danger
              }}
            >
              {error}
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12, alignItems: "center", textAlign: "center" }}>
          <span style={{ fontSize: 34 }}>🍗</span>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: islandTheme.color.textSubtle, maxWidth: 360 }}>
            Hiya, I'm Nuggie. Ask me what the crew should play, who owns what, or what just dropped on Steam.
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
            {NUGGIE_STARTERS.map((starter) => (
              <button
                key={starter}
                type="button"
                className="island-btn"
                onClick={() => setInput(starter)}
                style={{
                  background: islandTheme.color.panelMutedBg,
                  border: `1px solid ${islandTheme.color.cardBorder}`,
                  color: islandTheme.color.textSubtle,
                  fontSize: 12,
                  padding: "6px 12px",
                  borderRadius: 999,
                  cursor: "pointer",
                  font: "inherit"
                }}
              >
                {starter}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          padding: "10px 14px",
          borderTop: history.length > 0 ? `1px solid ${islandTheme.color.cardBorder}` : "none",
          display: "flex",
          gap: 8
        }}
      >
        <input
          style={{ ...islandInputStyle, flex: 1, fontSize: 13 }}
          type="text"
          placeholder='Ask Nuggie — "What should we play tonight?" or "Any big patches this week?"'
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={sending}
        />
        <button
          type="button"
          className="island-btn"
          onClick={handleSend}
          disabled={!input.trim() || sending}
          style={{
            padding: "9px 18px",
            borderRadius: islandTheme.radius.control,
            border: "none",
            background: input.trim() && !sending ? "rgba(139, 92, 246, 0.8)" : islandTheme.color.panelMutedBg,
            color: input.trim() && !sending ? islandTheme.color.textInverted : islandTheme.color.textMuted,
            fontSize: 13,
            fontWeight: 700,
            cursor: input.trim() && !sending ? "pointer" : "default",
            transition: "background 150ms",
            font: "inherit"
          }}
        >
          Send
        </button>
      </div>
    </IslandCard>
  );
}
