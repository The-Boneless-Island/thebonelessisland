import { useMemo } from "react";
import { IslandButton, IslandCard, islandInputStyle } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import type { MeProfile, OwnedGameLite } from "../types.js";
import { SteamLogo, steamColors, steamSignInUrl } from "../components/steam.js";

type SteamVisibility = "private" | "members" | "public";

type SettingsPageProps = {
  profileData: MeProfile | null;
  steamVisibility: SteamVisibility;
  onSteamVisibilityChange: (value: SteamVisibility) => void;
  ownedGames: OwnedGameLite[];
  ownedGameSearch: string;
  onOwnedGameSearchChange: (value: string) => void;
  excludedOwnedGameAppIds: number[];
  onToggleExcludedOwnedGame: (appId: number) => void;
  featureOptIn: boolean;
  onFeatureOptInChange: (value: boolean) => void;
  onSave: () => void;
  onSyncSteam: () => void;
  onLinkSteam: () => void;
};

export function SettingsPage({
  profileData,
  steamVisibility,
  onSteamVisibilityChange,
  ownedGames,
  ownedGameSearch,
  onOwnedGameSearchChange,
  excludedOwnedGameAppIds,
  onToggleExcludedOwnedGame,
  featureOptIn,
  onFeatureOptInChange,
  onSave,
  onSyncSteam,
  onLinkSteam
}: SettingsPageProps) {
  const filteredOwnedGames = useMemo(() => {
    const query = ownedGameSearch.trim().toLowerCase();
    if (!query) return ownedGames;
    return ownedGames.filter((game) => game.name.toLowerCase().includes(query));
  }, [ownedGames, ownedGameSearch]);

  const steamLinked = Boolean(profileData?.steamId64);

  return (
    <IslandCard style={{ marginTop: 10 }}>
      <h2 style={{ marginTop: 0 }}>Account Settings</h2>
      <p style={{ marginTop: 0, opacity: 0.9, ...islandTheme.prose.readable }}>
        Manage your account preferences, Steam connection, and privacy options.
      </p>

      {/* ── Steam ── */}
      <IslandCard as="div" style={{ marginTop: 8, maxWidth: islandTheme.layout.formMaxWidth }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Steam</h3>
        {steamLinked ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              borderRadius: 10,
              background: `linear-gradient(180deg, ${steamColors.dark2} 0%, ${steamColors.dark} 100%)`,
              border: `1px solid rgba(102, 192, 244, 0.3)`,
              marginBottom: 12
            }}
          >
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "rgba(102, 192, 244, 0.12)",
                border: `1px solid rgba(102, 192, 244, 0.25)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
            >
              <SteamLogo size={20} tone="light" />
            </span>
            <div style={{ flex: 1 }}>
              <div
                className="island-mono"
                style={{ fontSize: 10, letterSpacing: "0.14em", color: steamColors.blue, fontWeight: 700, textTransform: "uppercase" }}
              >
                Steam
              </div>
              <div style={{ fontSize: 14, color: "#fff", fontWeight: 600, marginTop: 1 }}>Connected</div>
            </div>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: islandTheme.color.successAccent,
                flexShrink: 0
              }}
            />
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              borderRadius: 10,
              background: islandTheme.color.panelMutedBg,
              border: `1px solid ${islandTheme.color.cardBorder}`,
              marginBottom: 12
            }}
          >
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: islandTheme.color.panelMutedBg,
                border: `1px solid ${islandTheme.color.cardBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
            >
              <SteamLogo size={20} tone="light" />
            </span>
            <div style={{ flex: 1 }}>
              <div
                className="island-mono"
                style={{ fontSize: 10, letterSpacing: "0.14em", color: islandTheme.color.textMuted, fontWeight: 700, textTransform: "uppercase" }}
              >
                Steam
              </div>
              <div style={{ fontSize: 14, color: islandTheme.color.textSubtle, fontWeight: 600, marginTop: 1 }}>Not connected</div>
            </div>
          </div>
        )}

        {steamLinked ? (
          <IslandButton variant="secondary" onClick={onSyncSteam}>
            Sync Steam library
          </IslandButton>
        ) : (
          <a
            href={steamSignInUrl()}
            onClick={onLinkSteam}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              borderRadius: 8,
              background: `linear-gradient(180deg, ${steamColors.dark2} 0%, ${steamColors.dark} 100%)`,
              border: `1px solid rgba(102, 192, 244, 0.35)`,
              color: "#fff",
              fontWeight: 600,
              fontSize: 13,
              textDecoration: "none",
              cursor: "pointer"
            }}
          >
            <SteamLogo size={15} tone="light" />
            Sign in through Steam
          </a>
        )}
      </IslandCard>

      {/* ── Privacy & Library ── */}
      <IslandCard as="div" style={{ marginTop: 8, maxWidth: islandTheme.layout.formMaxWidth }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Privacy &amp; Library</h3>
        <p style={{ marginTop: 0, marginBottom: 8 }}>Steam library visibility</p>
        <select
          value={steamVisibility}
          onChange={(event) => onSteamVisibilityChange(event.target.value as SteamVisibility)}
          style={{ ...islandInputStyle, width: "100%" }}
        >
          <option value="private">Private (only you)</option>
          <option value="members">Members only</option>
          <option value="public">Public</option>
        </select>

        <p style={{ marginTop: 12, marginBottom: 8 }}>Exclude owned games from public visibility</p>
        <input
          value={ownedGameSearch}
          onChange={(event) => onOwnedGameSearchChange(event.target.value)}
          placeholder="Search your owned games"
          style={{ ...islandInputStyle, width: "100%" }}
        />
        <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, opacity: 0.82 }}>
          Library visibility and game list update automatically while you're online.
        </p>
        {profileData?.steamId64 ? (
          <div
            style={{
              marginTop: 8,
              border: `1px solid ${islandTheme.color.border}`,
              borderRadius: islandTheme.radius.control,
              padding: "0.55rem",
              maxHeight: 220,
              overflowY: "auto",
              background: islandTheme.color.panelMutedBg
            }}
          >
            {filteredOwnedGames.length ? (
              filteredOwnedGames.slice(0, 120).map((game) => (
                <label
                  key={game.appId}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "0.24rem 0" }}
                >
                  <input
                    type="checkbox"
                    checked={excludedOwnedGameAppIds.includes(game.appId)}
                    onChange={() => onToggleExcludedOwnedGame(game.appId)}
                  />
                  <span>{game.name}</span>
                </label>
              ))
            ) : (
              <p style={{ margin: 0, opacity: 0.85 }}>
                No matching games. Steam updates automatically while online.
              </p>
            )}
          </div>
        ) : (
          <p style={{ marginTop: 8, marginBottom: 0, opacity: 0.85 }}>
            Link and sync Steam first to choose games from your library.
          </p>
        )}
        <p style={{ marginTop: 6, marginBottom: 0, fontSize: 12, opacity: 0.8 }}>
          Selected exclusions: {excludedOwnedGameAppIds.length}
        </p>
      </IslandCard>

      {/* ── Preferences ── */}
      <IslandCard as="div" style={{ marginTop: 8, maxWidth: islandTheme.layout.formMaxWidth }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Preferences</h3>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={featureOptIn}
            onChange={(event) => onFeatureOptInChange(event.target.checked)}
          />
          Participate in optional feature previews
        </label>
      </IslandCard>

      <p style={{ marginBottom: 0 }}>
        <IslandButton variant="primary" onClick={onSave} style={{ marginTop: 10 }}>
          Save Settings
        </IslandButton>
      </p>
    </IslandCard>
  );
}
