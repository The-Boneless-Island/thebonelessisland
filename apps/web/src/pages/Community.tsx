import { useState, useEffect } from "react";
import { apiFetch } from "../api/client.js";
import { IslandCard, islandTagStyle } from "../islandUi.js";
import { NuggieBadge } from "../components/NuggieBadge.js";
import { islandTheme } from "../theme.js";
import type { ActivityEvent, NuggiesLeaderboardEntry, PageId } from "../types.js";

type CommunityPageProps = {
  isAdmin: boolean;
  activityEvents: ActivityEvent[];
  onNavigate: (page: PageId) => void;
};

export function CommunityPage({ isAdmin, activityEvents, onNavigate }: CommunityPageProps) {
  const [nuggiesLeaderboard, setNuggiesLeaderboard] = useState<NuggiesLeaderboardEntry[]>([]);

  useEffect(() => {
    void apiFetch("/nuggies/leaderboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { leaderboard: NuggiesLeaderboardEntry[] } | null) => {
        if (d?.leaderboard) setNuggiesLeaderboard(d.leaderboard.slice(0, 5));
      });
  }, []);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Hero />
      <CrewCarousel isAdmin={isAdmin} onNavigate={onNavigate} />
      <ClipsAndActivityRow events={activityEvents} />
      <ForumsAndClubsRow />
      <EventsAndLeaderboardsRow nuggiesLeaderboard={nuggiesLeaderboard} />
    </div>
  );
}

function Hero() {
  return (
    <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        className="island-mono"
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: islandTheme.color.textMuted
        }}
      >
        ★ Community
      </span>
      <h1 className="island-display" style={{ margin: 0, fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 800 }}>
        Community
      </h1>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: islandTheme.color.textSubtle, maxWidth: 640 }}>
        The crew, the clips, the threads, and the events. Everyone hanging out on the island, all in one place.
      </p>
    </header>
  );
}

type CrewCardData = {
  name: string;
  initials: string;
  color: string;
  status: "online" | "live" | "idle";
  blurb: string;
  presence: string;
  banner: string;
};

const CREW_CARDS: CrewCardData[] = [
  { name: "jkraken", initials: "JK", color: "#22d3ee", status: "online", blurb: "Captain · streams Fri", presence: "Cosmic Cruiser", banner: "linear-gradient(135deg,#1e3a8a,#0f172a)" },
  { name: "aloha-pirate", initials: "AP", color: "#ef8354", status: "live", blurb: "Late-boat regular", presence: "Lethal Company", banner: "linear-gradient(135deg,#7c2d12,#1c1917)" },
  { name: "palmwave", initials: "PW", color: "#86efac", status: "online", blurb: "Cozy crew", presence: "Stardew Valley", banner: "linear-gradient(135deg,#064e3b,#052e16)" },
  { name: "LoreNugget", initials: "LN", color: "#a78bfa", status: "idle", blurb: "Forum lore-keeper", presence: "idle 2h", banner: "linear-gradient(135deg,#4c1d95,#1e1b4b)" },
  { name: "ChefNugget", initials: "CN", color: "#fbbf24", status: "online", blurb: "Co-op cook", presence: "Chef's Kitchen", banner: "linear-gradient(135deg,#9a3412,#431407)" },
  { name: "SpeedyNugget", initials: "SN", color: "#22d3ee", status: "live", blurb: "Speedrunner", presence: "Cosmic Cruiser", banner: "linear-gradient(135deg,#0c4a6e,#082f49)" },
  { name: "ReefTroll", initials: "RT", color: "#94a3b8", status: "idle", blurb: "Salt veteran", presence: "idle 6h", banner: "linear-gradient(135deg,#1e293b,#0f172a)" },
  { name: "dawson", initials: "DA", color: "#f4a261", status: "online", blurb: "Builder", presence: "Outer Wilds", banner: "linear-gradient(135deg,#312e81,#0c4a6e)" }
];

function CrewCarousel({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate: (page: PageId) => void }) {
  const onlineCount = CREW_CARDS.filter((c) => c.status !== "idle").length;
  const liveCount = CREW_CARDS.filter((c) => c.status === "live").length;
  return (
    <section style={{ display: "grid", gap: 12 }}>
      <SectionHead
        title="The crew"
        meta={`${CREW_CARDS.length} islanders · ${onlineCount} online · ${liveCount} streaming.`}
        action="See all islanders →"
      />
      <div
        style={{
          display: "flex",
          gap: 14,
          overflowX: "auto",
          paddingBottom: 8,
          scrollbarWidth: "thin"
        }}
      >
        {CREW_CARDS.map((c) => (
          <CrewCard key={c.name} card={c} isAdmin={isAdmin} onNavigate={onNavigate} />
        ))}
      </div>
    </section>
  );
}

function CrewCard({
  card,
  isAdmin,
  onNavigate
}: {
  card: CrewCardData;
  isAdmin: boolean;
  onNavigate: (page: PageId) => void;
}) {
  const statusColor =
    card.status === "online" ? islandTheme.color.successAccent : card.status === "live" ? islandTheme.color.dangerAccent : islandTheme.color.textMuted;
  return (
    <article
      style={{
        minWidth: 220,
        flexShrink: 0,
        padding: 0,
        overflow: "hidden",
        borderRadius: 14,
        background: islandTheme.color.panelBg,
        backdropFilter: islandTheme.glass.blur,
        WebkitBackdropFilter: islandTheme.glass.blur,
        border: `1px solid ${islandTheme.color.cardBorder}`
      }}
    >
      <div style={{ height: 90, background: card.banner, position: "relative" }}>
        <span
          className="island-mono"
          style={{
            ...islandTagStyle({ color: statusColor }),
            position: "absolute",
            top: 8,
            right: 8,
            gap: 4
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 999, background: statusColor }} />
          {card.status}
        </span>
      </div>
      <div style={{ padding: "0 14px 14px", marginTop: -28, position: "relative" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            background: card.color,
            border: `3px solid ${islandTheme.color.panelMutedBg}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            color: islandTheme.color.textInverted,
            fontSize: 18
          }}
        >
          {card.initials}
        </div>
        <div style={{ fontWeight: 700, marginTop: 8 }}>{card.name}</div>
        <div style={{ fontSize: 11, color: islandTheme.color.textMuted }}>{card.blurb}</div>
        <div
          className="island-mono"
          style={{ fontSize: 11, color: islandTheme.color.primaryGlow, marginTop: 4 }}
        >
          {card.presence}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {isAdmin ? (
            <button
              type="button"
              className="island-btn"
              onClick={() => onNavigate("admin")}
              style={{
                flex: 1,
                background: "transparent",
                border: `1px solid ${islandTheme.color.cardBorder}`,
                color: islandTheme.color.textSubtle,
                padding: "5px 8px",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                font: "inherit"
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: "linear-gradient(135deg,#f59e0b,#d97706)",
                  color: islandTheme.color.textDark,
                  fontSize: 9,
                  fontWeight: 900,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                ★
              </span>
              Admin
            </button>
          ) : null}
          <button
            type="button"
            className="island-btn"
            style={{
              flex: 1,
              background: islandTheme.color.primary,
              border: `1px solid ${islandTheme.color.primary}`,
              color: islandTheme.color.primaryText,
              padding: "5px 8px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              font: "inherit"
            }}
          >
            Profile
          </button>
        </div>
      </div>
    </article>
  );
}

const CLIPS = [
  { title: "kraken bossfight, no deaths", author: "@jkraken", duration: "2:14", art: "🐙", cover: "linear-gradient(135deg,#1e3a8a,#0f172a)" },
  { title: "helix-IV in 47 seconds", author: "@SpeedyNugget", duration: "0:47", art: "🚀", cover: "linear-gradient(135deg,#0c4a6e,#082f49)" },
  { title: "kitchen meltdown lvl 9", author: "@ChefNugget", duration: "1:32", art: "🍳", cover: "linear-gradient(135deg,#7c2d12,#431407)" },
  { title: "V60 moon, full team wipe", author: "@aloha-pirate", duration: "3:08", art: "👻", cover: "linear-gradient(135deg,#064e3b,#052e16)" }
];

const COMMUNITY_ACTOR_COLORS = ["#22d3ee", "#a855f7", "#f4a261", "#86efac", "#fbbf77", "#ef8354", "#4ade80", "#60a5fa"];

function communityColorFor(id: string | null | undefined): string {
  if (!id) return COMMUNITY_ACTOR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COMMUNITY_ACTOR_COLORS[hash % COMMUNITY_ACTOR_COLORS.length];
}

function communityInitialsFor(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function communityRelativeAgo(iso: string): string {
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

type CommunityActivityCopy = { action: string; target: string; detail: string };

function describeCommunityEvent(event: ActivityEvent): CommunityActivityCopy {
  const payload = event.payload as Record<string, unknown>;
  const gameName = event.game?.name ?? null;
  switch (event.eventType) {
    case "game_night.created":
      return {
        action: "scheduled",
        target: typeof payload.title === "string" ? payload.title : "a game night",
        detail: "Hosting the next session"
      };
    case "game_night.rsvp_joined":
      return { action: "RSVP'd to", target: "the next game night", detail: "On the invite list" };
    case "game_night.rsvp_left":
      return { action: "stepped away from", target: "the next game night", detail: "Off the dock for now" };
    case "game_night.game_picked":
      return { action: "picked", target: gameName ?? "a game", detail: "Locked in for the next session" };
    case "steam.linked":
      return { action: "linked", target: "their Steam account", detail: "Library now visible to the crew" };
    case "steam.unlinked":
      return { action: "unlinked", target: "their Steam account", detail: "Library hidden from the crew" };
    case "steam.synced": {
      const synced = typeof payload.syncedGames === "number" ? payload.syncedGames : 0;
      return {
        action: "resynced",
        target: "their library",
        detail: `${synced} game${synced === 1 ? "" : "s"} on the boat`
      };
    }
    default:
      return { action: "fired", target: event.eventType, detail: "Crew activity" };
  }
}

function ClipsAndActivityRow({ events }: { events: ActivityEvent[] }) {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)",
        gap: 16
      }}
    >
      <div>
        <SectionHead title="Recent clips & captures" meta="Crew highlights from this week." action="Open gallery →" />
        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 14
          }}
        >
          {CLIPS.map((c) => (
            <ClipCard key={c.title} clip={c} />
          ))}
        </div>
      </div>
      <div>
        <SectionHead title="Activity feed" meta="What the crew is up to." />
        <IslandCard style={{ padding: 0, overflow: "hidden", marginTop: 12 }}>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {events.length === 0 ? (
              <div style={{ padding: "16px 14px", fontSize: 13, color: islandTheme.color.textMuted, textAlign: "center" }}>
                No island activity yet.
              </div>
            ) : (
              events.slice(0, 20).map((event, i) => (
                <ActivityRow key={event.id} event={event} firstRow={i === 0} />
              ))
            )}
          </div>
        </IslandCard>
      </div>
    </section>
  );
}

function ClipCard({ clip }: { clip: (typeof CLIPS)[number] }) {
  return (
    <article
      style={{
        padding: 0,
        overflow: "hidden",
        borderRadius: 14,
        background: islandTheme.color.panelBg,
        backdropFilter: islandTheme.glass.blur,
        WebkitBackdropFilter: islandTheme.glass.blur,
        border: `1px solid ${islandTheme.color.cardBorder}`
      }}
    >
      <div
        style={{
          height: 130,
          background: clip.cover,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          fontSize: 42
        }}
      >
        {clip.art}
        <span
          className="island-mono"
          style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            background: "rgba(0,0,0,0.7)",
            color: islandTheme.color.textInverted,
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: islandTheme.radius.control
          }}
        >
          {clip.duration}
        </span>
        <span
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 28,
            height: 28,
            borderRadius: 999,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: islandTheme.color.textInverted,
            fontSize: 14
          }}
        >
          ▶
        </span>
      </div>
      <div style={{ padding: "10px 12px" }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{clip.title}</div>
        <div style={{ fontSize: 11, color: islandTheme.color.textMuted, marginTop: 2 }}>{clip.author}</div>
      </div>
    </article>
  );
}

function ActivityRow({ event, firstRow }: { event: ActivityEvent; firstRow: boolean }) {
  const copy = describeCommunityEvent(event);
  const actorName = event.actor?.displayName ?? "A crew member";
  const avatar = event.actor?.avatarUrl ?? null;
  const ago = communityRelativeAgo(event.createdAt);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "36px 1fr auto",
        gap: 12,
        padding: "14px 16px",
        alignItems: "center",
        borderTop: firstRow ? "none" : `1px solid ${islandTheme.color.cardBorder}`
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          background: avatar
            ? `center / cover no-repeat url(${JSON.stringify(avatar)})`
            : communityColorFor(event.actor?.discordUserId ?? null),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          color: islandTheme.color.textInverted,
          fontSize: 12
        }}
      >
        {avatar ? null : communityInitialsFor(actorName)}
      </div>
      <div>
        <div style={{ fontSize: 14 }}>
          <strong>{actorName}</strong> {copy.action} <strong>{copy.target}</strong>
        </div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>{copy.detail}</div>
      </div>
      <div className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted }}>
        {ago}
      </div>
    </div>
  );
}

const FORUMS = [
  { tag: "#general", desc: "Island chatter, what's everyone up to", color: "#22d3ee", count: 418 },
  { tag: "#strategies", desc: "Builds, tips, dirty tricks", color: "#fbbf24", count: 212 },
  { tag: "#stories", desc: "Lore, recap threads, screenshots", color: "#a78bfa", count: 174 },
  { tag: "#late-boat", desc: "After-hours weirdness", color: "#ef4444", count: 89 },
  { tag: "#cozy", desc: "Stardew, Dorfromantik, vibes", color: "#86efac", count: 103 },
  { tag: "#tech", desc: "Setups, mods, troubleshooting", color: "#94a3b8", count: 67 }
];

const CLUBS = [
  { name: "Reef Raiders", blurb: "Deep Sea Dunkers · Sweats", icon: "🌊", color: "#22d3ee", members: 12 },
  { name: "Cozy Coconuts", blurb: "Cozy games · Sun nights", icon: "🥥", color: "#86efac", members: 8 },
  { name: "Late Boat Club", blurb: "Horror co-op · Sat 11pm", icon: "⚓", color: "#ef4444", members: 6 }
];

function ForumsAndClubsRow() {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
        gap: 16
      }}
    >
      <div>
        <SectionHead title="Forums · ~ island chatter" meta="6 channels, 1,063 threads, somehow always something new." action="Open all →" />
        <IslandCard style={{ padding: 0, overflow: "hidden", marginTop: 12 }}>
          {FORUMS.map((f, i) => (
            <ForumRow key={f.tag} entry={f} firstRow={i === 0} />
          ))}
        </IslandCard>
      </div>
      <div>
        <SectionHead title="Clubs" meta="Tighter crews inside the crew." action="All clubs →" />
        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {CLUBS.map((c) => (
            <ClubCard key={c.name} club={c} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ForumRow({ entry, firstRow }: { entry: (typeof FORUMS)[number]; firstRow: boolean }) {
  return (
    <button
      type="button"
      className="island-btn"
      style={{
        display: "grid",
        gridTemplateColumns: "36px 1fr auto",
        gap: 12,
        padding: "12px 14px",
        alignItems: "center",
        borderTop: firstRow ? "none" : `1px solid ${islandTheme.color.cardBorder}`,
        background: "transparent",
        border: "none",
        textAlign: "left",
        width: "100%",
        font: "inherit",
        color: islandTheme.color.textPrimary,
        cursor: "pointer"
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: `${entry.color}33`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          color: entry.color,
          fontSize: 14
        }}
      >
        #
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{entry.tag}</div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>{entry.desc}</div>
      </div>
      <span className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted }}>
        {entry.count} threads
      </span>
    </button>
  );
}

function ClubCard({ club }: { club: (typeof CLUBS)[number] }) {
  return (
    <article
      style={{
        padding: 16,
        borderRadius: 14,
        background: islandTheme.color.panelBg,
        backdropFilter: islandTheme.glass.blur,
        WebkitBackdropFilter: islandTheme.glass.blur,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        display: "flex",
        flexDirection: "column",
        gap: 10
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 10,
            background: `${club.color}33`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22
          }}
        >
          {club.icon}
        </div>
        <div>
          <div className="island-display" style={{ fontWeight: 800, fontSize: 15 }}>
            {club.name}
          </div>
          <div style={{ fontSize: 12, color: islandTheme.color.textMuted }}>{club.blurb}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
        <div style={{ color: islandTheme.color.textMuted }}>{club.members} members</div>
        <a href="#" onClick={(e) => e.preventDefault()} style={{ color: islandTheme.color.primaryGlow, fontWeight: 600, textDecoration: "none" }}>
          View →
        </a>
      </div>
    </article>
  );
}

const EVENTS = [
  { month: "MAY", day: "03", title: "Beach BBQ Tournament", detail: "Deep Sea Dunkers · 4v4 · $500 prize pool", count: "14 signed up" },
  { month: "MAY", day: "10", title: "Speedrun Sunday", detail: "Cosmic Cruiser · Helix-IV any%", count: "8 signed up" },
  { month: "MAY", day: "17", title: "Cozy Game Jam Watch Party", detail: "Stream + chat · 7pm", count: "22 going" }
];

function EventsAndLeaderboardsRow({ nuggiesLeaderboard }: { nuggiesLeaderboard: NuggiesLeaderboardEntry[] }) {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: 16
      }}
    >
      <div>
        <SectionHead title="Upcoming events" meta="Tournaments, watch parties, jams." action="Calendar →" />
        <IslandCard style={{ padding: 0, overflow: "hidden", marginTop: 12 }}>
          {EVENTS.map((e, i) => (
            <EventRow key={e.day + e.title} entry={e} firstRow={i === 0} />
          ))}
        </IslandCard>
      </div>
      <div>
        <SectionHead title="Nuggies · top islanders" meta="Most Nuggies earned on the island." action="Full leaderboard →" />
        <IslandCard style={{ padding: 0, overflow: "hidden", marginTop: 12 }}>
          {nuggiesLeaderboard.length === 0 ? (
            <div style={{ padding: "16px 14px", fontSize: 13, color: islandTheme.color.textMuted, textAlign: "center" }}>
              Leaderboard loading…
            </div>
          ) : (
            nuggiesLeaderboard.map((entry, i) => (
              <NuggiesLeaderRow key={entry.discordUserId} entry={entry} firstRow={i === 0} />
            ))
          )}
        </IslandCard>
      </div>
    </section>
  );
}

function EventRow({ entry, firstRow }: { entry: (typeof EVENTS)[number]; firstRow: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "64px 1fr auto",
        gap: 14,
        padding: "14px 16px",
        alignItems: "center",
        borderTop: firstRow ? "none" : `1px solid ${islandTheme.color.cardBorder}`
      }}
    >
      <div
        style={{
          textAlign: "center",
          padding: "8px 0",
          borderRadius: 8,
          background: "rgba(244, 162, 97, 0.18)",
          border: "1px solid rgba(244, 162, 97, 0.4)"
        }}
      >
        <div
          className="island-mono"
          style={{
            fontSize: 9,
            color: islandTheme.palette.sandWarmAccent,
            letterSpacing: "0.1em"
          }}
        >
          {entry.month}
        </div>
        <div className="island-display" style={{ fontWeight: 800, fontSize: 18 }}>
          {entry.day}
        </div>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{entry.title}</div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>{entry.detail}</div>
        <div className="island-mono" style={{ fontSize: 11, color: islandTheme.color.primaryGlow, marginTop: 4 }}>
          {entry.count}
        </div>
      </div>
      <button
        type="button"
        className="island-btn"
        style={{
          background: islandTheme.color.primary,
          border: `1px solid ${islandTheme.color.primary}`,
          color: islandTheme.color.primaryText,
          fontSize: 11,
          padding: "6px 12px",
          borderRadius: 999,
          fontWeight: 700,
          cursor: "pointer",
          font: "inherit"
        }}
      >
        RSVP
      </button>
    </div>
  );
}

function NuggiesLeaderRow({ entry, firstRow }: { entry: NuggiesLeaderboardEntry; firstRow: boolean }) {
  const rankLabel = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `#${entry.rank}`;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "36px 36px 1fr auto",
        gap: 12,
        padding: "12px 14px",
        alignItems: "center",
        borderTop: firstRow ? "none" : `1px solid ${islandTheme.color.cardBorder}`
      }}
    >
      <div
        className="island-display"
        style={{
          fontWeight: 800,
          fontSize: 18,
          textAlign: "center",
          color: entry.rank <= 3 ? islandTheme.palette.sandWarmAccent : islandTheme.color.textMuted
        }}
      >
        {rankLabel}
      </div>
      {entry.avatarUrl ? (
        <img src={entry.avatarUrl} alt="" width={36} height={36} style={{ borderRadius: 999 }} />
      ) : (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            background: islandTheme.color.panelMutedBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            color: islandTheme.color.textMuted,
            fontSize: 12
          }}
        >
          {entry.username.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{entry.username}</div>
        {entry.equippedTitle && (
          <div style={{ marginTop: 2 }}>
            <NuggieBadge item={{ ...entry.equippedTitle, itemType: entry.equippedTitle.itemType as "title" | "flair" | "badge" }} size="sm" />
          </div>
        )}
      </div>
      <span
        className="island-mono"
        style={{ fontWeight: 700, fontSize: 13, color: islandTheme.palette.sandWarmAccent }}
      >
        ₦{entry.balance.toLocaleString()}
      </span>
    </div>
  );
}

function SectionHead({ title, meta, action }: { title: string; meta: string; action?: string }) {
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
        <h2 className="island-display" style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
          {title}
        </h2>
        <div
          className="island-mono"
          style={{
            marginTop: 4,
            fontSize: 11,
            color: islandTheme.color.textMuted,
            textTransform: "uppercase",
            letterSpacing: "0.06em"
          }}
        >
          {meta}
        </div>
      </div>
      {action ? (
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          style={{
            color: islandTheme.color.primaryGlow,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none"
          }}
        >
          {action}
        </a>
      ) : null}
    </div>
  );
}

