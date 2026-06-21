// System pages: Data Sync and Audit Log.

import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import { IslandCard } from "../../islandUi.js";
import { islandTheme } from "../../theme.js";
import { AdminTabs, ContextStatRow, SubsectionTitle } from "./adminUi.js";

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
    <AdminTabs page="sync" tabs={[
      {
        anchor: "sync-connectors",
        label: "Connectors",
        content: (
          <IslandCard style={{ padding: 0, overflow: "hidden" }}>
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
        )
      },
      {
        anchor: "sync-steam-context",
        label: "Steam context",
        content: <SteamProfileContextStats />
      }
    ]} />
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
      <div className="bi-admin-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <ContextStatRow label="Members with groups synced" value={`${stats.groups_synced_users}/${stats.total_linked}`} sub={`${stats.total_groups} groups total · last sync ${fmt(stats.last_groups_synced_at)}`} />
        <ContextStatRow label="Members with achievements synced" value={`${stats.achievements_synced_users}/${stats.total_linked}`} sub={`${stats.total_progress_rows} progress rows · last sync ${fmt(stats.last_achievements_synced_at)}`} />
      </div>
    </IslandCard>
  );
}

import { AuditAdminPage } from "./auditLog.js";
export { AuditAdminPage };
