// Nuggie AI pages: AI Provider (merged status + config) and Nuggie Persona.

import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import { IslandButton, IslandCard, islandInputStyle } from "../../islandUi.js";
import { islandTheme } from "../../theme.js";
import type { ServerSetting } from "../../types.js";
import { AdminStatusBanner, AdminTabs, BannerToggle, InlineSettings, StatRow, SubsectionTitle } from "./adminUi.js";
import { ADMIN_PAGES, inlineSettingKeysFor } from "./adminNav.js";

// Accent comes from the nav registry — one source for sidebar, search, and page chrome.
const ACCENT = ADMIN_PAGES["ai"].accent;

type AiCostToday = {
  today: number;
  calls: number;
  threshold: number;
  overThreshold: boolean;
};

type AiPageProps = {
  settings: ServerSetting[] | null;
  onUpdate: (key: string, value: string) => void;
  onTest: (opts: { provider: string; model?: string; apiKey?: string }) => Promise<{ ok: boolean; provider?: string; model?: string; error?: string }>;
};

export function AiAdminPage({ settings, onUpdate, onTest }: AiPageProps) {
  const getSetting = (key: string) => settings?.find((s) => s.key === key)?.value ?? "";

  const provider = getSetting("ai_provider");
  const model = getSetting("ai_model");
  const enabled = getSetting("ai_enabled") === "true";
  const keySet =
    getSetting(`${provider}_api_key`) === "••••••••" ||
    getSetting("ai_api_key") === "••••••••" ||
    provider === "bedrock"; // Bedrock authenticates via IAM, no key needed

  const [cost, setCost] = useState<AiCostToday | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("bi:ai-cost-banner-dismissed") === "1";
  });
  const [testState, setTestState] = useState<"idle" | "running" | "ok" | "error">("idle");
  const [testMsg, setTestMsg] = useState("");
  const [keySaved, setKeySaved] = useState<Record<string, boolean>>({});
  const [legacyKey, setLegacyKey] = useState("");
  const legacyKeyIsSet = getSetting("ai_api_key") === "••••••••";

  // Poll today's spend on mount + every 60s while this page is visible.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiFetch("/settings/ai-cost-today");
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as AiCostToday | null;
        if (!cancelled && data) setCost(data);
      } catch {
        // best-effort; chip just stays empty
      }
    }
    void load();
    const handle = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, []);

  const saveKey = (key: string, value: string) => {
    onUpdate(key, value);
    setKeySaved((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setKeySaved((prev) => ({ ...prev, [key]: false })), 2200);
  };

  async function runTest() {
    if (!provider) return;
    setTestState("running");
    setTestMsg("");
    try {
      const result = await onTest({ provider, model: model || undefined });
      if (result.ok) {
        setTestState("ok");
        setTestMsg(`Connected · ${result.provider}${result.model ? ` / ${result.model}` : ""}`);
      } else {
        setTestState("error");
        setTestMsg(result.error ?? "Connection failed");
      }
    } catch (e) {
      setTestState("error");
      setTestMsg(e instanceof Error ? e.message : "Connection failed");
    }
    setTimeout(() => setTestState("idle"), 8000);
  }

  if (settings === null) {
    return (
      <IslandCard style={{ padding: 20 }}>
        <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textMuted }}>Loading settings…</p>
      </IslandCard>
    );
  }

  const ready = enabled && !!provider && keySet;
  const showCostBanner = cost?.overThreshold === true && !bannerDismissed;
  const providerLabel = provider
    ? `${provider.charAt(0).toUpperCase() + provider.slice(1)} · ${model || "default model"}`
    : "Not configured";

  return (
    <AdminTabs
      page="ai"
      tabs={[
        {
          anchor: "ai-status",
          label: "Status",
          content: (
            <>
              {showCostBanner && cost && (
                <IslandCard
                  style={{
                    padding: "12px 14px",
                    border: `1.5px solid ${islandTheme.color.dangerAccent}`,
                    background: "rgba(248,113,113,0.08)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap"
                  }}
                >
                  <span style={{ fontSize: 18 }}>⚠️</span>
                  <div style={{ flex: 1, minWidth: 200, fontSize: 13, lineHeight: 1.4 }}>
                    <strong>Today's estimated AI spend (${cost.today.toFixed(2)}) has crossed the warning threshold (${cost.threshold.toFixed(2)}).</strong>
                    <br />
                    No calls have been blocked. Review recent activity or raise the threshold below.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.setItem("bi:ai-cost-banner-dismissed", "1");
                      setBannerDismissed(true);
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: islandTheme.color.textSubtle,
                      cursor: "pointer",
                      fontSize: 12,
                      padding: "4px 8px"
                    }}
                  >
                    Dismiss for this session
                  </button>
                </IslandCard>
              )}
              <AdminStatusBanner
                accent={ACCENT}
                icon="🤖"
                kicker="AI Engine"
                title={providerLabel}
                subtitle={
                  cost
                    ? `Today: $${cost.today.toFixed(2)} · ${cost.calls} call${cost.calls === 1 ? "" : "s"}${cost.threshold > 0 ? ` (warn ≥ $${cost.threshold.toFixed(2)})` : ""}`
                    : enabled
                      ? "AI features enabled"
                      : "AI features disabled"
                }
                control={
                  <BannerToggle
                    on={enabled}
                    onToggle={() => onUpdate("ai_enabled", enabled ? "false" : "true")}
                  />
                }
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
                <StatRow label="Enabled" value={enabled ? "Yes" : "No"} ok={enabled} />
                <StatRow label="Provider" value={provider || "—"} ok={!!provider} />
                <StatRow label="Model" value={model || "default"} ok={!!provider} />
                <StatRow label="Auth" value={keySet ? (provider === "bedrock" ? "IAM role" : "Key set") : "No key"} ok={keySet} />
              </div>
            </>
          )
        },
        {
          anchor: "ai-provider-model",
          label: "Provider",
          content: (
            <>
              <InlineSettings
                keys={inlineSettingKeysFor("ai")}
                settings={settings}
                onSave={onUpdate}
                title="Provider & model"
              />
              {provider === "bedrock" && (
                <IslandCard style={{ padding: "14px 16px", marginTop: 10 }}>
                  <p style={{ margin: 0, fontSize: 12, color: islandTheme.color.textSubtle, lineHeight: 1.55 }}>
                    <strong>Bedrock task routing:</strong> News curation always uses{" "}
                    <strong>Bedrock curation model</strong> (defaults to Claude Haiku) — not your main{" "}
                    <code>ai_model</code> slot. Nuggie chat uses <strong>Bedrock chat model</strong>. Validation
                    repair and taglines use <strong>Bedrock light tasks model</strong> (defaults to Nova Lite).
                    Embeddings stay on Titan regardless. If summaries were short or movie-heavy, check that curation
                    is on Haiku, then re-run <strong>Fetch &amp; Curate</strong> on the News Triggers tab.
                  </p>
                </IslandCard>
              )}
              {!ready && (
                <p style={{ margin: "10px 0 0", fontSize: 12, color: islandTheme.color.textMuted, lineHeight: 1.5 }}>
                  AI is {enabled ? "" : "disabled and "}not fully configured — pick a provider, set its API key below
                  (Bedrock needs none), then run the connection test.
                </p>
              )}
            </>
          )
        },
        {
          anchor: "ai-keys",
          label: "Keys",
          content: (
            <IslandCard style={{ padding: "16px 18px" }}>
              <SubsectionTitle>API Keys</SubsectionTitle>
              <p style={{ margin: "0 0 14px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
                One slot per provider so you can route different workloads to different vendors (e.g. Anthropic for curation, OpenAI for embedding clustering). Keys are stored server-side and never returned to the browser after saving. Each falls back to its matching env var (<code>ANTHROPIC_API_KEY</code> / <code>OPENAI_API_KEY</code> / <code>GEMINI_API_KEY</code>) when blank. Amazon Bedrock needs no key — it uses the server's AWS IAM role.
              </p>

              <ProviderKeyRow
                settingKey="anthropic_api_key"
                label="Anthropic (Claude)"
                placeholder="sk-ant-..."
                saved={keySaved["anthropic_api_key"]}
                isSet={getSetting("anthropic_api_key") === "••••••••"}
                onSave={(v) => saveKey("anthropic_api_key", v)}
              />
              <ProviderKeyRow
                settingKey="openai_api_key"
                label="OpenAI (GPT + embeddings)"
                placeholder="sk-..."
                saved={keySaved["openai_api_key"]}
                isSet={getSetting("openai_api_key") === "••••••••"}
                onSave={(v) => saveKey("openai_api_key", v)}
                hint="Also used for the text-embedding-3-small clustering pass — set this even if your chat provider is something else."
              />
              <ProviderKeyRow
                settingKey="gemini_api_key"
                label="Google (Gemini)"
                placeholder="AIza..."
                saved={keySaved["gemini_api_key"]}
                isSet={getSetting("gemini_api_key") === "••••••••"}
                onSave={(v) => saveKey("gemini_api_key", v)}
              />
              <ProviderKeyRow
                settingKey="ai_gateway_token"
                label="Cloudflare AI Gateway token"
                placeholder="cf-aig-..."
                saved={keySaved["ai_gateway_token"]}
                isSet={getSetting("ai_gateway_token") === "••••••••"}
                onSave={(v) => saveKey("ai_gateway_token", v)}
                hint="Required only when your Cloudflare AI Gateway has authentication enabled (cf-aig-authorization header)."
              />

              {/* Legacy single-key slot — kept visible so existing installs can see
                  it and migrate. Hidden once cleared. */}
              {legacyKeyIsSet ? (
                <div
                  style={{
                    marginTop: 16,
                    paddingTop: 12,
                    borderTop: `1px dashed ${islandTheme.color.cardBorder}`
                  }}
                >
                  <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginBottom: 6 }}>
                    Legacy shared key (used only when the matching per-provider slot is empty). You can leave this alone — once you fill the per-provider key for your active provider, this row becomes inert.
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      style={{ ...islandInputStyle, flex: 1, fontFamily: islandTheme.font.mono, letterSpacing: "0.05em" }}
                      type="password"
                      value={legacyKey}
                      placeholder="••••••••  (legacy key saved — enter new to replace)"
                      onChange={(e) => setLegacyKey(e.target.value)}
                      autoComplete="off"
                    />
                    <IslandButton
                      variant="secondary"
                      onClick={() => {
                        if (legacyKey) {
                          saveKey("ai_api_key", legacyKey);
                          setLegacyKey("");
                        }
                      }}
                      disabled={!legacyKey || keySaved["ai_api_key"]}
                    >
                      {keySaved["ai_api_key"] ? "Saved" : "Save Key"}
                    </IslandButton>
                  </div>
                </div>
              ) : null}
            </IslandCard>
          )
        },
        {
          anchor: "ai-test",
          label: "Test",
          content: (
            <IslandCard style={{ padding: "16px 18px" }}>
              <SubsectionTitle>Test Connection</SubsectionTitle>
              <p style={{ margin: "0 0 14px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
                Sends a short ping to the provider using the saved settings.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <IslandButton
                  variant="primary"
                  onClick={() => void runTest()}
                  disabled={!provider || testState === "running"}
                >
                  {testState === "running" ? "Testing…" : "Test Connection"}
                </IslandButton>
                {testMsg ? (
                  <span
                    className="island-mono"
                    style={{
                      fontSize: 12,
                      color: testState === "ok" ? islandTheme.color.successAccent : islandTheme.color.dangerAccent,
                      lineHeight: 1.4
                    }}
                  >
                    {testState === "ok" ? "✓ " : "✗ "}{testMsg}
                  </span>
                ) : null}
              </div>
            </IslandCard>
          )
        }
      ]}
    />
  );
}

function ProviderKeyRow({
  settingKey,
  label,
  placeholder,
  isSet,
  saved,
  onSave,
  hint
}: {
  settingKey: string;
  label: string;
  placeholder: string;
  isSet: boolean;
  saved: boolean | undefined;
  onSave: (value: string) => void;
  hint?: string;
}) {
  const [value, setValue] = useState("");
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: hint ? 4 : 0,
          flexWrap: "wrap"
        }}
      >
        <span
          style={{
            fontSize: 13,
            color: islandTheme.color.textSecondary,
            minWidth: 200
          }}
        >
          {label}
          {isSet ? (
            <span
              className="island-mono"
              style={{
                marginLeft: 8,
                fontSize: 12,
                color: islandTheme.color.successAccent,
                textTransform: "uppercase",
                letterSpacing: "0.1em"
              }}
            >
              ✓ saved
            </span>
          ) : null}
        </span>
        <input
          style={{
            ...islandInputStyle,
            flex: 1,
            minWidth: 180,
            fontFamily: islandTheme.font.mono,
            letterSpacing: "0.05em"
          }}
          type="password"
          value={value}
          placeholder={isSet ? "••••••••  (saved — enter new to replace)" : placeholder}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          data-1p-ignore="true"
          name={`${settingKey}-input`}
        />
        <IslandButton
          variant="secondary"
          onClick={() => {
            if (value) {
              onSave(value);
              setValue("");
            }
          }}
          disabled={!value || saved}
        >
          {saved ? "Saved" : "Save"}
        </IslandButton>
      </div>
      {hint ? (
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginLeft: 210 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

// ── Nuggie Persona ───────────────────────────────────────────────────────────

export function PersonaAdminPage({
  settings,
  onSave
}: {
  settings: ServerSetting[] | null;
  onSave: (key: string, value: string) => Promise<void> | void;
}) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5, maxWidth: "68ch" }}>
        Nuggie's voice across web chat, Discord, and announcements. Edits land within ~30 seconds of
        saving — test in the Games page crew chat before relying on them in Discord.
      </p>
      <InlineSettings
        keys={inlineSettingKeysFor("persona")}
        settings={settings}
        onSave={onSave}
        title=""
      />
    </div>
  );
}
