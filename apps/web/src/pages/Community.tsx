import { useState, useEffect, memo } from "react";
import { Link, useNavigate } from "react-router";
import { apiFetch } from "../api/client.js";
import { IslandCard, IslandSkeletonRow, accentHex, islandTagStyle } from "../islandUi.js";
import { NuggieBadge } from "../components/NuggieBadge.js";
import { islandTheme } from "../theme.js";
import { activityHref, pathForIslander } from "../lib/routes.js";
import type { ActivityActor, ActivityEvent, GameNight, GuildMember, NuggiesLeaderboardEntry, PageId } from "../types.js";

type CommunityPageProps = {
  isAdmin: boolean;
  activityEvents: ActivityEvent[];
  guildMembers: GuildMember[];
  gameNights: GameNight[];
  onNavigate: (page: PageId) => void;
  openProfile: (discordUserId: string) => void;
};

type ForumCategory = {
  id: number;
  slug: string;
  name: string;
  description: string;
  accentColor: string;
  threadCount: number;
  lastActivity: {
    threadId: number;
    threadTitle: string | null;
    at: string | null;
    userDisplayName: string | null;
  } | null;
};

function CommunityPageInner({ isAdmin, activityEvents, guildMembers, gameNights, onNavigate, openProfile }: CommunityPageProps) {
  const [nuggiesLeaderboard, setNuggiesLeaderboard] = useState<NuggiesLeaderboardEntry[]>([]);
  const [forums, setForums] = useState<ForumCategory[] | null>(null);

  useEffect(() => {
    void apiFetch("/nuggies/leaderboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { leaderboard: NuggiesLeaderboardEntry[] } | null) => {
        if (d?.leaderboard) setNuggiesLeaderboard(d.leaderboard.slice(0, 5));
      });
  }, []);

  useEffect(() => {
    void apiFetch("/forums/categories")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { categories: ForumCategory[] } | null) => {
        setForums(d?.categories ?? []);
      })
      .catch(() => setForums([]));
  }, []);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Hero />
      <CrewCarousel members={guildMembers} isAdmin={isAdmin} onNavigate={onNavigate} openProfile={openProfile} />
      <ActivitySection events={activityEvents} />
      <ForumsRow forums={forums} onNavigate={onNavigate} />
      <EventsAndLeaderboardsRow gameNights={gameNights} nuggiesLeaderboard={nuggiesLeaderboard} onNavigate={onNavigate} />
    </div>
  );
}

export const CommunityPage = memo(CommunityPageInner);

function Hero() {
  return (
    <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        className="island-mono"
        style={{
          fontSize: 12,
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
        The crew, the threads, and the game nights. Everyone hanging out on the island, all in one place.
      </p>
    </header>
  );
}

function memberStatus(m: GuildMember): { label: string; color: string } {
  if (m.inVoice) return { label: "live", color: islandTheme.color.dangerAccent };
  if (m.presenceStatus === "online") return { label: "online", color: islandTheme.color.successAccent };
  if (m.presenceStatus === "idle") return { label: "idle", color: islandTheme.palette.sandWarmAccent };
  if (m.presenceStatus === "dnd") return { label: "dnd", color: islandTheme.color.dangerAccent };
  return { label: "offline", color: islandTheme.color.textMuted };
}

function memberPresenceText(m: GuildMember): string {
  if (m.richPresenceText) return m.richPresenceText;
  if (m.inVoice) return "In voice";
  if (m.presenceStatus === "online") return "Online";
  if (m.presenceStatus === "idle") return "Idle";
  if (m.presenceStatus === "dnd") return "Do not disturb";
  return "Offline";
}

function CrewCarousel({
  members,
  isAdmin,
  onNavigate,
  openProfile
}: {
  members: GuildMember[];
  isAdmin: boolean;
  onNavigate: (page: PageId) => void;
  openProfile: (discordUserId: string) => void;
}) {
  const onlineCount = members.filter(
    (m) => m.inVoice || m.presenceStatus === "online" || m.presenceStatus === "idle" || m.presenceStatus === "dnd"
  ).length;
  const liveCount = members.filter((m) => m.inVoice).length;
  return (
    <section style={{ display: "grid", gap: 12 }}>
      <SectionHead
        title="The crew"
        meta={`${members.length} islanders · ${onlineCount} online · ${liveCount} in voice.`}
      />
      {members.length === 0 ? (
        <IslandCard style={{ padding: "16px 14px", textAlign: "center", fontSize: 13, color: islandTheme.color.textMuted }}>
          No islanders synced yet.
        </IslandCard>
      ) : (
        <div
          style={{
            display: "flex",
            gap: 14,
            overflowX: "auto",
            paddingBottom: 8,
            scrollbarWidth: "thin"
          }}
        >
          {members.map((m) => (
            <CrewCard key={m.discordUserId} member={m} isAdmin={isAdmin} onNavigate={onNavigate} openProfile={openProfile} />
          ))}
        </div>
      )}
    </section>
  );
}

function CrewCard({
  member,
  isAdmin,
  onNavigate,
  openProfile
}: {
  member: GuildMember;
  isAdmin: boolean;
  onNavigate: (page: PageId) => void;
  openProfile: (discordUserId: string) => void;
}) {
  const status = memberStatus(member);
  const color = communityColorFor(member.discordUserId);
  // Real Discord banner > accent-color gradient > hashed-color gradient. The
  // banner makes member cards personal instead of eight identical tints.
  const accent = accentHex(member.accentColor);
  const bannerBackground = member.bannerUrl
    ? `url("${member.bannerUrl}") center/cover`
    : accent
      ? `linear-gradient(135deg, ${accent}88, ${islandTheme.color.panelMutedBg})`
      : `linear-gradient(135deg, ${color}55, ${islandTheme.color.panelMutedBg})`;
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
      <div style={{ height: 90, background: bannerBackground, position: "relative" }}>
        <span
          className="island-mono"
          style={{
            ...islandTagStyle({ color: status.color }),
            position: "absolute",
            top: 8,
            right: 8,
            gap: 4
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 999, background: status.color }} />
          {status.label}
        </span>
      </div>
      <div style={{ padding: "0 14px 14px", marginTop: -28, position: "relative" }}>
        {member.avatarUrl ? (
          <img
            src={member.avatarUrl}
            alt=""
            width={56}
            height={56}
            style={{
              borderRadius: 999,
              border: `3px solid ${islandTheme.color.panelMutedBg}`,
              objectFit: "cover",
              display: "block"
            }}
          />
        ) : (
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 999,
              background: color,
              border: `3px solid ${islandTheme.color.panelMutedBg}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              color: islandTheme.color.textInverted,
              fontSize: 18
            }}
          >
            {communityInitialsFor(member.displayName)}
          </div>
        )}
        <div style={{ fontWeight: 700, marginTop: 8 }}>{member.displayName}</div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted }}>@{member.username}</div>
        <div
          className="island-mono"
          style={{ fontSize: 12, color: islandTheme.color.primaryGlow, marginTop: 4 }}
        >
          {memberPresenceText(member)}
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
                fontSize: 12,
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
                  background: islandTheme.gradient.crownAmber,
                  color: islandTheme.color.textDark,
                  fontSize: 12,
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
            onClick={() => openProfile(member.discordUserId)}
            style={{
              flex: 1,
              background: islandTheme.color.panelMutedBg,
              border: `1px solid ${islandTheme.color.cardBorder}`,
              color: islandTheme.color.textSubtle,
              padding: "5px 8px",
              borderRadius: 999,
              fontSize: 12,
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

const COMMUNITY_ACTOR_COLORS = islandTheme.categorical.avatars;

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

function communityCasinoLabel(game: string): string {
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
    case "achievement.steam_progress": {
      const delta = typeof payload.unlockedDelta === "number" ? payload.unlockedDelta : 0;
      const game = typeof payload.gameName === "string" ? payload.gameName : gameName ?? "a game";
      return {
        action: "unlocked",
        target: `${delta} achievement${delta === 1 ? "" : "s"} in ${game}`,
        detail: "Steam progress on the island"
      };
    }
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
    case "forum_thread_created":
      return {
        action: "started",
        target: typeof payload.title === "string" ? payload.title : "a new thread",
        detail: "New forum thread"
      };
    case "forum_reply_created":
      return {
        action: "replied to",
        target: typeof payload.threadTitle === "string" ? payload.threadTitle : "a thread",
        detail: "Forum reply"
      };
    case "news.card_published":
      return {
        action: "posted",
        target: typeof payload.title === "string" ? payload.title : "an update",
        detail: "Drift log"
      };
    case "forum.reactions_milestone": {
      const count = typeof payload.count === "number" ? payload.count : 0;
      return {
        action: "earned",
        target: `${count} reactions`,
        detail: typeof payload.threadTitle === "string" ? payload.threadTitle : "A popular post"
      };
    }
    case "member.joined":
      return { action: "joined", target: "the crew", detail: "New islander 🌴 — welcome aboard" };
    case "nuggies.daily_claimed": {
      const amount = typeof payload.amount === "number" ? payload.amount : 0;
      return { action: "claimed their daily", target: `₦${amount.toLocaleString()}`, detail: "Daily Nuggies" };
    }
    case "casino.big_win": {
      const net = typeof payload.net === "number" ? payload.net : 0;
      const g = typeof payload.game === "string" ? payload.game : "the casino";
      return { action: "won big at", target: communityCasinoLabel(g), detail: `+₦${net.toLocaleString()}` };
    }
    case "nuggies.loan_accepted": {
      const principal = typeof payload.principal === "number" ? payload.principal : 0;
      return { action: "took a loan of", target: `₦${principal.toLocaleString()}`, detail: "Loan accepted" };
    }
    case "nuggies.loan_repaid": {
      const amount = typeof payload.amount === "number" ? payload.amount : 0;
      return { action: "repaid", target: `₦${amount.toLocaleString()}`, detail: "Loan repaid" };
    }
    default:
      return { action: "fired", target: event.eventType, detail: "Crew activity" };
  }
}

function ActivitySection({ events }: { events: ActivityEvent[] }) {
  return (
    <section>
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
    </section>
  );
}

function CommunityActorName({ actor }: { actor: ActivityActor | null }) {
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

function ActivityRow({ event, firstRow }: { event: ActivityEvent; firstRow: boolean }) {
  const navigate = useNavigate();
  const copy = describeCommunityEvent(event);
  const actorName = event.actor?.displayName ?? "A crew member";
  const actorId = event.actor?.discordUserId ?? null;
  const avatar = event.actor?.avatarUrl ?? null;
  const ago = communityRelativeAgo(event.createdAt);
  const href = activityHref(event);
  const avatarCircle = (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        background: avatar
          ? `center / cover no-repeat url(${JSON.stringify(avatar)})`
          : communityColorFor(actorId),
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
  );
  return (
    <div
      onClick={href ? () => navigate(href) : undefined}
      role={href ? "link" : undefined}
      tabIndex={href ? 0 : undefined}
      aria-label={href ? "View details for this activity" : undefined}
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
      onMouseLeave={href ? (e) => (e.currentTarget.style.background = "transparent") : undefined}
      style={{
        display: "grid",
        gridTemplateColumns: "36px 1fr auto",
        gap: 12,
        padding: "14px 16px",
        alignItems: "center",
        borderTop: firstRow ? "none" : `1px solid ${islandTheme.color.cardBorder}`,
        cursor: href ? "pointer" : "default",
        background: "transparent",
        transition: "background 140ms ease"
      }}
    >
      {actorId ? (
        <Link
          to={pathForIslander(actorId)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`${actorName} profile`}
          style={{ display: "block", borderRadius: 999, textDecoration: "none" }}
        >
          {avatarCircle}
        </Link>
      ) : (
        avatarCircle
      )}
      <div>
        <div style={{ fontSize: 14 }}>
          <CommunityActorName actor={event.actor} /> {copy.action} <strong>{copy.target}</strong>
        </div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>{copy.detail}</div>
      </div>
      <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
        {ago}
      </div>
    </div>
  );
}

function ForumsRow({ forums, onNavigate }: { forums: ForumCategory[] | null; onNavigate: (page: PageId) => void }) {
  const threadTotal = forums ? forums.reduce((sum, f) => sum + f.threadCount, 0) : 0;
  const meta =
    forums === null
      ? "Loading channels…"
      : `${forums.length} channel${forums.length === 1 ? "" : "s"}, ${threadTotal} thread${threadTotal === 1 ? "" : "s"} on the island.`;
  return (
    <section>
      <SectionHead title="Forums · ~ island chatter" meta={meta} action="Open all →" onAction={() => onNavigate("community-forums")} />
      <IslandCard style={{ padding: 0, overflow: "hidden", marginTop: 12 }}>
        {forums === null ? (
          <div style={{ padding: "16px 14px", fontSize: 13, color: islandTheme.color.textMuted, textAlign: "center" }}>
            Loading channels…
          </div>
        ) : forums.length === 0 ? (
          <div style={{ padding: "16px 14px", fontSize: 13, color: islandTheme.color.textMuted, textAlign: "center" }}>
            No forum channels yet.
          </div>
        ) : (
          forums.map((f, i) => (
            <ForumRow key={f.id} entry={f} firstRow={i === 0} onOpen={() => onNavigate("community-forums")} />
          ))
        )}
      </IslandCard>
    </section>
  );
}

function ForumRow({ entry, firstRow, onOpen }: { entry: ForumCategory; firstRow: boolean; onOpen: () => void }) {
  const accent = entry.accentColor || islandTheme.color.primaryGlow;
  const lastBits = entry.lastActivity
    ? [entry.lastActivity.userDisplayName, entry.lastActivity.at ? communityRelativeAgo(entry.lastActivity.at) : null]
        .filter(Boolean)
        .join(" · ")
    : null;
  return (
    <button
      type="button"
      className="island-btn"
      onClick={onOpen}
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
          background: `${accent}33`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          color: accent,
          fontSize: 14
        }}
      >
        #
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{entry.name}</div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>
          {entry.lastActivity?.threadTitle ?? entry.description ?? "No threads yet"}
        </div>
        {lastBits ? (
          <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>
            {lastBits}
          </div>
        ) : null}
      </div>
      <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
        {entry.threadCount} thread{entry.threadCount === 1 ? "" : "s"}
      </span>
    </button>
  );
}

function EventsAndLeaderboardsRow({
  gameNights,
  nuggiesLeaderboard,
  onNavigate
}: {
  gameNights: GameNight[];
  nuggiesLeaderboard: NuggiesLeaderboardEntry[];
  onNavigate: (page: PageId) => void;
}) {
  const upcoming = [...gameNights]
    .filter((n) => {
      const t = new Date(n.scheduledFor).getTime();
      return !Number.isFinite(t) || t >= Date.now() - 6 * 60 * 60 * 1000;
    })
    .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())
    .slice(0, 5);
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: 16
      }}
    >
      <div>
        <SectionHead title="Upcoming game nights" meta="Sessions on the calendar." action="Games →" onAction={() => onNavigate("games")} />
        <IslandCard style={{ padding: 0, overflow: "hidden", marginTop: 12 }}>
          {upcoming.length === 0 ? (
            <div style={{ padding: "16px 14px", fontSize: 13, color: islandTheme.color.textMuted, textAlign: "center" }}>
              No game nights scheduled yet.
            </div>
          ) : (
            upcoming.map((night, i) => <EventRow key={night.id} night={night} firstRow={i === 0} />)
          )}
        </IslandCard>
      </div>
      <div>
        <SectionHead title="Nuggies · top islanders" meta="Most Nuggies earned on the island." action="Full leaderboard →" onAction={() => onNavigate("community-leaderboard")} />
        <IslandCard style={{ padding: 0, overflow: "hidden", marginTop: 12 }}>
          {nuggiesLeaderboard.length === 0 ? (
            <div style={{ display: "grid", gap: 12, padding: "14px 16px" }} aria-busy="true" aria-label="Loading leaderboard">
              <IslandSkeletonRow />
              <IslandSkeletonRow />
              <IslandSkeletonRow />
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

function nightDateTile(iso: string): { month: string; day: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { month: "TBD", day: "--" };
  return {
    month: d.toLocaleString([], { month: "short" }).toUpperCase(),
    day: d.toLocaleString([], { day: "2-digit" })
  };
}

function nightTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Time TBD";
  return d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function EventRow({ night, firstRow }: { night: GameNight; firstRow: boolean }) {
  const tile = nightDateTile(night.scheduledFor);
  const detail = night.selectedGameName
    ? `${nightTimeLabel(night.scheduledFor)} · ${night.selectedGameName}`
    : `${nightTimeLabel(night.scheduledFor)} · Host hasn't picked yet`;
  const attending = night.currentUserAttending;
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
            fontSize: 12,
            color: islandTheme.palette.sandWarmAccent,
            letterSpacing: "0.1em"
          }}
        >
          {tile.month}
        </div>
        <div className="island-display" style={{ fontWeight: 800, fontSize: 18 }}>
          {tile.day}
        </div>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{night.title}</div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>{detail}</div>
        <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.primaryGlow, marginTop: 4 }}>
          {night.attendeeCount} crew {night.attendeeCount === 1 ? "is" : "are"} in
        </div>
      </div>
      <span
        className="island-mono"
        style={{
          ...islandTagStyle({ color: attending ? islandTheme.color.successAccent : islandTheme.color.textMuted }),
          fontSize: 12
        }}
      >
        {attending ? "You're in" : "Not joined"}
      </span>
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

function SectionHead({ title, meta, action, onAction }: { title: string; meta: string; action?: string; onAction?: () => void }) {
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
            fontSize: 12,
            color: islandTheme.color.textMuted,
            textTransform: "uppercase",
            letterSpacing: "0.06em"
          }}
        >
          {meta}
        </div>
      </div>
      {action ? (
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
            cursor: onAction ? "pointer" : "default",
            font: "inherit"
          }}
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}

