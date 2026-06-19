// Admin dashboard: health chips + quick actions. Read-only status chips are
// allowed to duplicate toggles here — each links to the page that owns the
// actual control.

import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import { QuickActionCard } from "../../components/QuickActionCard.js";
import { islandTheme } from "../../theme.js";
import type { ServerSetting } from "../../types.js";
import { ADMIN_PAGES, type AdminPageId } from "./adminNav.js";

type QuickAction = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  tone: "primary" | "warning" | "success" | "default";
  page: AdminPageId;
  anchor?: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  { id: "grant", title: "Grant Nuggies", subtitle: "Award balance to a member or back-fill a missed reward", icon: "🍗", tone: "warning", page: "economy", anchor: "economy-grant" },
  { id: "attendance", title: "Award attendance", subtitle: "Pay out attendance for a finalized game night", icon: "🎯", tone: "success", page: "economy", anchor: "economy-attendance" },
  { id: "onboarding", title: "Review members", subtitle: "Roster, presence, and role mapping", icon: "👥", tone: "primary", page: "members" },
  { id: "reports", title: "Forum reports", subtitle: "Triage open community reports", icon: "🚩", tone: "warning", page: "forums" },
  { id: "news", title: "Re-run news curation", subtitle: "Refresh the home page feed manually", icon: "📰", tone: "primary", page: "news", anchor: "news-triggers" },
  { id: "sync", title: "Data sync health", subtitle: "Connector cadences + Steam context", icon: "🔄", tone: "default", page: "sync" }
];

type DashboardProps = {
  settings: ServerSetting[] | null;
  onNavigate: (page: AdminPageId, anchor?: string) => void;
};

export function DashboardPage({ settings, onNavigate }: DashboardProps) {
  const [openReports, setOpenReports] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/forums/admin/reports")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setOpenReports((d.reports ?? []).length);
      })
      .catch(() => {
        if (!cancelled) setOpenReports(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const getSetting = (key: string) => settings?.find((s) => s.key === key)?.value ?? "";
  const aiProvider = getSetting("ai_provider");
  const aiReady =
    getSetting("ai_enabled") === "true" &&
    !!aiProvider &&
    (aiProvider === "bedrock" ||
      getSetting(`${aiProvider}_api_key`) === "••••••••" ||
      getSetting("ai_api_key") === "••••••••");
  const newsOn = getSetting("news_general_enabled") !== "false";
  const nuggiesOn = getSetting("nuggies_enabled") !== "false";
  const bridgeOn =
    getSetting("milestone_announcements_enabled") === "true" &&
    getSetting("milestone_channel_id").trim().length > 0;

  const chips: Array<{ id: string; label: string; ok: boolean | null; detail: string; page: AdminPageId }> = [
    { id: "ai", label: "AI", ok: settings ? aiReady : null, detail: settings ? (aiReady ? aiProvider : "not configured") : "…", page: "ai" },
    { id: "news", label: "News feed", ok: settings ? newsOn : null, detail: settings ? (newsOn ? "active" : "off") : "…", page: "news" },
    { id: "nuggies", label: "Economy", ok: settings ? nuggiesOn : null, detail: settings ? (nuggiesOn ? "live" : "frozen") : "…", page: "economy-rules" },
    { id: "bridge", label: "Bridge", ok: settings ? bridgeOn : null, detail: settings ? (bridgeOn ? "announcing" : "silent") : "…", page: "bridge" },
    { id: "reports", label: "Reports", ok: openReports === null ? null : openReports === 0, detail: openReports === null ? "…" : `${openReports} open`, page: "forums" }
  ];

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* Health strip */}
      <div style={{ display: "grid", gap: 10 }}>
        <h2
          className="island-display"
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: islandTheme.color.textMuted
          }}
        >
          Island status
        </h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {chips.map((chip) => {
          const color =
            chip.ok === null
              ? islandTheme.color.textMuted
              : chip.ok
                ? islandTheme.color.successAccent
                : islandTheme.color.warnAccent;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => onNavigate(chip.page)}
              className="island-mono"
              title={`Open ${ADMIN_PAGES[chip.page].label}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "6px 12px",
                borderRadius: 999,
                background: islandTheme.color.panelMutedBg,
                border: `1px solid ${islandTheme.color.cardBorder}`,
                color: islandTheme.color.textSubtle,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.04em",
                cursor: "pointer",
                font: "inherit"
              }}
            >
              <span
                aria-hidden="true"
                style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0 }}
              />
              {chip.label}
              <span style={{ color: islandTheme.color.textMuted, fontWeight: 400 }}>{chip.detail}</span>
            </button>
          );
        })}
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: "grid", gap: 10 }}>
        <h2
          className="island-display"
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: islandTheme.color.textMuted
          }}
        >
          Quick actions
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 10
          }}
        >
          {QUICK_ACTIONS.map((qa) => (
            <QuickActionCard
              key={qa.id}
              icon={qa.icon}
              title={qa.title}
              subtitle={qa.subtitle}
              tone={qa.tone}
              count={qa.id === "reports" && openReports ? openReports : undefined}
              onClick={() => onNavigate(qa.page, qa.anchor)}
            />
          ))}
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: islandTheme.color.textMuted }}>
        Tip: press <kbd style={{ font: "inherit", padding: "1px 6px", borderRadius: 4, border: `1px solid ${islandTheme.color.cardBorder}`, background: islandTheme.color.panelMutedBg }}>/</kbd>{" "}
        to search every setting, page, and section.
      </p>
    </div>
  );
}
