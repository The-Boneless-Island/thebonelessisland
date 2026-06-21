// Discord pages: Guild Identity and Discord Bridge.

import { useEffect, useRef, useState } from "react";
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
const ACCENT = ADMIN_PAGES["guild"].accent;

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

  return (
    <AdminTabs
      page="bridge"
      tabs={[
        {
          anchor: "bridge-channel",
          label: "Channel",
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
      ]}
    />
  );
}
