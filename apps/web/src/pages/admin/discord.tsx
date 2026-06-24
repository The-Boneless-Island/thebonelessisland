// Discord pages: Guild Identity and Discord Bridge.

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../api/client.js";
import { IslandButton, IslandCard, islandInputStyle } from "../../islandUi.js";
import { islandTheme } from "../../theme.js";
import { RANK_TIERS } from "../../data/rankTiers.js";
import type { ServerSetting } from "../../types.js";
import { AdminStatusBanner, AdminTabs, BannerToggle, InlineSettings, SubsectionTitle } from "./adminUi.js";
import { ADMIN_PAGES, inlineSettingKeysFor } from "./adminNav.js";

// ── Guild Identity ───────────────────────────────────────────────────────────

export function GuildAdminPage({
  settings,
  onSave
}: {
  settings: ServerSetting[] | null;
  onSave: (key: string, value: string) => Promise<void> | void;
}) {
  const getSetting = (key: string) => settings?.find((s) => s.key === key);
  const currentGuildId = getSetting("discord_guild_id");
  const displayName = getSetting("guild_display_name");
  const serverLabel = displayName?.value || currentGuildId?.value || "Not configured";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <AdminStatusBanner
        accent="#818cf8"
        icon="🪪"
        kicker="Currently pointed at"
        title={serverLabel}
        subtitle={
          currentGuildId?.envDefault && !currentGuildId?.value
            ? `Using env fallback: ${currentGuildId.envDefault}`
            : undefined
        }
      />

      <IslandCard
        style={{
          padding: "12px 16px",
          background: "rgba(245, 158, 11, 0.1)",
          border: "1px solid rgba(245, 158, 11, 0.35)"
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span>⚠️</span>
          <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.warnAccent, lineHeight: 1.5 }}>
            Changing the <strong>Guild ID</strong> takes effect immediately on the next request —
            all member sync, role checks, and crew data will point to the new server.
            Run a member sync after switching to populate the new guild's roster.
          </p>
        </div>
      </IslandCard>

      <InlineSettings
        keys={inlineSettingKeysFor("guild")}
        settings={settings}
        onSave={onSave}
        title=""
      />
    </div>
  );
}

// ── Discord Bridge ───────────────────────────────────────────────────────────
// Surfaces the milestone_announcements_* + milestone_role_rank_* settings.
// Until configured, the bot's milestone announcer is a no-op (silently marks
// outbox rows processed without posting or role-grant).

// Accent comes from the nav registry — one source for sidebar, search, and page chrome.
const ACCENT = ADMIN_PAGES["bridge"].accent;

export function BridgeAdminPage({
  settings,
  onUpdate,
}: {
  settings: ServerSetting[] | null;
  onUpdate: (key: string, value: string) => void;
}) {
  const getSetting = (key: string) => settings?.find((s) => s.key === key)?.value ?? "";

  const [enabled, setEnabled] = useState(() => getSetting("milestone_announcements_enabled") === "true");
  const [channelDraft, setChannelDraft] = useState(() => getSetting("milestone_channel_id"));
  const [officialEnabled, setOfficialEnabled] = useState(() => getSetting("official_announcements_enabled") === "true");
  const [officialChannelDraft, setOfficialChannelDraft] = useState(() => getSetting("official_announcements_channel_id"));
  const [officialPingEveryone, setOfficialPingEveryone] = useState(() => getSetting("official_announcements_ping_everyone") === "true");
  const [patchEnabled, setPatchEnabled] = useState(() => getSetting("patch_alerts_enabled") === "true");
  const [patchChannelDraft, setPatchChannelDraft] = useState(() => getSetting("patch_notes_channel_id"));
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>(() => {
    const drafts: Record<string, string> = {};
    for (let i = 1; i <= 8; i++) {
      const key = `milestone_role_rank_${String(i).padStart(2, "0")}`;
      drafts[key] = getSetting(key);
    }
    return drafts;
  });
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const initializedRef = useRef(false);

  useEffect(() => {
    if (settings && !initializedRef.current) {
      setEnabled(getSetting("milestone_announcements_enabled") === "true");
      setChannelDraft(getSetting("milestone_channel_id"));
      setOfficialEnabled(getSetting("official_announcements_enabled") === "true");
      setOfficialChannelDraft(getSetting("official_announcements_channel_id"));
      setOfficialPingEveryone(getSetting("official_announcements_ping_everyone") === "true");
      setPatchEnabled(getSetting("patch_alerts_enabled") === "true");
      setPatchChannelDraft(getSetting("patch_notes_channel_id"));
      const drafts: Record<string, string> = {};
      for (let i = 1; i <= 8; i++) {
        const key = `milestone_role_rank_${String(i).padStart(2, "0")}`;
        drafts[key] = getSetting(key);
      }
      setRoleDrafts(drafts);
      initializedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const save = (key: string, value: string) => {
    onUpdate(key, value);
    setSaved((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setSaved((prev) => ({ ...prev, [key]: false })), 2200);
  };

  if (settings === null) {
    return (
      <IslandCard style={{ padding: 20 }}>
        <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textMuted }}>Loading settings…</p>
      </IslandCard>
    );
  }

  const channelDirty = channelDraft.trim() !== getSetting("milestone_channel_id");
  const configured = enabled && getSetting("milestone_channel_id").trim().length > 0;
  const officialChannelDirty = officialChannelDraft.trim() !== getSetting("official_announcements_channel_id");
  const officialConfigured = officialEnabled && getSetting("official_announcements_channel_id").trim().length > 0;
  const patchChannelDirty = patchChannelDraft.trim() !== getSetting("patch_notes_channel_id");
  const patchConfigured = patchEnabled && getSetting("patch_notes_channel_id").trim().length > 0;

  return (
    <AdminTabs
      page="bridge"
      tabs={[
        {
          anchor: "bridge-channel",
          label: "Milestones",
          content: (
            <>
              <AdminStatusBanner
                accent={ACCENT}
                icon="🌉"
                kicker="Discord Bridge"
                title={configured ? "Milestone announcements live" : "Milestone announcements OFF"}
                subtitle={
                  enabled
                    ? getSetting("milestone_channel_id")
                      ? `Posting to channel ${getSetting("milestone_channel_id")}`
                      : "Toggle ON but no channel set — bot will skip posts"
                    : "Bot will not post tier reaches to any channel"
                }
                control={
                  <BannerToggle
                    on={enabled}
                    onToggle={() => {
                      const next = !enabled;
                      setEnabled(next);
                      save("milestone_announcements_enabled", next ? "true" : "false");
                    }}
                  />
                }
              />

              <IslandCard style={{ padding: "16px 18px" }}>
                <SubsectionTitle>Announcement Channel</SubsectionTitle>
                <p style={{ margin: "0 0 12px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
                  Discord channel ID where the bot posts when a member crosses a rank threshold.
                  Enable Developer Mode in Discord (User Settings → Advanced), then right-click the channel and choose <strong>Copy ID</strong>.
                </p>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={channelDraft}
                    onChange={(e) => setChannelDraft(e.target.value)}
                    placeholder="1234567890123456789"
                    className="island-mono"
                    style={{
                      ...islandInputStyle,
                      flex: "1 1 240px",
                      maxWidth: 360,
                      fontSize: 13,
                    }}
                  />
                  <IslandButton
                    variant="secondary"
                    onClick={() => save("milestone_channel_id", channelDraft.trim())}
                    disabled={!channelDirty || saved["milestone_channel_id"]}
                  >
                    {saved["milestone_channel_id"] ? "Saved" : "Save Channel"}
                  </IslandButton>
                </div>
              </IslandCard>
            </>
          ),
        },
        {
          anchor: "bridge-roles",
          label: "Roles",
          content: (
            <IslandCard style={{ padding: "16px 18px" }}>
              <SubsectionTitle>Tier Roles (Optional)</SubsectionTitle>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
                Discord role ID auto-assigned when a member reaches each tier. Lower tier roles are
                automatically removed as members climb the ladder, so each member only carries their highest rank.
                Leave blank to skip role assignment for a tier. The bot needs <strong>Manage Roles</strong>{" "}
                and must sit above these roles in the role hierarchy.
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: 10,
                }}
              >
                {RANK_TIERS.map((tier, i) => {
                  const key = `milestone_role_rank_${String(i + 1).padStart(2, "0")}`;
                  const draft = roleDrafts[key] ?? "";
                  const stored = getSetting(key);
                  const dirty = draft.trim() !== stored;
                  return (
                    <div
                      key={key}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        background: islandTheme.color.panelMutedBg,
                        border: `1px solid ${islandTheme.color.cardBorder}`,
                        display: "grid",
                        gap: 6,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 18 }}>{tier.emblem}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="island-mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em" }}>
                            {tier.label}
                          </div>
                          <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
                            ₦{tier.threshold.toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={draft}
                          onChange={(e) =>
                            setRoleDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          placeholder="role ID (optional)"
                          className="island-mono"
                          style={{
                            ...islandInputStyle,
                            flex: 1,
                            fontSize: 12,
                            padding: "6px 8px",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => save(key, draft.trim())}
                          disabled={!dirty || saved[key]}
                          className="island-mono"
                          style={{
                            padding: "0 10px",
                            borderRadius: 6,
                            border: `1px solid ${dirty ? ACCENT : islandTheme.color.cardBorder}`,
                            background: dirty ? `${ACCENT}22` : "transparent",
                            color: dirty ? ACCENT : islandTheme.color.textMuted,
                            fontSize: 12,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            cursor: dirty ? "pointer" : "default",
                            font: "inherit",
                          }}
                        >
                          {saved[key] ? "Saved" : "Save"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </IslandCard>
          ),
        },
        {
          anchor: "bridge-official",
          label: "Official Announcements",
          content: (
            <>
              <AdminStatusBanner
                accent={ACCENT}
                icon="📣"
                kicker="Official Announcements"
                title={officialConfigured ? "Forum → Discord bridge live" : "Official announcements OFF"}
                subtitle={
                  officialEnabled
                    ? getSetting("official_announcements_channel_id")
                      ? `Posting to channel ${getSetting("official_announcements_channel_id")}`
                      : "Toggle ON but no channel set — bot will skip posts"
                    : "Forum posts in bridged categories won't push to Discord"
                }
                control={
                  <BannerToggle
                    on={officialEnabled}
                    onToggle={() => {
                      const next = !officialEnabled;
                      setOfficialEnabled(next);
                      save("official_announcements_enabled", next ? "true" : "false");
                    }}
                  />
                }
              />

              <IslandCard style={{ padding: "16px 18px" }}>
                <SubsectionTitle>Announcement Channel</SubsectionTitle>
                <p style={{ margin: "0 0 12px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
                  Discord channel ID where official forum posts from the Announcements category land.
                  Enable Developer Mode in Discord (User Settings → Advanced), then right-click the channel and choose <strong>Copy ID</strong>.
                </p>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={officialChannelDraft}
                    onChange={(e) => setOfficialChannelDraft(e.target.value)}
                    placeholder="1234567890123456789"
                    className="island-mono"
                    style={{
                      ...islandInputStyle,
                      flex: "1 1 240px",
                      maxWidth: 360,
                      fontSize: 13,
                    }}
                  />
                  <IslandButton
                    variant="secondary"
                    onClick={() => save("official_announcements_channel_id", officialChannelDraft.trim())}
                    disabled={!officialChannelDirty || saved["official_announcements_channel_id"]}
                  >
                    {saved["official_announcements_channel_id"] ? "Saved" : "Save Channel"}
                  </IslandButton>
                </div>
              </IslandCard>

              <IslandCard style={{ padding: "16px 18px" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={officialPingEveryone}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setOfficialPingEveryone(next);
                      save("official_announcements_ping_everyone", next ? "true" : "false");
                    }}
                  />
                  <span>
                    <strong>Optional @everyone ping</strong>
                    <span style={{ display: "block", marginTop: 2, fontSize: 12, color: islandTheme.color.textSubtle, fontWeight: 400 }}>
                      Off by default — crew can rely on channel notification settings instead.
                    </span>
                  </span>
                </label>
              </IslandCard>
            </>
          ),
        },
        {
          anchor: "bridge-patches",
          label: "Patch Alerts",
          content: (
            <>
              <AdminStatusBanner
                accent={ACCENT}
                icon="🔗"
                kicker="Patch Alerts"
                title={patchConfigured ? "Patch alerts live" : "Patch alerts OFF"}
                subtitle={
                  patchEnabled
                    ? getSetting("patch_notes_channel_id")
                      ? `Posting to channel ${getSetting("patch_notes_channel_id")}`
                      : "Toggle ON but no channel set — bot will skip posts"
                    : "Crew-library patch notes won't push to Discord"
                }
                control={
                  <BannerToggle
                    on={patchEnabled}
                    onToggle={() => {
                      const next = !patchEnabled;
                      setPatchEnabled(next);
                      save("patch_alerts_enabled", next ? "true" : "false");
                    }}
                  />
                }
              />

              <IslandCard style={{ padding: "16px 18px" }}>
                <SubsectionTitle>Patch Notes Channel</SubsectionTitle>
                <p style={{ margin: "0 0 12px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
                  Discord channel ID where new patch notes for crew-library games are posted.
                  Enable Developer Mode in Discord (User Settings → Advanced), then right-click the channel and choose <strong>Copy ID</strong>.
                </p>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={patchChannelDraft}
                    onChange={(e) => setPatchChannelDraft(e.target.value)}
                    placeholder="1234567890123456789"
                    className="island-mono"
                    style={{
                      ...islandInputStyle,
                      flex: "1 1 240px",
                      maxWidth: 360,
                      fontSize: 13,
                    }}
                  />
                  <IslandButton
                    variant="secondary"
                    onClick={() => save("patch_notes_channel_id", patchChannelDraft.trim())}
                    disabled={!patchChannelDirty || saved["patch_notes_channel_id"]}
                  >
                    {saved["patch_notes_channel_id"] ? "Saved" : "Save Channel"}
                  </IslandButton>
                </div>
              </IslandCard>

              <PatchAlertRolesPanel />
            </>
          ),
        },
      ]}
    />
  );
}

type PatchAlertRoleRow = {
  appId: number;
  discordRoleId: string;
  gameName: string;
};

function PatchAlertRolesPanel() {
  const [rows, setRows] = useState<PatchAlertRoleRow[] | null>(null);
  const [appIdDraft, setAppIdDraft] = useState("");
  const [roleDraft, setRoleDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    apiFetch("/patch-alerts/roles")
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d?.roles) ? d.roles : []))
      .catch(() => setRows([]));

  useEffect(() => {
    void load();
  }, []);

  async function addMapping() {
    const appId = parseInt(appIdDraft.trim(), 10);
    const discordRoleId = roleDraft.trim();
    if (!Number.isFinite(appId) || !discordRoleId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch(`/patch-alerts/roles/${appId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ discordRoleId }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        throw new Error(d?.error ?? "Save failed");
      }
      setAppIdDraft("");
      setRoleDraft("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeMapping(appId: number) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/patch-alerts/roles/${appId}`, { method: "DELETE" });
      await load();
    } catch {
      setError("Remove failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <IslandCard style={{ padding: "16px 18px" }}>
      <SubsectionTitle>Game Role Pings (optional)</SubsectionTitle>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
        Map a Steam <code>app_id</code> to a Discord role ID. When that game patches, Nuggie pings the role.
        Members opt in by picking the role in Discord.
      </p>
      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            inputMode="numeric"
            value={appIdDraft}
            onChange={(e) => setAppIdDraft(e.target.value)}
            placeholder="Steam app_id"
            className="island-mono"
            style={{ ...islandInputStyle, flex: "1 1 120px", maxWidth: 160, fontSize: 13 }}
          />
          <input
            type="text"
            inputMode="numeric"
            value={roleDraft}
            onChange={(e) => setRoleDraft(e.target.value)}
            placeholder="Discord role ID"
            className="island-mono"
            style={{ ...islandInputStyle, flex: "2 1 200px", maxWidth: 280, fontSize: 13 }}
          />
          <IslandButton variant="secondary" onClick={() => void addMapping()} disabled={busy}>
            Add mapping
          </IslandButton>
        </div>
        {error ? <p style={{ margin: 0, fontSize: 12, color: islandTheme.color.dangerText }}>{error}</p> : null}
      </div>
      {rows === null ? (
        <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textMuted }}>Loading mappings…</p>
      ) : rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textMuted }}>No role mappings yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((row) => (
            <div
              key={row.appId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 8,
                background: islandTheme.color.panelMutedBg,
                border: `1px solid ${islandTheme.color.cardBorder}`,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{row.gameName}</div>
                <div className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted }}>
                  app {row.appId} → role {row.discordRoleId}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void removeMapping(row.appId)}
                disabled={busy}
                style={{
                  background: "transparent",
                  border: `1px solid ${islandTheme.color.danger}`,
                  color: islandTheme.color.dangerText,
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 12,
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </IslandCard>
  );
}
