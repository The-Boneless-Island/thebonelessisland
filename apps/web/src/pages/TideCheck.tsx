import { memo, useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";
import { IslandCard, IslandTag } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import type { PageId } from "../types.js";

type DigestNight = {
  title: string;
  scheduledFor: string;
  attendees: number;
};

type DigestPlayed = {
  appId: number;
  name: string;
  headerImageUrl: string | null;
  crewMinutes2Weeks: number;
};

type DigestQueued = {
  appId: number;
  name: string;
  headerImageUrl: string | null;
  wishlisters: number;
};

type DigestHighlight = {
  kind: string;
  text: string;
};

type DigestPayload = {
  weekStart: string;
  generatedAt: string;
  attendance: {
    totalRsvps: number;
    nights: DigestNight[];
  };
  played: DigestPlayed[];
  queued: DigestQueued[];
  highlights: DigestHighlight[];
};

type TideCheckPageProps = {
  onNavigate: (page: PageId) => void;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function formatHours(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0h";
  const hours = minutes / 60;
  if (hours < 1) return `${Math.round(minutes)}m`;
  return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
}

function TideCheckPageImpl({ onNavigate }: TideCheckPageProps) {
  const [digest, setDigest] = useState<DigestPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await apiFetch("/digest/latest");
        if (!active) return;
        if (res.status === 204) {
          setEmpty(true);
          return;
        }
        if (!res.ok) {
          setErrored(true);
          return;
        }
        const text = await res.text();
        if (!active) return;
        if (!text.trim()) {
          setEmpty(true);
          return;
        }
        const body = JSON.parse(text) as DigestPayload | null;
        if (!active) return;
        if (!body) {
          setEmpty(true);
          return;
        }
        setDigest(body);
      } catch {
        if (active) setErrored(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

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
          ★ Home · Tide Check
        </span>
        <h1 className="island-display" style={{ margin: 0, fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 800 }}>
          Sunday Tide Check
        </h1>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: islandTheme.color.textSubtle, maxWidth: 640 }}>
          {digest
            ? `What the tide brought in for the week of ${formatDate(digest.weekStart)} — who showed up, what got played, and what's queued on the shore.`
            : "A weekly read on crew activity — game nights, hours logged, and what the crew is eyeing next."}
        </p>
        <button
          type="button"
          className="island-btn"
          onClick={() => onNavigate("home")}
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
          ← Back to Home
        </button>
      </header>

      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: islandTheme.color.textMuted }}>
          Reading the tide…
        </div>
      ) : errored ? (
        <IslandCard style={{ padding: 22, textAlign: "center", color: islandTheme.color.textMuted, fontSize: 13 }}>
          Couldn't read the tide right now. Try again in a bit.
        </IslandCard>
      ) : empty || !digest ? (
        <IslandCard style={{ padding: 28, textAlign: "center", display: "grid", gap: 8, justifyItems: "center" }}>
          <span style={{ fontSize: 34 }} aria-hidden="true">
            🌊
          </span>
          <div style={{ fontWeight: 700, fontSize: 16, color: islandTheme.color.textPrimary }}>
            The tide has not turned yet
          </div>
          <div style={{ fontSize: 13, color: islandTheme.color.textMuted, maxWidth: 420, lineHeight: 1.5 }}>
            The tide has not turned yet — first digest posts after a week of activity.
          </div>
        </IslandCard>
      ) : (
        <>
          <IslandCard style={{ padding: 12, display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
            <SummaryStat label="Total RSVPs" value={digest.attendance.totalRsvps.toLocaleString()} accent />
            <SummaryStat label="Game nights" value={digest.attendance.nights.length.toLocaleString()} />
            <SummaryStat label="Games played" value={digest.played.length.toLocaleString()} />
            <SummaryStat label="On the queue" value={digest.queued.length.toLocaleString()} />
            <span
              className="island-mono"
              style={{ marginLeft: "auto", fontSize: 12, color: islandTheme.color.textMuted }}
            >
              Generated {formatDateTime(digest.generatedAt)}
            </span>
          </IslandCard>

          <Section title="Who came ashore" subtitle="Game nights docked this week">
            {digest.attendance.nights.length === 0 ? (
              <EmptyNote text="No game nights docked this week." />
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {digest.attendance.nights.map((night, i) => (
                  <div
                    key={`${night.title}-${night.scheduledFor}-${i}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: islandTheme.color.panelMutedBg,
                      border: `1px solid ${islandTheme.color.border}`,
                      flexWrap: "wrap"
                    }}
                  >
                    <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: islandTheme.color.textSecondary }}>{night.title}</div>
                      <div
                        className="island-mono"
                        style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}
                      >
                        {formatDateTime(night.scheduledFor)}
                      </div>
                    </div>
                    <IslandTag tone="primary">
                      {night.attendees} {night.attendees === 1 ? "ASHORE" : "CREW"}
                    </IslandTag>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="What got played" subtitle="Crew hours logged over the past two weeks">
            {digest.played.length === 0 ? (
              <EmptyNote text="No tracked playtime washed in this week." />
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {digest.played.map((game) => (
                  <GameRow
                    key={game.appId}
                    appId={game.appId}
                    name={game.name}
                    headerImageUrl={game.headerImageUrl}
                    metaLabel={`${formatHours(game.crewMinutes2Weeks)} crew time`}
                    metaTone="primary"
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title="Queued on the shore" subtitle="What the crew is wishlisting">
            {digest.queued.length === 0 ? (
              <EmptyNote text="Nothing queued up just yet." />
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {digest.queued.map((game) => (
                  <GameRow
                    key={game.appId}
                    appId={game.appId}
                    name={game.name}
                    headerImageUrl={game.headerImageUrl}
                    metaLabel={`${game.wishlisters} ${game.wishlisters === 1 ? "wishlister" : "wishlisters"}`}
                    metaTone="info"
                  />
                ))}
              </div>
            )}
          </Section>

          {digest.highlights.length > 0 && (
            <Section title="High tide marks" subtitle="Notable moments from the week">
              <div style={{ display: "grid", gap: 6 }}>
                {digest.highlights.map((highlight, i) => (
                  <div
                    key={`${highlight.kind}-${i}`}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: islandTheme.color.panelMutedBg,
                      border: `1px solid ${islandTheme.color.border}`
                    }}
                  >
                    <IslandTag tone="warning" style={{ flexShrink: 0 }}>
                      {highlight.kind}
                    </IslandTag>
                    <span style={{ fontSize: 13, lineHeight: 1.5, color: islandTheme.color.textSecondary }}>
                      {highlight.text}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
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
          color: accent ? islandTheme.color.primaryGlow : islandTheme.color.textPrimary
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <IslandCard as="section" style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 2 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: islandTheme.color.textPrimary }}>{title}</div>
        {subtitle ? (
          <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      {children}
    </IslandCard>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 13, color: islandTheme.color.textMuted, padding: "4px 0" }}>{text}</div>
  );
}

function GameRow({
  appId,
  name,
  headerImageUrl,
  metaLabel,
  metaTone
}: {
  appId: number;
  name: string;
  headerImageUrl: string | null;
  metaLabel: string;
  metaTone: "primary" | "info";
}) {
  return (
    <div
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
          background: headerImageUrl
            ? `url("${headerImageUrl}") center/cover`
            : "linear-gradient(140deg, #0b1220, #132640)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          color: islandTheme.color.textSubtle
        }}
      >
        {headerImageUrl ? "" : "🎮"}
      </div>
      <span style={{ flex: "1 1 160px", minWidth: 0, fontSize: 14, fontWeight: 700, color: islandTheme.color.textSecondary }}>
        {name}
      </span>
      <IslandTag tone={metaTone}>{metaLabel}</IslandTag>
      <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
        #{appId}
      </span>
    </div>
  );
}

const TideCheckPage = memo(TideCheckPageImpl);
export default TideCheckPage;
