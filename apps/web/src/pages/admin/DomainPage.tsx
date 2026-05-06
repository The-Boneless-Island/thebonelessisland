import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { IslandCard, islandTagStyle } from "../../islandUi.js";
import { SettingCard } from "../../components/SettingCard.js";
import { islandTheme } from "../../theme.js";
import type { ServerSetting } from "../../types.js";
import { DOMAIN_INFO, settingsByDomain } from "./settingMeta.js";
import type { SettingDomain, SettingMeta } from "./settingMeta.js";

export type OperationsArea = {
  id: string;
  label: string;
  icon?: string;
  render: () => ReactNode;
};

export type DomainTab = "operations" | "settings";

type DomainPageProps = {
  domain: SettingDomain;
  operationsAreas: OperationsArea[];
  settings: ServerSetting[] | null;
  onSettingSave: (key: string, value: string) => Promise<void> | void;
  initialTab?: DomainTab;
  initialOpsArea?: string;
  initialSettingsSearch?: string;
};

export function DomainPage({
  domain,
  operationsAreas,
  settings,
  onSettingSave,
  initialTab = "operations",
  initialOpsArea,
  initialSettingsSearch
}: DomainPageProps) {
  const info = DOMAIN_INFO[domain];
  const domainSettings = useMemo(() => settingsByDomain(domain), [domain]);

  const [tab, setTab] = useState<DomainTab>(initialTab);
  const [opsArea, setOpsArea] = useState<string>(initialOpsArea ?? operationsAreas[0]?.id ?? "");

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Domain header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: `${info.accent}33`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22
          }}
        >
          {info.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="island-display" style={{ margin: 0, fontSize: "clamp(20px, 3vw, 26px)", fontWeight: 800 }}>
            {info.label}
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: islandTheme.color.textMuted, lineHeight: 1.4 }}>
            {info.blurb}
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div style={tabBarStyle}>
        <TabButton active={tab === "operations"} onClick={() => setTab("operations")}>
          Operations
          <CountBadge color={info.accent} count={operationsAreas.length} />
        </TabButton>
        <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>
          Settings
          <CountBadge color={info.accent} count={domainSettings.length} />
        </TabButton>
      </div>

      {/* Tab content */}
      {tab === "operations" ? (
        <OperationsContent areas={operationsAreas} active={opsArea} onSelect={setOpsArea} accent={info.accent} />
      ) : (
        <SettingsContent
          settings={settings}
          metaList={domainSettings}
          onSave={onSettingSave}
          initialSearch={initialSettingsSearch}
        />
      )}
    </div>
  );
}

// ── Operations panel ─────────────────────────────────────────────────────────

function OperationsContent({
  areas,
  active,
  onSelect,
  accent
}: {
  areas: OperationsArea[];
  active: string;
  onSelect: (id: string) => void;
  accent: string;
}) {
  if (areas.length === 0) {
    return (
      <IslandCard style={{ padding: 18 }}>
        <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textMuted }}>
          No operations available in this domain.
        </p>
      </IslandCard>
    );
  }

  const current = areas.find((a) => a.id === active) ?? areas[0];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {areas.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {areas.map((a) => {
            const isActive = a.id === current.id;
            return (
              <button
                key={a.id}
                type="button"
                className="island-mono"
                onClick={() => onSelect(a.id)}
                style={{
                  ...islandTagStyle({ color: accent, active: isActive }),
                  padding: "4px 12px",
                  fontSize: 11,
                  cursor: "pointer"
                }}
              >
                {a.icon && <span style={{ marginRight: 6 }}>{a.icon}</span>}
                {a.label}
              </button>
            );
          })}
        </div>
      )}
      {current.render()}
    </div>
  );
}

// ── Settings panel ───────────────────────────────────────────────────────────

function SettingsContent({
  settings,
  metaList,
  onSave,
  initialSearch
}: {
  settings: ServerSetting[] | null;
  metaList: SettingMeta[];
  onSave: (key: string, value: string) => Promise<void> | void;
  initialSearch?: string;
}) {
  const [search, setSearch] = useState(initialSearch ?? "");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return metaList;
    return metaList.filter((m) => {
      const haystack = [m.label, m.key, m.description, m.whenToChange, ...m.tags].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [metaList, search]);

  if (settings === null) {
    return (
      <IslandCard style={{ padding: 18 }}>
        <div style={{ fontSize: 13, color: islandTheme.color.textMuted }}>Loading settings…</div>
      </IslandCard>
    );
  }

  // Split into low-risk (top) and high-risk (bottom, danger zone)
  const lowRisk = filtered.filter((m) => m.dangerLevel === "low");
  const highRisk = filtered.filter((m) => m.dangerLevel === "high");

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Search box */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={`Search settings in this domain…`}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: `1px solid ${islandTheme.color.cardBorder}`,
          background: islandTheme.color.panelMutedBg,
          color: islandTheme.color.textPrimary,
          fontSize: 13,
          font: "inherit"
        }}
        spellCheck={false}
      />

      {filtered.length === 0 && (
        <IslandCard style={{ padding: 18 }}>
          <div style={{ fontSize: 13, color: islandTheme.color.textMuted }}>
            No settings match "{search}".
          </div>
        </IslandCard>
      )}

      {/* Low-risk settings */}
      {lowRisk.map((meta) => {
        const setting = lookupSetting(settings, meta);
        return <SettingCard key={meta.key} setting={setting} meta={meta} onSave={onSave} />;
      })}

      {/* Danger Zone */}
      {highRisk.length > 0 && (
        <div style={{ display: "grid", gap: 10, marginTop: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <span className="island-mono" style={islandTagStyle({ color: "#ef4444" })}>
              Sensitive
            </span>
            <span style={{ fontSize: 12, color: islandTheme.color.textMuted, lineHeight: 1.4 }}>
              These settings can lock people out or break things if misconfigured. Each one requires a typed confirmation to save.
            </span>
          </div>
          {highRisk.map((meta) => {
            const setting = lookupSetting(settings, meta);
            return <SettingCard key={meta.key} setting={setting} meta={meta} onSave={onSave} />;
          })}
        </div>
      )}
    </div>
  );
}

function lookupSetting(settings: ServerSetting[], meta: SettingMeta): ServerSetting {
  const found = settings.find((s) => s.key === meta.key);
  if (found) return found;
  // Synthesize a placeholder ServerSetting for keys that have metadata but no DB row yet
  return {
    key: meta.key,
    value: "",
    label: meta.label,
    description: meta.description,
    isSecret: meta.type === "password",
    envDefault: "",
    updatedAt: ""
  };
}

// ── Sub-components ───────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? "rgba(37,99,235,0.22)" : "transparent",
        color: active ? islandTheme.color.textPrimary : islandTheme.color.textSubtle,
        border: "none",
        padding: "8px 18px",
        borderRadius: 999,
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
        font: "inherit",
        display: "inline-flex",
        alignItems: "center",
        gap: 6
      }}
    >
      {children}
    </button>
  );
}

function CountBadge({ color, count }: { color: string; count: number }) {
  if (count <= 0) return null;
  return (
    <span className="island-mono" style={{ ...islandTagStyle({ color }), fontSize: 9 }}>
      {count}
    </span>
  );
}

const tabBarStyle: CSSProperties = {
  display: "inline-flex",
  gap: 4,
  padding: 4,
  background: islandTheme.color.panelMutedBg,
  borderRadius: 999,
  justifySelf: "start",
  width: "fit-content"
};
