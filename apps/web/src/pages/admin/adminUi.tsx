// Shared admin UI primitives. Extracted from the old monolithic Admin.tsx so
// every admin page composes the same building blocks.

import type { CSSProperties, ReactNode } from "react";
import { IslandCard, IslandSkeletonCard, islandTagStyle } from "../../islandUi.js";
import { islandTheme } from "../../theme.js";
import { SettingCard } from "../../components/SettingCard.js";
import { SETTING_META } from "./settingMeta.js";
import type { ServerSetting } from "../../types.js";

export function SubsectionTitle({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <h3
      className="island-display"
      style={{
        margin: 0,
        marginBottom: 10,
        fontSize: 14,
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: islandTheme.color.textMuted,
        ...style
      }}
    >
      {children}
    </h3>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
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
      {children}
    </label>
  );
}

export function Toggle({ on }: { on: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 36,
        height: 20,
        borderRadius: 999,
        background: on ? "rgba(74, 222, 128, 0.4)" : islandTheme.color.panelMutedBg,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        position: "relative",
        transition: "background 200ms"
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          width: 14,
          height: 14,
          borderRadius: 999,
          background: on ? islandTheme.color.successAccent : islandTheme.color.textMuted,
          transition: "left 200ms"
        }}
      />
    </span>
  );
}

export function RuleRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 0",
        borderTop: `1px solid ${islandTheme.color.cardBorder}`
      }}
    >
      <span style={{ fontSize: 13 }}>{label}</span>
      <Toggle on={enabled} />
    </div>
  );
}

export function Slider({ label, value, hint }: { label: string; value: number; hint?: string }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: islandTheme.color.textSubtle }}>{label}</span>
        <span className="island-mono" style={{ color: islandTheme.color.textMuted }}>
          {value.toFixed(1)}
        </span>
      </div>
      <div
        style={{
          position: "relative",
          height: 6,
          borderRadius: 999,
          background: islandTheme.color.panelMutedBg,
          overflow: "hidden"
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${islandTheme.color.primaryGlow}, ${islandTheme.palette.sandWarmAccent})`
          }}
        />
      </div>
      {hint ? (
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 4, lineHeight: 1.4 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export function smallBtn(bg: string, fg: string, ghost = false, border?: string): CSSProperties {
  return {
    background: bg,
    border: `1px solid ${ghost ? border ?? islandTheme.color.cardBorder : bg}`,
    color: fg,
    fontSize: 12,
    fontWeight: 700,
    padding: "5px 12px",
    borderRadius: 999,
    cursor: "pointer",
    font: "inherit"
  };
}

export function StatRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div
      style={{
        padding: "8px 12px",
        borderRadius: islandTheme.radius.control,
        background: islandTheme.color.panelMutedBg,
        border: `1px solid ${ok ? "rgba(34,197,94,0.28)" : islandTheme.color.cardBorder}`
      }}
    >
      <div
        className="island-mono"
        style={{ fontSize: 12, color: islandTheme.color.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: islandTheme.color.textPrimary, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

export function ContextStatRow({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div
        className="island-mono"
        style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}
      >
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 12, color: islandTheme.color.textSubtle, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

export function SectionLabel({ title }: { title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 1, background: islandTheme.color.cardBorder }} />
      <span
        className="island-mono"
        style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", color: islandTheme.color.textMuted }}
      >
        {title}
      </span>
      <div style={{ flex: 1, height: 1, background: islandTheme.color.cardBorder }} />
    </div>
  );
}

type AdminStatusBannerProps = {
  accent: string;
  icon: string;
  kicker: string;
  title: string;
  subtitle?: ReactNode;
  control?: ReactNode;
  id?: string;
};

/** The gradient status banner pattern shared by News / AI / Bridge / Economy. */
export function AdminStatusBanner({ accent, icon, kicker, title, subtitle, control, id }: AdminStatusBannerProps) {
  return (
    <IslandCard
      id={id}
      style={{
        padding: "14px 18px",
        background: `linear-gradient(135deg, ${accent}22 0%, ${islandTheme.color.panelBg} 100%)`,
        border: `1px solid ${accent}44`
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 28 }} aria-hidden="true">{icon}</span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div
            className="island-mono"
            style={{ fontSize: 12, color: accent, textTransform: "uppercase", letterSpacing: "0.12em" }}
          >
            {kicker}
          </div>
          <div className="island-display" style={{ fontWeight: 800, fontSize: 18 }}>{title}</div>
          {subtitle ? (
            <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        {control}
      </div>
    </IslandCard>
  );
}

export function BannerToggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      style={{
        background: "none",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: islandTheme.color.textSubtle,
        fontSize: 13,
        font: "inherit",
        opacity: disabled ? 0.6 : 1
      }}
    >
      <Toggle on={on} />
      <span>{on ? "On" : "Off"}</span>
    </button>
  );
}

// ── Inline settings ──────────────────────────────────────────────────────────
// Renders SettingCards for the given keys directly on a feature page. Low-risk
// settings render first; high-risk ones collapse into a Danger zone block.

function lookupSetting(settings: ServerSetting[], key: string): ServerSetting {
  const found = settings.find((s) => s.key === key);
  if (found) return found;
  const meta = SETTING_META[key];
  return {
    key,
    value: "",
    label: meta?.label ?? key,
    description: meta?.description ?? "",
    isSecret: meta?.type === "password",
    envDefault: "",
    updatedAt: ""
  };
}

type InlineSettingsProps = {
  keys: string[];
  settings: ServerSetting[] | null;
  onSave: (key: string, value: string) => Promise<void> | void;
  title?: string;
};

export function InlineSettings({ keys, settings, onSave, title = "Settings" }: InlineSettingsProps) {
  const metas = keys.map((k) => SETTING_META[k]).filter(Boolean);
  if (metas.length === 0) return null;

  if (settings === null) {
    return (
      <div style={{ display: "grid", gap: 12 }} aria-busy="true" aria-label="Loading settings">
        {metas.slice(0, 3).map((m) => (
          <IslandSkeletonCard key={m.key} lines={3} />
        ))}
      </div>
    );
  }

  const lowRisk = metas.filter((m) => m.dangerLevel !== "high");
  const highRisk = metas.filter((m) => m.dangerLevel === "high");
  const aiProvider = settings.find((s) => s.key === "ai_provider")?.value ?? "";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {title ? <SectionLabel title={title} /> : null}
      {lowRisk.map((meta) => (
        <div key={meta.key} id={`setting-${meta.key}`}>
          <SettingCard setting={lookupSetting(settings, meta.key)} meta={meta} onSave={onSave} aiProvider={aiProvider} />
        </div>
      ))}
      {highRisk.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <span className="island-mono" style={islandTagStyle({ color: islandTheme.color.dangerAccent })}>
              Danger zone
            </span>
            <span style={{ fontSize: 12, color: islandTheme.color.textMuted, lineHeight: 1.4 }}>
              These can lock people out or break things. Each requires a typed confirmation to save.
            </span>
          </div>
          {highRisk.map((meta) => (
            <div key={meta.key} id={`setting-${meta.key}`}>
              <SettingCard setting={lookupSetting(settings, meta.key)} meta={meta} onSave={onSave} aiProvider={aiProvider} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
