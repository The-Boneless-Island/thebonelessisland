import { useMemo, useState } from "react";
import { IslandButton, IslandCard, islandInputStyle } from "../islandUi.js";
import { NuggieBadge } from "../components/NuggieBadge.js";
import { MilestoneRankBadge } from "../components/MilestoneRankBadge.js";
import { islandTheme } from "../theme.js";
import { apiFetch } from "../api/client.js";
import { putClientState } from "../api/clientState.js";
import type { MeProfile, OwnedGameLite } from "../types.js";

type SteamVisibility = "private" | "members" | "public";

// One-time consent so "shared by default" stays trustworthy: a member who has
// never acknowledged sharing sees a clear notice while Crew-shared.
function SteamShareConsent({
  visibility,
  clientState,
}: {
  visibility: SteamVisibility;
  clientState?: Record<string, unknown>;
}) {
  const [ack, setAck] = useState(() => Boolean(clientState?.steam_share_ack));
  if (visibility === "private" || ack) return null;
  return (
    <div
      style={{
        marginBottom: 10,
        padding: "10px 12px",
        borderRadius: 8,
        background: islandTheme.color.panelMutedBg,
        border: `1px solid ${islandTheme.color.primaryGlow}`,
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap"
      }}
    >
      <span style={{ fontSize: 13, flex: 1, minWidth: 200, lineHeight: 1.45 }}>
        🔓 Your Steam library is <strong>shared with the crew</strong> — what you own, your playtime,
        and achievements appear in crew features. Switch to Private or hide individual games below anytime.
      </span>
      <IslandButton
        variant="secondary"
        onClick={() => {
          setAck(true);
          void putClientState("steam_share_ack", true);
        }}
      >
        Got it
      </IslandButton>
    </div>
  );
}

// Site-native "about me" — Discord does not expose the real bio via any API, so
// the crew gets an editable blurb instead. Self-contained PATCH so it doesn't
// need to thread through the parent's bulk save.
function ProfileBlurbEditor({ initialBlurb, disabled }: { initialBlurb: string; disabled: boolean }) {
  const [blurb, setBlurb] = useState(initialBlurb);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(false);

  async function save() {
    setSaving(true);
    setSavedAt(false);
    try {
      const res = await apiFetch("/profile/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ profileBlurb: blurb })
      });
      if (res.ok) setSavedAt(true);
    } catch {
      // leave as-is; user can retry
    } finally {
      setSaving(false);
    }
  }

  return (
    <IslandCard as="div" style={{ marginTop: 8 }}>
      <h3 style={{ marginTop: 0, marginBottom: 4 }}>About you</h3>
      <p style={{ marginTop: 0, marginBottom: 8, fontSize: 12, opacity: 0.82 }}>
        A short blurb shown on your islander profile. Discord doesn't share bios, so this is your spot.
      </p>
      <textarea
        value={blurb}
        disabled={disabled}
        maxLength={280}
        onChange={(e) => {
          setBlurb(e.target.value);
          setSavedAt(false);
        }}
        placeholder="Couch co-op enjoyer. Will tower defense for snacks."
        style={{ ...islandInputStyle, width: "100%", minHeight: 72, resize: "vertical", fontFamily: "inherit" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
        <IslandButton variant="primary" onClick={save} disabled={disabled || saving}>
          {saving ? "Saving…" : "Save blurb"}
        </IslandButton>
        <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
          {savedAt ? "Saved ✓" : `${blurb.length}/280`}
        </span>
      </div>
    </IslandCard>
  );
}

type ProfilePageProps = {
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
};

export function ProfilePage({
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
  onSave
}: ProfilePageProps) {
  const filteredOwnedGames = useMemo(() => {
    const query = ownedGameSearch.trim().toLowerCase();
    if (!query) return ownedGames;
    return ownedGames.filter((game) => game.name.toLowerCase().includes(query));
  }, [ownedGames, ownedGameSearch]);

  async function handleUnlinkSteam() {
    if (!window.confirm("Unlink your Steam account? You can always link it again later.")) return;
    try {
      const response = await apiFetch("/steam/unlink", { method: "POST", credentials: "include" });
      if (!response.ok) return;
      // Re-run the same profile load the app does on mount so the unlinked state shows.
      window.location.reload();
    } catch {
      // Leave the page unchanged on failure; the user can retry.
    }
  }

  return (
    <IslandCard style={{ marginTop: 10 }}>
      <h2 style={{ marginTop: 0 }}>User Profile Settings</h2>
      <p style={{ marginTop: 0, opacity: 0.9, ...islandTheme.prose.readable }}>
        Manage your personal account preferences and privacy options.
      </p>

      <IslandCard as="div" style={{ marginTop: 8, padding: 0, overflow: "hidden" }}>
        {profileData?.bannerUrl ? (
          <div
            role="img"
            aria-label="Your Discord banner"
            style={{ height: 88, background: `url("${profileData.bannerUrl}") center/cover` }}
          />
        ) : profileData?.accentColor != null ? (
          <div
            style={{
              height: 56,
              background: `linear-gradient(135deg, #${(profileData.accentColor & 0xffffff)
                .toString(16)
                .padStart(6, "0")}, ${islandTheme.color.panelMutedBg})`
            }}
          />
        ) : null}
        <div style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Account</h3>
        <p style={{ marginTop: 0, marginBottom: 4 }}>
          <strong>Display Name:</strong> {profileData?.displayName ?? "Not signed in"}
        </p>
        <p style={{ marginTop: 0, marginBottom: 0 }}>
          <strong>Discord Username:</strong> @{profileData?.username ?? "unknown"}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
          {profileData?.joinedAtGuild
            ? (() => {
                const d = new Date(profileData.joinedAtGuild);
                const txt = Number.isNaN(d.getTime())
                  ? null
                  : d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
                return txt ? (
                  <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
                    ⚓ Islander since {txt}
                  </span>
                ) : null;
              })()
            : null}
          {profileData?.premiumSince ? (
            <span className="island-mono" style={{ fontSize: 12, color: "#f472b6" }}>
              💎 Server Booster
            </span>
          ) : null}
        </div>
        {profileData?.steam ? (
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              padding: "8px 10px",
              borderRadius: 8,
              background: islandTheme.color.panelMutedBg,
              border: `1px solid ${islandTheme.color.border}`
            }}
          >
            {profileData.steam.avatarUrl ? (
              <img
                src={profileData.steam.avatarUrl}
                alt=""
                style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }}
              />
            ) : null}
            <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {profileData.steam.personaName ?? "Steam"}
                {profileData.steam.inGame ? (
                  <span style={{ color: islandTheme.color.successAccent, fontWeight: 600 }}>
                    {" "}· 🎮 {profileData.steam.inGame}
                  </span>
                ) : null}
              </span>
              <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
                {[
                  typeof profileData.steam.level === "number" ? `Level ${profileData.steam.level}` : null,
                  profileData.steam.accountCreated
                    ? `Since ${new Date(profileData.steam.accountCreated).getFullYear()}`
                    : null
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            {profileData.steam.profileUrl ? (
              <a
                href={profileData.steam.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="island-mono"
                style={{ marginLeft: "auto", fontSize: 12, color: islandTheme.color.primaryGlow, textDecoration: "none" }}
              >
                View on Steam ↗
              </a>
            ) : null}
          </div>
        ) : null}
        {profileData?.steamId64 ? (
          <p style={{ marginTop: 10, marginBottom: 0 }}>
            <IslandButton
              variant="secondary"
              onClick={handleUnlinkSteam}
              style={{
                background: "transparent",
                color: islandTheme.color.danger,
                borderColor: islandTheme.color.danger,
                fontWeight: 600
              }}
            >
              Unlink Steam
            </IslandButton>
          </p>
        ) : null}
        </div>
      </IslandCard>

      <ProfileBlurbEditor initialBlurb={profileData?.profileBlurb ?? ""} disabled={!profileData} />

      {profileData && !profileData.nuggiesOptedOut && (
        <IslandCard as="div" style={{ marginTop: 8 }}>
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>Nuggies</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <MilestoneRankBadge lifetimeEarned={profileData.lifetimeEarned} size={44} />
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              ₦{profileData.nuggieBalance.toLocaleString()}
              <span style={{ fontSize: 14, fontWeight: 400, color: islandTheme.color.textMuted, marginLeft: 6 }}>Nuggies</span>
            </div>
            {profileData.equippedItems.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {profileData.equippedItems.map((item) => (
                  <NuggieBadge key={item.id} item={item} size="sm" />
                ))}
              </div>
            )}
          </div>
        </IslandCard>
      )}

      <IslandCard as="div" style={{ marginTop: 8 }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Privacy & Library Preferences</h3>
        <SteamShareConsent visibility={steamVisibility} clientState={profileData?.clientState} />
        <p style={{ marginTop: 0, marginBottom: 8 }}>Steam library visibility</p>
        <select
          value={steamVisibility === "public" ? "members" : steamVisibility}
          onChange={(event) => onSteamVisibilityChange(event.target.value as SteamVisibility)}
          style={{ ...islandInputStyle, width: "100%" }}
        >
          <option value="members">Crew-shared — visible to the crew</option>
          <option value="private">Private — only you</option>
        </select>
        <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, opacity: 0.82 }}>
          Crew-shared lets your library, playtime, and achievements appear in crew features. Private
          hides all of it from everyone but you.
        </p>

        <p style={{ marginTop: 12, marginBottom: 8 }}>Hide individual games from the crew</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={ownedGameSearch}
            onChange={(event) => onOwnedGameSearchChange(event.target.value)}
            placeholder="Search your owned games"
            style={{ ...islandInputStyle, flex: 1, minWidth: 240 }}
          />
        </div>
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
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "0.24rem 0"
                  }}
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
                No matching games yet. Steam updates automatically while online.
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

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={featureOptIn}
            onChange={(event) => onFeatureOptInChange(event.target.checked)}
          />
          Participate in optional feature previews
        </label>

        <p style={{ marginBottom: 0 }}>
          <IslandButton variant="primary" onClick={onSave} style={{ marginTop: 10 }}>
            Save Profile Settings
          </IslandButton>
        </p>
      </IslandCard>
    </IslandCard>
  );
}
