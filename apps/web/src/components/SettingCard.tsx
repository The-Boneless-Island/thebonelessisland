import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { IslandButton, IslandCard, islandInputStyle, islandTagStyle } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import type { ServerSetting } from "../types.js";
import type { SettingMeta } from "../pages/admin/settingMeta.js";
import { AiModelSelect } from "./AiModelSelect.js";

type SettingCardProps = {
  setting: ServerSetting;
  meta: SettingMeta;
  onSave: (key: string, value: string) => Promise<void> | void;
  /** Current ai_provider value, threaded so the ai_model card can list provider models. */
  aiProvider?: string;
};

const UNDO_WINDOW_MS = 30_000;

export function SettingCard({ setting, meta, onSave, aiProvider }: SettingCardProps) {
  const [draft, setDraft] = useState<string>(setting.value);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dangerExpanded, setDangerExpanded] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [undoFrom, setUndoFrom] = useState<{ value: string; expiresAt: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft(setting.value);
  }, [setting.value]);

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  const isDirty = draft !== setting.value;
  const isHighRisk = meta.dangerLevel === "high";
  const confirmRequired = isHighRisk && !!meta.confirmPhrase;
  const confirmOk = !confirmRequired || confirmText.trim() === meta.confirmPhrase;
  const canSave = isDirty && confirmOk;
  // Low-risk toggles and selects save the moment an option is clicked — no
  // separate Save button. High-risk ones keep the explicit confirm+save flow.
  const instantSave = !isHighRisk && (meta.type === "boolean" || meta.type === "select");

  async function handleSave(valueOverride?: string) {
    const previous = setting.value;
    const next = valueOverride ?? draft;
    setError(null);
    try {
      await onSave(setting.key, next);
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2200);
      setConfirmText("");
      // Open undo window
      setUndoFrom({ value: previous, expiresAt: Date.now() + UNDO_WINDOW_MS });
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndoFrom(null), UNDO_WINDOW_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function handleUndo() {
    if (!undoFrom) return;
    const target = undoFrom.value;
    setUndoFrom(null);
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
    try {
      await onSave(setting.key, target);
      setDraft(target);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Undo failed");
    }
  }

  // Body: comprehension layer + input
  const body = (
    <div style={{ display: "grid", gap: 10 }}>
      {/* Header: plain-language label */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: islandTheme.color.textPrimary }}>
          {meta.label}
        </span>
        {isHighRisk && (
          <span className="island-mono" style={islandTagStyle({ color: "#ef4444" })}>
            Sensitive
          </span>
        )}
      </div>

      {/* Description */}
      {meta.description && (
        <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
          <span style={{ color: islandTheme.color.textMuted, fontWeight: 600 }}>What it does: </span>
          {meta.description}
        </p>
      )}

      {/* When to change */}
      {meta.whenToChange && (
        <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
          <span style={{ color: islandTheme.color.textMuted, fontWeight: 600 }}>When to change: </span>
          {meta.whenToChange}
        </p>
      )}

      {/* Env fallback */}
      {setting.envDefault && !setting.value && (
        <div className="island-mono" style={fallbackStyle}>
          <span style={{ opacity: 0.6 }}>Using env fallback: </span>
          <span>{setting.envDefault}</span>
        </div>
      )}

      {/* If you get this wrong */}
      {isHighRisk && meta.ifWrong && (
        <div style={ifWrongStyle}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>⚠</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#fca5a5", marginBottom: 2 }}>
              If you get this wrong
            </div>
            <div style={{ fontSize: 12, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
              {meta.ifWrong}
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <SettingInput
        meta={meta}
        setting={setting}
        draft={draft}
        onChange={
          instantSave
            ? (v) => {
                if (v === setting.value) return;
                setDraft(v);
                void handleSave(v);
              }
            : setDraft
        }
        aiProvider={aiProvider}
      />

      {/* Typed confirm (high-risk only) */}
      {confirmRequired && isDirty && (
        <div style={{ display: "grid", gap: 6 }}>
          <label className="island-mono" style={confirmLabelStyle}>
            Type <code style={{ background: "rgba(239,68,68,0.15)", padding: "1px 5px", borderRadius: 3, color: "#fca5a5" }}>{meta.confirmPhrase}</code> to confirm
          </label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={meta.confirmPhrase}
            style={{ ...islandInputStyle, fontFamily: islandTheme.font.mono, color: confirmOk ? islandTheme.color.successAccent : islandTheme.color.textPrimary }}
            spellCheck={false}
          />
        </div>
      )}

      {/* Save row + error */}
      {instantSave ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
            {saved ? "✓ Saved" : "Saves immediately when you pick an option."}
          </span>
          {error && (
            <span style={{ fontSize: 12, color: islandTheme.color.dangerAccent }}>
              {error}
            </span>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <IslandButton
            variant={saved ? "secondary" : "primary"}
            disabled={!canSave}
            onClick={() => void handleSave()}
            style={{ minWidth: 90 }}
          >
            {saved ? "✓ Saved" : "Save"}
          </IslandButton>
          {error && (
            <span style={{ fontSize: 12, color: islandTheme.color.dangerAccent }}>
              {error}
            </span>
          )}
          {isDirty && !saved && (
            <span style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
              Unsaved changes
            </span>
          )}
        </div>
      )}

      {/* Undo banner */}
      {undoFrom && (
        <UndoBanner from={undoFrom.value} onUndo={() => void handleUndo()} onDismiss={() => setUndoFrom(null)} />
      )}

      {/* Footer: last-changed + key */}
      <FooterRow setting={setting} />
    </div>
  );

  // High-risk wrapper: collapsible danger container
  if (isHighRisk) {
    return (
      <IslandCard
        style={{
          padding: 0,
          border: "1px solid rgba(239,68,68,0.45)",
          background: "rgba(239,68,68,0.04)"
        }}
      >
        <button
          type="button"
          onClick={() => setDangerExpanded((v) => !v)}
          style={dangerHeaderStyle(dangerExpanded)}
        >
          <span style={{ fontSize: 14 }}>{dangerExpanded ? "▼" : "▶"}</span>
          <span className="island-mono" style={{ ...islandTagStyle({ color: "#ef4444" }), fontSize: 12 }}>
            Sensitive
          </span>
          <span style={{ fontWeight: 700, fontSize: 14, color: islandTheme.color.textPrimary, flex: 1, textAlign: "left" }}>
            {meta.label}
          </span>
          {!dangerExpanded && setting.value && (
            <span style={{ fontSize: 12, color: islandTheme.color.textMuted, fontFamily: islandTheme.font.mono }}>
              {summarize(meta, setting.value)}
            </span>
          )}
        </button>
        {dangerExpanded && (
          <div style={{ padding: "0 18px 16px" }}>
            {body}
          </div>
        )}
      </IslandCard>
    );
  }

  return <IslandCard style={{ padding: "16px 18px" }}>{body}</IslandCard>;
}

function SettingInput({
  meta,
  setting,
  draft,
  onChange,
  aiProvider
}: {
  meta: SettingMeta;
  setting: ServerSetting;
  draft: string;
  onChange: (v: string) => void;
  aiProvider?: string;
}) {
  if (meta.key === "ai_model") {
    return <AiModelSelect value={draft} provider={aiProvider ?? ""} onChange={onChange} />;
  }

  if (meta.type === "boolean") {
    const isOn = draft === "true";
    return (
      <div style={{ display: "flex", gap: 8 }}>
        {[
          { value: "true", label: "On" },
          { value: "false", label: "Off" }
        ].map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={toggleButtonStyle(draft === opt.value, opt.value === "true")}
          >
            {draft === opt.value ? "● " : ""}{opt.label}
          </button>
        ))}
        <span style={{ alignSelf: "center", fontSize: 12, color: islandTheme.color.textMuted, marginLeft: 6 }}>
          Currently: {isOn ? "enabled" : "disabled"}
        </span>
      </div>
    );
  }

  if (meta.type === "select" && meta.selectOptions) {
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {meta.selectOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={toggleButtonStyle(draft === opt.value, false)}
          >
            {draft === opt.value ? "● " : ""}{opt.label}
          </button>
        ))}
      </div>
    );
  }

  const placeholder = setting.envDefault || meta.example || `Enter ${meta.label.toLowerCase()}…`;
  const isPasswordSet = meta.type === "password" && setting.value === "••••••••";

  if (meta.type === "textarea") {
    return (
      <textarea
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={6}
        style={{ ...islandInputStyle, width: "100%", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, minHeight: 120 }}
        spellCheck={false}
      />
    );
  }

  return (
    <input
      type={meta.type === "password" ? "password" : meta.type === "number" ? "number" : "text"}
      value={isPasswordSet && !draft ? "" : draft}
      onChange={(e) => onChange(e.target.value)}
      placeholder={isPasswordSet ? "Key is set — enter a new key to replace" : placeholder}
      style={islandInputStyle}
      spellCheck={false}
      autoComplete={meta.type === "password" ? "off" : undefined}
    />
  );
}

function UndoBanner({ from, onUndo, onDismiss }: { from: string; onUndo: () => void; onDismiss: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(30);
  useEffect(() => {
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={undoBannerStyle}>
      <span style={{ fontSize: 13, color: islandTheme.color.textPrimary }}>
        Saved. <span style={{ color: islandTheme.color.textMuted }}>Undo to restore previous value</span>
      </span>
      <span style={{ flex: 1 }} />
      <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
        {secondsLeft}s
      </span>
      <button
        type="button"
        onClick={onUndo}
        style={undoButtonStyle}
        title={`Restore: ${from || "(empty)"}`}
      >
        Undo
      </button>
      <button
        type="button"
        onClick={onDismiss}
        style={dismissButtonStyle}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

function FooterRow({ setting }: { setting: ServerSetting }) {
  const ago = useMemo(() => relativeAgo(setting.updatedAt), [setting.updatedAt]);
  return (
    <div
      className="island-mono"
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        fontSize: 12,
        color: islandTheme.color.textMuted,
        paddingTop: 6,
        borderTop: `1px solid ${islandTheme.color.cardBorder}`
      }}
    >
      {ago && <span>Last changed {ago}</span>}
      <span style={{ marginLeft: "auto", opacity: 0.7 }}>Key: {setting.key}</span>
    </div>
  );
}

function summarize(meta: SettingMeta, value: string): string {
  if (meta.type === "password") return value === "••••••••" ? "set" : "not set";
  if (meta.type === "boolean") return value === "true" ? "on" : "off";
  if (value.length > 28) return value.slice(0, 26) + "…";
  return value;
}

function relativeAgo(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const delta = Date.now() - t;
  if (delta < 60_000) return "just now";
  const minutes = Math.round(delta / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const fallbackStyle: CSSProperties = {
  fontSize: 12,
  color: islandTheme.color.textMuted,
  padding: "6px 10px",
  borderRadius: 7,
  background: islandTheme.color.panelMutedBg,
  border: `1px solid ${islandTheme.color.cardBorder}`
};

const ifWrongStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 8,
  background: "rgba(239,68,68,0.08)",
  border: "1px solid rgba(239,68,68,0.30)"
};

const undoBannerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 12px",
  borderRadius: 8,
  background: "rgba(34,197,94,0.10)",
  border: "1px solid rgba(34,197,94,0.30)",
  marginTop: 4
};

const undoButtonStyle: CSSProperties = {
  background: "rgba(34,197,94,0.20)",
  border: "1px solid rgba(34,197,94,0.45)",
  color: "#86efac",
  fontSize: 12,
  fontWeight: 700,
  padding: "4px 10px",
  borderRadius: 6,
  cursor: "pointer",
  font: "inherit"
};

const dismissButtonStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: islandTheme.color.textMuted,
  fontSize: 14,
  cursor: "pointer",
  padding: "2px 6px",
  font: "inherit"
};

const confirmLabelStyle: CSSProperties = {
  fontSize: 12,
  color: islandTheme.color.textMuted,
  textTransform: "uppercase",
  letterSpacing: "0.06em"
};

function toggleButtonStyle(active: boolean, isOn: boolean): CSSProperties {
  const accent = isOn ? "#22c55e" : "#38bdf8";
  return {
    padding: "6px 14px",
    borderRadius: 8,
    border: `1px solid ${active ? accent : islandTheme.color.cardBorder}`,
    background: active ? `${accent}22` : "transparent",
    color: active ? islandTheme.color.textPrimary : islandTheme.color.textSubtle,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    font: "inherit"
  };
}

function dangerHeaderStyle(expanded: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 18px",
    width: "100%",
    background: "transparent",
    border: "none",
    borderBottom: expanded ? "1px solid rgba(239,68,68,0.25)" : "none",
    color: islandTheme.color.textPrimary,
    cursor: "pointer",
    font: "inherit",
    textAlign: "left"
  };
}

