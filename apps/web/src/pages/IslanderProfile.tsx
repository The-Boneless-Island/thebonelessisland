import { memo, useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";
import { IslandCard, IslandTag } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import type { PageId } from "../types.js";

type ProfileTopGame = {
  appId: number;
  name: string;
  headerImageUrl: string | null;
  playtimeForever: number;
  playtime2Weeks: number;
};

type ProfileActivity = {
  eventType: string;
  createdAt: string;
  summary: string;
};

type ProfileShowcase = {
  appId: number;
  name: string;
  completionPct: number;
};

type IslanderProfile = {
  discordUserId: string;
  displayName: string;
  avatarUrl: string | null;
  presence: {
    status: string | null;
    inVoice: boolean;
    richPresenceText: string | null;
  };
  steamLinked: boolean;
  steamHidden: boolean;
  topGames: ProfileTopGame[];
  recentActivity: ProfileActivity[];
  nuggies: {
    balance: number;
    tier: string | null;
    equippedTitle: string | null;
  };
  achievements: {
    totalUnlocked: number;
    showcase: ProfileShowcase[];
  };
};

type IslanderProfilePageProps = {
  targetDiscordUserId: string | null;
  onNavigate: (page: PageId) => void;
};

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatHours(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0h";
  const hours = minutes / 60;
  if (hours < 1) return `${Math.round(minutes)}m`;
  return `${Math.round(hours).toLocaleString()}h`;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "";
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function memberColor(seed: string): string {
  const palette = ["#fbbf77", "#22d3ee", "#a855f7", "#4ade80", "#ef8354", "#86efac", "#facc15", "#f472b6"];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function memberInitials(name: string): string {
  return (name || "??").trim().slice(0, 2).toUpperCase();
}

function presenceTone(status: string | null): "success" | "warning" | "default" {
  const s = (status ?? "").toLowerCase();
  if (s === "online") return "success";
  if (s === "idle" || s === "dnd") return "warning";
  return "default";
}

function IslanderProfilePageImpl({ targetDiscordUserId, onNavigate }: IslanderProfilePageProps) {
  const [profile, setProfile] = useState<IslanderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!targetDiscordUserId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setErrored(false);
    setProfile(null);
    void (async () => {
      try {
        const res = await apiFetch(`/members/${encodeURIComponent(targetDiscordUserId)}/profile`);
        if (!active) return;
        if (!res.ok) {
          setErrored(true);
          return;
        }
        const body = (await res.json().catch(() => null)) as IslanderProfile | null;
        if (!active) return;
        if (!body) {
          setErrored(true);
          return;
        }
        setProfile(body);
      } catch {
        if (active) setErrored(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [targetDiscordUserId]);

  const backButton = (
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
  );

  if (!targetDiscordUserId) {
    return (
      <div style={{ display: "grid", gap: 18 }}>
        <IslandCard style={{ padding: 28, textAlign: "center", display: "grid", gap: 8, justifyItems: "center" }}>
          <span style={{ fontSize: 34 }} aria-hidden="true">
            🧭
          </span>
          <div style={{ fontWeight: 700, fontSize: 16, color: islandTheme.color.textPrimary }}>
            No islander selected
          </div>
          <div style={{ fontSize: 13, color: islandTheme.color.textMuted, maxWidth: 420, lineHeight: 1.5 }}>
            Pick a crew member from Community to chart their shore.
          </div>
          <button
            type="button"
            className="island-btn"
            onClick={() => onNavigate("community")}
            style={{
              marginTop: 4,
              background: "transparent",
              border: "none",
              color: islandTheme.color.primaryGlow,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              font: "inherit"
            }}
          >
            ← Go to Community
          </button>
        </IslandCard>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 18 }}>
        <div style={{ padding: 32, textAlign: "center", color: islandTheme.color.textMuted }}>
          Charting this islander…
        </div>
      </div>
    );
  }

  if (errored || !profile) {
    return (
      <div style={{ display: "grid", gap: 18 }}>
        <IslandCard style={{ padding: 22, textAlign: "center", color: islandTheme.color.textMuted, fontSize: 13 }}>
          Couldn't chart this islander right now. Try again in a bit.
        </IslandCard>
        {backButton}
      </div>
    );
  }

  const { presence, nuggies, achievements } = profile;

  return (
    <div style={{ display: "grid", gap: 18 }}>
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
          ★ Community · Islander
        </span>
        {backButton}
      </header>

      <IslandCard style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        {profile.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt={profile.displayName}
            style={{
              width: 72,
              height: 72,
              borderRadius: 999,
              flexShrink: 0,
              objectFit: "cover",
              border: `2px solid ${islandTheme.color.cardBorder}`
            }}
          />
        ) : (
          <span
            style={{
              width: 72,
              height: 72,
              borderRadius: 999,
              flexShrink: 0,
              background: memberColor(profile.discordUserId || profile.displayName),
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              color: islandTheme.color.textDark,
              fontSize: 24
            }}
          >
            {memberInitials(profile.displayName)}
          </span>
        )}
        <div style={{ flex: "1 1 220px", minWidth: 0, display: "grid", gap: 6 }}>
          <h1 className="island-display" style={{ margin: 0, fontSize: "clamp(24px, 4vw, 34px)", fontWeight: 800 }}>
            {profile.displayName}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <IslandTag tone={presenceTone(presence.status)}>{presence.status ?? "offline"}</IslandTag>
            {presence.inVoice ? <IslandTag tone="info">🎧 IN VOICE</IslandTag> : null}
            {nuggies.equippedTitle ? <IslandTag tone="warning">{nuggies.equippedTitle}</IslandTag> : null}
          </div>
          {presence.richPresenceText ? (
            <div style={{ fontSize: 13, color: islandTheme.color.textMuted }}>{presence.richPresenceText}</div>
          ) : null}
        </div>
      </IslandCard>

      <IslandCard style={{ padding: 12, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
        <SummaryStat label="Nuggies" value={`₦${nuggies.balance.toLocaleString()}`} accent />
        {nuggies.tier ? <SummaryStat label="Tier" value={nuggies.tier} /> : null}
        <SummaryStat label="Achievements" value={achievements.totalUnlocked.toLocaleString()} />
      </IslandCard>

      {profile.steamHidden ? (
        <IslandCard style={{ padding: 28, textAlign: "center", display: "grid", gap: 8, justifyItems: "center" }}>
          <span style={{ fontSize: 30 }} aria-hidden="true">
            🔒
          </span>
          <div style={{ fontWeight: 700, fontSize: 15, color: islandTheme.color.textPrimary }}>
            This islander keeps their library private
          </div>
          <div style={{ fontSize: 13, color: islandTheme.color.textMuted, maxWidth: 420, lineHeight: 1.5 }}>
            Their Steam games and achievements are hidden from the rest of the crew.
          </div>
        </IslandCard>
      ) : (
        <>
          <IslandCard as="section" style={{ display: "grid", gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: islandTheme.color.textPrimary }}>Top games</div>
            {profile.topGames.length === 0 ? (
              <div style={{ fontSize: 13, color: islandTheme.color.textMuted }}>
                {profile.steamLinked
                  ? "No tracked playtime yet."
                  : "This islander hasn't linked Steam yet."}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {profile.topGames.map((game) => (
                  <div
                    key={game.appId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: islandTheme.color.panelMutedBg,
                      border: `1px solid ${islandTheme.color.border}`,
                      flexWrap: "wrap"
                    }}
                  >
                    <div
                      style={{
                        width: 96,
                        height: 45,
                        borderRadius: 6,
                        flexShrink: 0,
                        border: `1px solid ${islandTheme.color.cardBorder}`,
                        background: game.headerImageUrl
                          ? `url("${game.headerImageUrl}") center/cover`
                          : "linear-gradient(140deg, #0b1220, #132640)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                        color: islandTheme.color.textSubtle
                      }}
                    >
                      {game.headerImageUrl ? "" : "🎮"}
                    </div>
                    <span
                      style={{
                        flex: "1 1 160px",
                        minWidth: 0,
                        fontSize: 14,
                        fontWeight: 700,
                        color: islandTheme.color.textSecondary
                      }}
                    >
                      {game.name}
                    </span>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <IslandTag tone="primary">{formatHours(game.playtimeForever)} total</IslandTag>
                      {game.playtime2Weeks > 0 ? (
                        <IslandTag tone="info">{formatHours(game.playtime2Weeks)} · 2wk</IslandTag>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </IslandCard>

          <IslandCard as="section" style={{ display: "grid", gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: islandTheme.color.textPrimary }}>
              Achievement showcase
            </div>
            {achievements.showcase.length === 0 ? (
              <div style={{ fontSize: 13, color: islandTheme.color.textMuted }}>
                No achievement highlights to show yet.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {achievements.showcase.map((entry) => {
                  const pct = clampPct(entry.completionPct);
                  const maxed = pct >= 100;
                  return (
                    <div key={entry.appId} style={{ display: "grid", gap: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: islandTheme.color.textSecondary,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {entry.name}
                          {maxed ? " ✓" : ""}
                        </span>
                        <span
                          className="island-mono"
                          style={{
                            flexShrink: 0,
                            fontSize: 11,
                            color: maxed ? islandTheme.color.successAccent : islandTheme.color.textMuted
                          }}
                        >
                          {pct}%
                        </span>
                      </div>
                      <div
                        style={{
                          height: 6,
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
                            background: maxed
                              ? "linear-gradient(90deg, #16a34a, #4ade80)"
                              : "linear-gradient(90deg, #0369a1, #38bdf8)",
                            transition: "width 600ms ease"
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </IslandCard>
        </>
      )}

      <IslandCard as="section" style={{ display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: islandTheme.color.textPrimary }}>Recent activity</div>
        {profile.recentActivity.length === 0 ? (
          <div style={{ fontSize: 13, color: islandTheme.color.textMuted }}>No recent drift on the shore.</div>
        ) : (
          <div style={{ display: "grid", gap: 4 }}>
            {profile.recentActivity.map((event, i) => (
              <div
                key={`${event.eventType}-${event.createdAt}-${i}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "7px 10px",
                  borderRadius: 8,
                  background: islandTheme.color.panelMutedBg,
                  fontSize: 13
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: islandTheme.color.textSecondary
                    }}
                  >
                    {event.summary}
                  </div>
                </div>
                <span className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted, flexShrink: 0 }}>
                  {relTime(event.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </IslandCard>
    </div>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <span
        className="island-mono"
        style={{
          fontSize: 10,
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
          color: accent ? islandTheme.color.primaryGlow : islandTheme.color.textPrimary
        }}
      >
        {value}
      </span>
    </div>
  );
}

const IslanderProfilePage = memo(IslanderProfilePageImpl);
export default IslanderProfilePage;
