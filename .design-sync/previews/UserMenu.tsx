import { createRef } from "react";
import { UserMenu, DayNightProvider } from "@island/web";
import type { MeProfile } from "@island/web";
import { Stage } from "./_stage";

const noop = () => {};

const baseProfile: MeProfile = {
  discordUserId: "184920018273861632",
  steamVisibility: "members",
  featureOptIn: true,
  username: "reefrunner",
  displayName: "Reef Runner",
  globalName: "Reef Runner",
  avatarUrl: null,
  bannerUrl: null,
  accentColor: null,
  premiumType: 2,
  profileBlurb: "Captain of Tuesday game nights.",
  joinedAtGuild: "2019-03-12T18:04:00.000Z",
  premiumSince: "2021-08-01T00:00:00.000Z",
  steamId64: "76561198000000000",
  steamLastSyncedAt: "2026-06-17T09:12:00.000Z",
  steam: null,
  roleNames: ["Crew", "Game Night Host"],
  inVoice: true,
  richPresenceText: "Helldivers 2 — Spreading democracy",
  nuggieBalance: 4820,
  nuggiesOptedOut: false,
  equippedItems: [],
  guildId: "111111111111111111"
};

// UserMenu renders position:absolute under its anchor, so the Stage needs to be
// a positioning context with room for the dropdown to drop.
function MenuStage({ children, width = 320 }: { children: React.ReactNode; width?: number }) {
  return (
    <Stage style={{ width: width + 48, position: "relative", paddingBottom: 320, paddingTop: 12 }}>
      <DayNightProvider>{children}</DayNightProvider>
    </Stage>
  );
}

export const CrewMemberOpen = () => (
  <MenuStage>
    <UserMenu
      menuRef={createRef<HTMLDivElement>()}
      profile={baseProfile}
      page="home"
      isAdmin={false}
      onClose={noop}
      onNavigate={noop}
      onLogout={noop}
    />
  </MenuStage>
);

export const AdminWithSteamSynced = () => (
  <MenuStage>
    <UserMenu
      menuRef={createRef<HTMLDivElement>()}
      profile={{
        ...baseProfile,
        username: "shorelinemom",
        displayName: "Shoreline Mom",
        richPresenceText: "",
        inVoice: false
      }}
      page="admin"
      isAdmin
      onClose={noop}
      onNavigate={noop}
      onLogout={noop}
    />
  </MenuStage>
);

export const SteamNotSynced = () => (
  <MenuStage>
    <UserMenu
      menuRef={createRef<HTMLDivElement>()}
      profile={{
        ...baseProfile,
        username: "saltwatersam",
        displayName: "Saltwater Sam",
        steamId64: null,
        steam: null,
        richPresenceText: "",
        inVoice: false
      }}
      page="settings"
      isAdmin={false}
      onClose={noop}
      onNavigate={noop}
      onLogout={noop}
    />
  </MenuStage>
);
