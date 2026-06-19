import { memo, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/client.js";
import { IslandCard, IslandTag } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import type { PageId } from "../types.js";

type CrewAchievementMember = {
  discordUserId: string;
  displayName: string;
  avatarUrl: string | null;
  unlocked: number;
  total: number;
  completionPct: number;
};

type CrewAchievementGame = {
  appId: number;
  name: string;
  headerImageUrl: string | null;
  crewUnlocked: number;
  crewTotal: number;
  members: CrewAchievementMember[];
};

type CrewAchievementsPageProps = {
  onNavigate: (page: PageId) => void;
};

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function memberColor(seed: string): string {
  const palette = islandTheme.categorical.avatars;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function memberInitials(name: string): string {
  return (name || "??").trim().slice(0, 2).toUpperCase();
}

function CrewAchievementsPageImpl({ onNavigate }: CrewAchievementsPageProps) {
  const [games, setGames] = useState<CrewAchievementGame[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await apiFetch("/steam/crew-achievements");
        if (!active) return;
        if (!res.ok) {
          setErrored(true);
          setGames([]);
          return;
        }
        const body = (await res.json().catch(() => null)) as { games?: CrewAchievementGame[] } | null;
        if (!active) return;
        setGames(Array.isArray(body?.games) ? body.games : []);
      } catch {
        if (active) {
          setErrored(true);
          setGames([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const totals = useMemo(() => {
    if (!games || games.length === 0) return null;
    const crewUnlocked = games.reduce((sum, g) => sum + g.crewUnlocked, 0);
    const crewTotal = games.reduce((sum, g) => sum + g.crewTotal, 0);
    const completed = games.filter((g) => g.crewTotal > 0 && g.crewUnlocked >= g.crewTotal).length;
    return { games: games.length, crewUnlocked, crewTotal, completed };
  }, [games]);

  return (
    <div style={{ display: "grid", gap: 18 }}>
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
          ★ Community · Crew Achievements
        </span>
        <h1 className="island-display" style={{ margin: 0, fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 800 }}>
          Crew achievements
        </h1>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: islandTheme.color.textSubtle, maxWidth: 640 }}>
          Where the crew stands on Steam achievements — who's chasing the platinum, who's stuck on the last few, and
          which games the island has fully cleared.
        </p>
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
          ← Back to Community
        </button>
      </header>

      {totals && (
        <IslandCard style={{ padding: 12, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
          <SummaryStat label="Games tracked" value={totals.games.toLocaleString()} />
          <SummaryStat
            label="Crew unlocks"
            value={`${totals.crewUnlocked.toLocaleString()} / ${totals.crewTotal.toLocaleString()}`}
          />
          <SummaryStat label="100% club" value={totals.completed.toLocaleString()} accent />
        </IslandCard>
      )}

      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: islandTheme.color.textMuted }}>
          Loading crew achievements…
        </div>
      ) : errored ? (
        <IslandCard style={{ padding: 22, textAlign: "center", color: islandTheme.color.textMuted, fontSize: 13 }}>
          Couldn't load crew achievements right now. Try again in a bit.
        </IslandCard>
      ) : !games || games.length === 0 ? (
        <IslandCard style={{ padding: 28, textAlign: "center", display: "grid", gap: 8, justifyItems: "center" }}>
          <span style={{ fontSize: 34 }} aria-hidden="true">
            🏆
          </span>
          <div style={{ fontWeight: 700, fontSize: 16, color: islandTheme.color.textPrimary }}>
            No crew achievement data yet
          </div>
          <div style={{ fontSize: 13, color: islandTheme.color.textMuted, maxWidth: 420, lineHeight: 1.5 }}>
            Link Steam and play something with achievements — once the crew earns its first unlocks, the leaderboards
            light up here.
          </div>
        </IslandCard>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {games.map((game) => (
            <GameCard key={game.appId} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <span
        className="island-mono"
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: islandTheme.color.textMuted
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: accent ? islandTheme.color.successAccent : islandTheme.color.textPrimary
        }}
      >
        {value}
      </span>
    </div>
  );
}

function GameCard({ game }: { game: CrewAchievementGame }) {
  const crewPct = game.crewTotal > 0 ? clampPct((game.crewUnlocked / game.crewTotal) * 100) : 0;
  const fullyCleared = game.crewTotal > 0 && game.crewUnlocked >= game.crewTotal;

  const members = useMemo(
    () => game.members.slice().sort((a, b) => b.completionPct - a.completionPct),
    [game.members]
  );

  // "Closest race": the highest-progress member who hasn't yet maxed the game.
  const closestRace = useMemo(() => {
    const inProgress = members.filter((m) => m.total > 0 && m.completionPct < 100);
    if (inProgress.length === 0) return null;
    return inProgress[0];
  }, [members]);

  const hundredClub = members.filter((m) => m.total > 0 && m.completionPct >= 100);

  return (
    <IslandCard style={{ padding: 0, overflow: "hidden", display: "grid", gap: 0 }}>
      <div style={{ display: "flex", gap: 14, padding: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div
          style={{
            width: 132,
            height: 62,
            borderRadius: 8,
            flexShrink: 0,
            border: `1px solid ${islandTheme.color.cardBorder}`,
            background: game.headerImageUrl
              ? `url("${game.headerImageUrl}") center/cover`
              : islandTheme.gradient.gameArtFallback,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            color: islandTheme.color.textSubtle
          }}
        >
          {game.headerImageUrl ? "" : "🎮"}
        </div>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: islandTheme.color.textPrimary }}>{game.name}</span>
            {fullyCleared ? (
              <IslandTag tone="success">★ 100% CLUB</IslandTag>
            ) : closestRace ? (
              <IslandTag tone="warning">CLOSEST {clampPct(closestRace.completionPct)}%</IslandTag>
            ) : null}
          </div>
          <div style={{ marginTop: 8 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
                color: islandTheme.color.textMuted,
                marginBottom: 4
              }}
            >
              <span className="island-mono">Crew progress</span>
              <span className="island-mono">
                {game.crewUnlocked.toLocaleString()} / {game.crewTotal.toLocaleString()} · {crewPct}%
              </span>
            </div>
            <ProgressBar pct={crewPct} cleared={fullyCleared} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.open(`https://store.steampowered.com/app/${game.appId}`, "_blank", "noopener")}
          className="island-btn island-mono"
          style={{
            background: "transparent",
            border: `1px solid ${islandTheme.color.cardBorder}`,
            color: islandTheme.color.textSubtle,
            padding: "5px 10px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            font: "inherit",
            flexShrink: 0
          }}
        >
          STORE
        </button>
      </div>

      <div
        style={{
          borderTop: `1px solid ${islandTheme.color.cardBorder}`,
          background: islandTheme.color.panelMutedBg,
          padding: "10px 14px",
          display: "grid",
          gap: 6
        }}
      >
        {hundredClub.length > 0 && (
          <div style={{ fontSize: 12, color: islandTheme.color.successAccent, fontWeight: 700 }}>
            {hundredClub.length === 1
              ? `${hundredClub[0].displayName} cleared every achievement 🏆`
              : `${hundredClub.length} crew members at 100% 🏆`}
          </div>
        )}
        {members.map((member) => (
          <MemberRow key={member.discordUserId} member={member} />
        ))}
      </div>
    </IslandCard>
  );
}

function MemberRow({ member }: { member: CrewAchievementMember }) {
  const pct = clampPct(member.completionPct);
  const maxed = member.total > 0 && pct >= 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {member.avatarUrl ? (
        <img
          src={member.avatarUrl}
          alt={member.displayName}
          title={member.displayName}
          width={24}
          height={24}
          style={{ borderRadius: 999, flexShrink: 0, objectFit: "cover", border: `1px solid ${islandTheme.color.border}` }}
        />
      ) : (
        <span
          title={member.displayName}
          style={{
            width: 24,
            height: 24,
            borderRadius: 999,
            flexShrink: 0,
            background: memberColor(member.discordUserId || member.displayName),
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            color: islandTheme.color.textDark,
            fontSize: 12
          }}
        >
          {memberInitials(member.displayName)}
        </span>
      )}
      <span
        style={{
          flex: "0 1 140px",
          minWidth: 0,
          fontSize: 13,
          fontWeight: 600,
          color: islandTheme.color.textSecondary,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}
      >
        {member.displayName}
        {maxed ? " ✓" : ""}
      </span>
      <div style={{ flex: "1 1 auto", minWidth: 60 }}>
        <ProgressBar pct={pct} cleared={maxed} thin />
      </div>
      <span
        className="island-mono"
        style={{
          flexShrink: 0,
          width: 78,
          textAlign: "right",
          fontSize: 12,
          color: maxed ? islandTheme.color.successAccent : islandTheme.color.textMuted
        }}
      >
        {member.unlocked.toLocaleString()}/{member.total.toLocaleString()} · {pct}%
      </span>
    </div>
  );
}

function ProgressBar({ pct, cleared, thin }: { pct: number; cleared?: boolean; thin?: boolean }) {
  return (
    <div
      style={{
        height: thin ? 6 : 8,
        borderRadius: 999,
        background: islandTheme.color.panelMutedBg,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        overflow: "hidden"
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          borderRadius: 999,
          background: cleared
            ? islandTheme.gradient.progressDone
            : islandTheme.gradient.progressActive,
          transition: "width 600ms ease"
        }}
      />
    </div>
  );
}

const CrewAchievementsPage = memo(CrewAchievementsPageImpl);
export default CrewAchievementsPage;
