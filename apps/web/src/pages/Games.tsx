import React, { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IslandCard, IslandTag, islandInputStyle, islandTagStyle } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import { GameCover, coverUrl } from "../steamArt.js";
import { modePills } from "../gameModes.js";
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
  onSelectNight: (id: number, title: string) => void;
  onNewNightTitleChange: (value: string) => void;
  onNewNightScheduledForChange: (value: string) => void;
  onToggleSelectedMember: (discordUserId: string) => void;
  onCreateGameNight: () => void;
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
          <SessionComposer {...props} />
          <ScheduledNights {...props} />
          <EverythingTeaser onOpen={() => setView("everything")} />
        </>
      ) : (
        <>
          <SessionAndPatchesRow {...props} />
          <CrewChat onSend={props.onSendChatMessage} />
          <ScheduledNights {...props} />
          <GroupWishlist crewWishlist={props.crewWishlist} />
          <LibrarySnapshot onNavigate={props.onNavigate} />
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
        <h1 className="island-display" style={{ margin: 0, fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 800 }}>
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
      <SessionComposer {...props} />
      <PatchesRolodex gameNews={props.gameNews} />
    </section>
  );
}

const AI_MODES = ["Tonight", "Weekend", "Quick", "Cozy", "Spicy"] as const;
type AIMode = (typeof AI_MODES)[number];

const SESSION_COMPOSER_FALLBACK = {
  title: "Pick a crew to see the AI pick",
  reason:
    "Tap members in the roster below to populate a session — we'll surface the strongest crew-overlap and why it fits.",
  cover: "linear-gradient(135deg,#0f172a 0%,#1e293b 100%)"
};

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

function pickStats(pick: ComposerPick): Array<{ k: string; v: string }> {
  const stats: Array<{ k: string; v: string }> = [
    { k: "crew own", v: `${pick.ownersInScope} / ${pick.scopeSize}` }
  ];
  if (typeof pick.maxPlayers === "number") {
    stats.push({ k: "max players", v: `${pick.maxPlayers}` });
  }
  if (pick.tags.length > 0) {
    stats.push({ k: "tag", v: pick.tags[0].toLowerCase() });
  }
  stats.push({ k: "scope", v: pick.source === "selection" ? "selected crew" : "island crew" });
  return stats.slice(0, 5);
}

function pickCoverInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function SessionComposer(props: GamesPageProps) {
  const [mode, setMode] = useState<AIMode>("Tonight");
  const pick = useMemo(() => buildComposerPick(props), [props]);
  const pickCover = coverUrl(pick?.appId, pick?.headerImageUrl);
  const composerRef = useRef<HTMLDivElement>(null);
  const { composerScrollNonce } = props;

  useEffect(() => {
    if (composerScrollNonce === 0) return;
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [composerScrollNonce]);

  return (
    <div ref={composerRef} style={{ scrollMarginTop: 90 }}>
    <IslandCard style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          padding: "14px 16px 12px",
          borderBottom: `1px solid ${islandTheme.color.cardBorder}`,
          display: "flex",
          alignItems: "center",
          gap: 12
        }}
      >
        <IslandTag tone="primary">★ AI pick</IslandTag>
        {pick ? (
          <>
            <span style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
              Match strength{" "}
              <strong style={{ color: islandTheme.color.textPrimary }}>{pick.matchPct}%</strong>
            </span>
            <IslandTag tone="default">
              {pick.source === "selection" ? "your crew" : "island default"}
            </IslandTag>
          </>
        ) : (
          <span style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
            Empty shore — sync some crew Steam libraries to populate.
          </span>
        )}
      </div>

      <div style={{ display: "grid", gap: 12, padding: 16 }}>
        {/* Featured-banner treatment: the picked game gets the same wide
            art-with-gradient presentation as the home featured card. */}
        <div
          role={pick ? "img" : undefined}
          aria-label={pick ? pick.name : undefined}
          style={{
            minHeight: pick ? 120 : 88,
            borderRadius: 12,
            border: `1px solid ${islandTheme.color.cardBorder}`,
            display: "flex",
            alignItems: "flex-end",
            padding: "12px 16px",
            overflow: "hidden",
            background: pickCover
              ? `linear-gradient(135deg, rgba(8,16,34,0.88) 25%, rgba(8,16,34,0.45) 70%, rgba(8,16,34,0.15) 100%), url("${pickCover}") center / cover no-repeat`
              : SESSION_COMPOSER_FALLBACK.cover
          }}
        >
          <div style={{ minWidth: 0 }}>
            {!pickCover && pick ? (
              <div
                className="island-mono"
                style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", marginBottom: 2 }}
              >
                {pickCoverInitials(pick.name)}
              </div>
            ) : null}
            <h2
              className="island-display"
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
                color: "#f8fafc",
                textShadow: "0 2px 10px rgba(0,0,0,0.55)"
              }}
            >
              {pick?.name ?? SESSION_COMPOSER_FALLBACK.title}
            </h2>
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: islandTheme.color.textSubtle, maxWidth: "68ch" }}>
            {pick?.blurb ?? pick?.reason ?? SESSION_COMPOSER_FALLBACK.reason}
          </p>
          <ModeBar value={mode} onChange={setMode} />
          {pick ? <StatStrip stats={pickStats(pick)} /> : null}
        </div>
      </div>

      <RosterPicker {...props} />
    </IslandCard>
    </div>
  );
}

function ModeBar({ value, onChange }: { value: AIMode; onChange: (m: AIMode) => void }) {
  return (
    <div
      style={{
        marginTop: 12,
        display: "flex",
        gap: 0,
        borderBottom: `1px solid ${islandTheme.color.cardBorder}`
      }}
    >
      {AI_MODES.map((m) => {
        const active = m === value;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            style={{
              padding: "8px 12px",
              border: "none",
              background: "transparent",
              color: active ? islandTheme.color.textPrimary : islandTheme.color.textMuted,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              borderBottom: active
                ? `2px solid ${islandTheme.color.primaryGlow}`
                : "2px solid transparent",
              marginBottom: -1,
              font: "inherit"
            }}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}

function StatStrip({ stats }: { stats: Array<{ k: string; v: string }> }) {
  return (
    <div
      style={{
        marginTop: 12,
        display: "grid",
        gridTemplateColumns: `repeat(${stats.length}, 1fr)`,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        borderRadius: 10,
        overflow: "hidden",
        background: islandTheme.color.panelMutedBg
      }}
    >
      {stats.map((s, i) => (
        <div
          key={s.k}
          style={{
            padding: "8px 10px",
            borderRight: i < stats.length - 1 ? `1px solid ${islandTheme.color.cardBorder}` : "none",
            textAlign: "left"
          }}
        >
          <div
            className="island-mono"
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: islandTheme.color.textMuted
            }}
          >
            {s.k}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{s.v}</div>
        </div>
      ))}
    </div>
  );
}

function RosterPicker({
  filteredGuildMembers,
  selectedMemberIds,
  onToggleSelectedMember
}: GamesPageProps) {
  const display = filteredGuildMembers.slice(0, 8);
  const ready = selectedMemberIds.length;
  return (
    <div
      style={{
        borderTop: `1px solid ${islandTheme.color.cardBorder}`,
        padding: "12px 16px"
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span
          className="island-mono"
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: islandTheme.color.textMuted
          }}
        >
          Crew roster
        </span>
        <span style={{ fontSize: 12, color: islandTheme.color.textPrimary, fontWeight: 700 }}>
          {ready} ready
        </span>
        <span style={{ fontSize: 12, color: islandTheme.color.textMuted, marginLeft: "auto" }}>
          tap to add to invite
        </span>
      </div>
      {display.length ? (
        <div style={{ display: "grid", gap: 4 }}>
          {display.map((m) => {
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
                onClick={() => onToggleSelectedMember(m.discordUserId)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "16px 1fr auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: selected
                    ? `1px solid ${islandTheme.color.primaryGlow}`
                    : `1px solid transparent`,
                  background: selected ? "rgba(96, 165, 250, 0.12)" : "transparent",
                  color: islandTheme.color.textPrimary,
                  cursor: "pointer",
                  font: "inherit"
                }}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  readOnly
                  style={{ pointerEvents: "none" }}
                />
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
  newNightTitle,
  newNightScheduledFor,
  onSelectNight,
  onNewNightTitleChange,
  onNewNightScheduledForChange,
  onCreateGameNight,
  onJoinSelectedNight,
  onLeaveSelectedNight
}: GamesPageProps) {
  return (
    <section style={{ display: "grid", gap: 12 }}>
      <SectionHead
        title="Scheduled game nights"
        meta="Hosts pick the game. RSVP to lock in a seat — no voting, no vibes lost."
      />
      <CreateNightStrip
        title={newNightTitle}
        scheduledFor={newNightScheduledFor}
        onTitleChange={onNewNightTitleChange}
        onScheduledForChange={onNewNightScheduledForChange}
        onCreate={onCreateGameNight}
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
        <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>No nights scheduled yet.</p>
      )}
      {selectedNight ? (
        <SelectedNightDetail
          night={selectedNight}
          currentUserAttending={currentUserAttendingSelectedNight}
          onJoin={onJoinSelectedNight}
          onLeave={onLeaveSelectedNight}
        />
      ) : null}
    </section>
  );
}

function CreateNightStrip({
  title,
  scheduledFor,
  onTitleChange,
  onScheduledForChange,
  onCreate
}: {
  title: string;
  scheduledFor: string;
  onTitleChange: (v: string) => void;
  onScheduledForChange: (v: string) => void;
  onCreate: () => void;
}) {
  return (
    <IslandCard style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <span
        className="island-mono"
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: islandTheme.color.textMuted
        }}
      >
        New
      </span>
      <input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Friday Island Session"
        style={{ ...islandInputStyle, flex: "1 1 220px", minWidth: 220, fontSize: 13, borderRadius: islandTheme.radius.control }}
      />
      <input
        type="datetime-local"
        value={scheduledFor}
        onChange={(e) => onScheduledForChange(e.target.value)}
        style={{ ...islandInputStyle, fontSize: 13, borderRadius: islandTheme.radius.control }}
      />
      <button
        type="button"
        onClick={onCreate}
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
        Drop a night
      </button>
    </IslandCard>
  );
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
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        textAlign: "left",
        background: islandTheme.color.panelBg,
        backdropFilter: islandTheme.glass.blur,
        WebkitBackdropFilter: islandTheme.glass.blur,
        border: isSelected
          ? `1px solid ${islandTheme.color.primaryGlow}`
          : `1px solid ${islandTheme.color.cardBorder}`,
        borderRadius: 14,
        padding: 14,
        cursor: "pointer",
        font: "inherit",
        color: islandTheme.color.textPrimary,
        boxShadow: isSelected ? "0 0 0 1px rgba(96,165,250,0.5), 0 6px 20px rgba(0,0,0,0.3)" : "none"
      }}
    >
      {night.selectedAppId ? (
        <GameCover
          appId={night.selectedAppId}
          storedUrl={night.selectedGameImage}
          variant="header"
          alt={night.selectedGameName ?? "Selected game"}
          style={{
            width: "100%",
            aspectRatio: "460 / 215",
            borderRadius: 10,
            border: `1px solid ${islandTheme.color.cardBorder}`,
            marginBottom: 10
          }}
        />
      ) : null}
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{night.title}</div>
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
          gap: 6,
          flexWrap: "wrap"
        }}
      >
        <Pill tone={night.currentUserAttending ? "success" : "muted"}>
          {night.currentUserAttending ? "You're in" : "Not joined"}
        </Pill>
        <Pill tone="muted">{night.attendeeCount} crew</Pill>
      </div>
    </button>
  );
}

function AttendeeAvatars({ attendees, total }: { attendees: GameNight["attendees"]; total: number }) {
  if (!attendees || attendees.length === 0) return null;
  const shown = attendees.slice(0, 8);
  const overflow = total - shown.length;
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {shown.map((a, i) => (
        <span
          key={`${a.displayName}-${i}`}
          title={a.displayName}
          style={{
            width: 26,
            height: 26,
            borderRadius: 999,
            marginLeft: i === 0 ? 0 : -8,
            border: `2px solid ${islandTheme.color.panelBg}`,
            background: a.avatarUrl ? `url("${a.avatarUrl}") center/cover` : islandTheme.color.panelMutedBg,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 800,
            color: islandTheme.color.textSubtle,
            flexShrink: 0
          }}
        >
          {a.avatarUrl ? "" : (a.displayName || "?").trim().slice(0, 1).toUpperCase()}
        </span>
      ))}
      {overflow > 0 ? (
        <span
          className="island-mono"
          style={{ marginLeft: 6, fontSize: 12, color: islandTheme.color.textMuted }}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

function SelectedNightDetail({
  night,
  currentUserAttending,
  onJoin,
  onLeave
}: {
  night: GameNight;
  currentUserAttending: boolean;
  onJoin: () => void;
  onLeave: () => void;
}) {
  return (
    <IslandCard style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 className="island-display" style={{ margin: 0, fontSize: 18 }}>
          {night.title}
        </h3>
        <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
          {formatNightDate(night.scheduledFor)}
        </span>
        <button
          type="button"
          onClick={currentUserAttending ? onLeave : onJoin}
          style={{
            marginLeft: "auto",
            background: currentUserAttending ? "transparent" : islandTheme.color.primary,
            border: `1px solid ${currentUserAttending ? islandTheme.color.danger : islandTheme.color.primary}`,
            color: currentUserAttending ? islandTheme.color.dangerText : islandTheme.color.primaryText,
            padding: "7px 14px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            font: "inherit"
          }}
        >
          {currentUserAttending ? "Leave" : "RSVP"}
        </button>
      </div>
      {night.selectedAppId ? (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <GameCover
            appId={night.selectedAppId}
            storedUrl={night.selectedGameImage}
            variant="capsule"
            alt={night.selectedGameName ?? "Selected game"}
            style={{
              width: 184,
              aspectRatio: "460 / 215",
              borderRadius: 10,
              border: `1px solid ${islandTheme.color.cardBorder}`,
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
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: islandTheme.color.textMuted }}>Host hasn't locked a game yet.</div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <AttendeeAvatars attendees={night.attendees} total={night.attendeeCount} />
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
  const maxHype = visible.reduce((max, game) => Math.max(max, game.hypeCount), 0);
  const totalCrewWithHype = useMemo(() => {
    const ids = new Set<string>();
    for (const game of crewWishlist) {
      for (const owner of game.wishlistedBy) {
        ids.add(owner.discordUserId);
      }
    }
    return ids.size;
  }, [crewWishlist]);
  const hypeScale = Math.max(maxHype, totalCrewWithHype, 1);

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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 10
          }}
        >
          {visible.map((game) => (
            <WishlistCard key={game.appId} game={game} hypeScale={hypeScale} />
          ))}
        </div>
      )}
    </section>
  );
}

function WishlistCard({ game, hypeScale }: { game: CrewWishlistGame; hypeScale: number }) {
  const pills = modePills(game).slice(0, 2);
  return (
    <article
      style={{
        padding: 12,
        borderRadius: 12,
        background: islandTheme.color.panelBg,
        backdropFilter: islandTheme.glass.blur,
        WebkitBackdropFilter: islandTheme.glass.blur,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        display: "grid",
        gridTemplateColumns: "60px 1fr",
        gap: 10,
        alignItems: "center"
      }}
    >
      <GameCover
        appId={game.appId}
        storedUrl={game.headerImageUrl}
        variant="header"
        alt={game.name}
        style={{ width: 60, height: 60, borderRadius: 10 }}
      />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            color: game.name.startsWith("app-") ? islandTheme.color.textMuted : undefined,
            fontStyle: game.name.startsWith("app-") ? "italic" : undefined
          }}
          title={game.name.startsWith("app-") ? `App ${game.appId} — name loading` : game.name}
        >
          {game.name.startsWith("app-") ? `App ${game.appId}` : game.name}
        </div>
        <WishlistPriceBadge game={game} />
        {pills.length > 0 ? (
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {pills.map((p) => (
              <span
                key={p}
                className="island-mono"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  padding: "2px 6px",
                  borderRadius: 999,
                  border: `1px solid ${islandTheme.color.cardBorder}`,
                  color: islandTheme.color.textMuted
                }}
              >
                {p}
              </span>
            ))}
          </div>
        ) : null}
        <HypeBar count={game.hypeCount} scale={hypeScale} />
      </div>
    </article>
  );
}

function WishlistPriceBadge({ game }: { game: CrewWishlistGame }) {
  const onSale = typeof game.priceDiscountPct === "number" && game.priceDiscountPct > 0;

  if (onSale) {
    return (
      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span
          className="island-mono"
          style={{
            ...islandTagStyle({ color: islandTheme.color.successAccent }),
            fontWeight: 700
          }}
        >
          -{game.priceDiscountPct}%
        </span>
        {typeof game.priceFinalCents === "number" ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: islandTheme.color.textPrimary }}>
            {formatWishlistPrice(game.priceFinalCents)}
          </span>
        ) : null}
      </div>
    );
  }

  if (game.isFree) {
    return (
      <div style={{ marginTop: 6 }}>
        <span className="island-mono" style={islandTagStyle({ color: islandTheme.color.primaryGlow })}>
          Free
        </span>
      </div>
    );
  }

  if (typeof game.priceFinalCents === "number") {
    return (
      <div style={{ marginTop: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: islandTheme.color.textSubtle }}>
          {formatWishlistPrice(game.priceFinalCents)}
        </span>
      </div>
    );
  }

  return null;
}

function HypeBar({ count, scale }: { count: number; scale: number }) {
  const safeScale = Math.max(scale, 1);
  const pct = Math.round(Math.min(100, (count / safeScale) * 100));
  return (
    <div style={{ marginTop: 6 }}>
      <div
        style={{
          height: 6,
          borderRadius: 999,
          background: islandTheme.color.panelMutedBg,
          overflow: "hidden"
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${islandTheme.color.primaryGlow}, ${islandTheme.palette.sandWarmAccent})`
          }}
        />
      </div>
      <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 3 }}>
        {count} crew {count === 1 ? "wants" : "want"} this
      </div>
    </div>
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
        <div className="island-display" style={{ fontSize: 17, fontWeight: 800 }}>
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
        className="island-btn"
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          right: 0,
          top: "44%",
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
          zIndex: 60,
          font: "inherit",
          boxShadow: "-4px 0 14px rgba(0,0,0,0.4)"
        }}
      >
        ● In game · {inGame.length}
      </button>
      <aside
        style={{
          position: "fixed",
          right: 0,
          top: 70,
          bottom: 0,
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
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1)",
          zIndex: 55,
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
                    fontWeight: 800
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
      <h2 className="island-display" style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
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
