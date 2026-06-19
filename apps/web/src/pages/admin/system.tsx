// System pages: Data Sync and Audit Log.

import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import { IslandCard } from "../../islandUi.js";
import { islandTheme } from "../../theme.js";
import type { ActivityEvent } from "../../types.js";
import { ContextStatRow, SubsectionTitle } from "./adminUi.js";

// ── Data Sync ────────────────────────────────────────────────────────────────

export function SyncAdminPage() {
  // Connector cadences are how often each sync routine is configured to run.
  // We do not yet collect per-connector health telemetry, so we deliberately
  // show the schedule (a real, known fact) rather than an invented online badge.
  const connectors = [
    { name: "Discord OAuth", cadence: "on login" },
    { name: "Discord Members", cadence: "every 60s" },
    { name: "Discord Voice State", cadence: "on event" },
    { name: "Steam OpenID", cadence: "on link" },
    { name: "Steam OwnedGames", cadence: "every 30m" },
    { name: "Steam Wishlist", cadence: "every 30m" }
  ];
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <IslandCard id="sync-connectors" style={{ padding: 0, overflow: "hidden" }}>
        <SubsectionTitle style={{ padding: "14px 16px 0" }}>Connectors</SubsectionTitle>
        <p style={{ margin: "0 16px 4px", fontSize: 12, color: islandTheme.color.textMuted, lineHeight: 1.5 }}>
          Configured sync cadence per connector. Per-connector health telemetry isn’t wired up yet.
        </p>
        {connectors.map((c, i) => (
          <ConnectorRow key={c.name} entry={c} firstRow={i === 0} />
        ))}
        <p
          style={{
            margin: 0,
            padding: "10px 16px 14px",
            fontSize: 12,
            color: islandTheme.color.textMuted,
            borderTop: `1px solid ${islandTheme.color.cardBorder}`
          }}
        >
          Streaming sync log planned — per-run results will appear here once telemetry is collected.
        </p>
      </IslandCard>

      <div id="sync-steam-context">
        <SteamProfileContextStats />
      </div>
    </div>
  );
}

function ConnectorRow({
  entry,
  firstRow
}: {
  entry: { name: string; cadence: string };
  firstRow: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        padding: "12px 16px",
        alignItems: "center",
        borderTop: firstRow ? "none" : `1px solid ${islandTheme.color.cardBorder}`
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700 }}>{entry.name}</div>
      <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
        {entry.cadence}
      </span>
    </div>
  );
}

type SteamContextStats = {
  total_linked: number;
  groups_synced_users: number;
  achievements_synced_users: number;
  total_groups: number;
  total_progress_rows: number;
  last_groups_synced_at: string | null;
  last_achievements_synced_at: string | null;
};

function SteamProfileContextStats() {
  const [stats, setStats] = useState<SteamContextStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/steam/profile-context-stats")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as SteamContextStats;
      })
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <IslandCard style={{ padding: 16 }}>
        <span style={{ fontSize: 12, color: islandTheme.color.dangerText }}>{error}</span>
      </IslandCard>
    );
  }
  if (!stats) {
    return (
      <IslandCard style={{ padding: 16 }}>
        <span style={{ fontSize: 12, color: islandTheme.color.textMuted }}>Loading Steam context stats…</span>
      </IslandCard>
    );
  }

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "never");
  return (
    <IslandCard style={{ padding: 16 }}>
      <SubsectionTitle>Steam profile context</SubsectionTitle>
      <p style={{ margin: "0 0 10px 0", fontSize: 12, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
        Steam community groups + per-game achievement progress feed the AI news curator. Syncs run on Steam library refresh with a 24h cooldown.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <ContextStatRow label="Members with groups synced" value={`${stats.groups_synced_users}/${stats.total_linked}`} sub={`${stats.total_groups} groups total · last sync ${fmt(stats.last_groups_synced_at)}`} />
        <ContextStatRow label="Members with achievements synced" value={`${stats.achievements_synced_users}/${stats.total_linked}`} sub={`${stats.total_progress_rows} progress rows · last sync ${fmt(stats.last_achievements_synced_at)}`} />
      </div>
    </IslandCard>
  );
}

// ── Audit Log ────────────────────────────────────────────────────────────────

function auditTimeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function auditSummary(event: ActivityEvent): string {
  const verb = event.eventType.replace(/[._]/g, " ");
  const subject = event.game?.name ?? event.target?.displayName ?? event.gameNightId ?? "";
  return subject ? `${verb} · ${subject}` : verb;
}

export function AuditAdminPage({ profileJson }: { profileJson: string }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiFetch("/activity?limit=50");
        if (!res.ok) {
          if (!cancelled) setLoadState("error");
          return;
        }
        const data = (await res.json().catch(() => null)) as { events?: ActivityEvent[] } | null;
        if (!cancelled) {
          setEvents(data?.events ?? []);
          setLoadState("ready");
        }
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <IslandCard style={{ padding: 16 }}>
        <SubsectionTitle>Event log</SubsectionTitle>
        <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
          Recent categorized activity events serve as the interim audit view. Search and export aren’t
          available yet.
        </p>
      </IslandCard>
      <IslandCard style={{ padding: 0, overflow: "hidden" }}>
        {loadState === "loading" ? (
          <div style={{ padding: "16px", fontSize: 13, color: islandTheme.color.textMuted }}>
            Loading events…
          </div>
        ) : loadState === "error" ? (
          <div style={{ padding: "16px", fontSize: 13, color: islandTheme.color.dangerText }}>
            Couldn’t load the event log. Try again in a moment.
          </div>
        ) : events.length === 0 ? (
          <div style={{ padding: "16px", fontSize: 13, color: islandTheme.color.textMuted }}>
            No events recorded yet.
          </div>
        ) : (
          events.map((e, i) => (
            <div
              key={e.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 12,
                padding: "12px 16px",
                borderTop: i === 0 ? "none" : `1px solid ${islandTheme.color.cardBorder}`,
                alignItems: "center"
              }}
            >
              <div>
                <div style={{ fontSize: 13 }}>
                  <strong>{e.actor?.displayName ?? "system"}</strong> {auditSummary(e)}
                </div>
                <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>
                  {e.category}
                </div>
              </div>
              <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
                {auditTimeAgo(e.createdAt)}
              </span>
            </div>
          ))
        )}
      </IslandCard>
      <details>
        <summary style={{ cursor: "pointer", fontSize: 13, color: islandTheme.color.textMuted }}>
          Profile payload (debug)
        </summary>
        <pre
          style={{
            marginTop: 8,
            padding: 12,
            background: islandTheme.color.panelMutedBg,
            border: `1px solid ${islandTheme.color.cardBorder}`,
            borderRadius: 8,
            fontFamily: islandTheme.font.mono,
            fontSize: 12,
            color: islandTheme.color.textSubtle,
            maxHeight: 320,
            overflow: "auto"
          }}
        >
          {profileJson}
        </pre>
      </details>
    </div>
  );
}
