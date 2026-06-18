import type { ReactNode } from "react";
import { MemoryRouter } from "@island/web";
import { Topbar, DayNightProvider } from "@island/web";
import { Stage } from "./_stage";

const noop = () => {};

const captain = {
  discordUserId: "204931882947100672",
  steamVisibility: "members" as const,
  featureOptIn: true,
  username: "captainnugget",
  displayName: "Captain Nugget",
  globalName: "Captain Nugget",
  avatarUrl: null,
  bannerUrl: null,
  accentColor: 0xf6a623,
  premiumType: 2,
  profileBlurb: "Saucing up game nights since the dial-up days.",
  joinedAtGuild: "2019-04-12T18:30:00.000Z",
  premiumSince: "2021-08-01T00:00:00.000Z",
  steamId64: "76561198001234567",
  steamLastSyncedAt: "2026-06-17T09:14:00.000Z",
  steam: {
    personaName: "CaptainNugget",
    avatarUrl: null,
    profileUrl: "https://steamcommunity.com/id/captainnugget",
    personaState: 1,
    inGame: "Deep Rock Galactic",
    level: 84,
    accountCreated: "2008-03-02T00:00:00.000Z",
  },
  roleNames: ["Crew", "Game Night Host"],
  inVoice: true,
  richPresenceText: "Mining for Nuggies",
  nuggieBalance: 14820,
  nuggiesOptedOut: false,
  equippedItems: [],
  guildId: "204931882947100000",
};

function Shell({ children }: { children: ReactNode }) {
  return (
    <Stage style={{ width: 980 }} pad={0}>
      <MemoryRouter>
        <DayNightProvider>
          <div style={{ position: "relative", height: 64 }}>{children}</div>
        </DayNightProvider>
      </MemoryRouter>
    </Stage>
  );
}

export const CrewMember = () => (
  <Shell>
    <Topbar
      page="library"
      onNavigate={noop}
      profile={captain}
      isAdmin={false}
      tagline="crew at the shoreline"
      onLogout={noop}
      onOpenSearch={noop}
    />
  </Shell>
);

export const AdminWithSearch = () => (
  <Shell>
    <Topbar
      page="admin"
      onNavigate={noop}
      profile={{ ...captain, displayName: "Reef Ranger", username: "reefranger", inVoice: false }}
      isAdmin={true}
      tagline="captain on deck"
      onLogout={noop}
      onOpenSearch={noop}
    />
  </Shell>
);

export const SignedOut = () => (
  <Shell>
    <Topbar
      page="home"
      onNavigate={noop}
      profile={null}
      isAdmin={false}
      tagline="washed up at the shore"
      onLogout={noop}
    />
  </Shell>
);
