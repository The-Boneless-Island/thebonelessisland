import { QuickSwitcher, DayNightProvider } from "@island/web";
import type { GuildMember, CrewOwnedGame } from "@island/web";
import { Stage } from "./_stage";

const noop = () => {};

const member = (
  discordUserId: string,
  username: string,
  displayName: string
): GuildMember => ({
  discordUserId,
  username,
  displayName,
  avatarUrl: null,
  roleNames: ["Crew"],
  inVoice: false,
  richPresenceText: null,
  presenceStatus: "online"
});

const guildMembers: GuildMember[] = [
  member("100000000000000001", "reefrunner", "Reef Runner"),
  member("100000000000000002", "saltwatersam", "Saltwater Sam"),
  member("100000000000000003", "coconutcarl", "Coconut Carl")
];

const game = (
  appId: number,
  name: string,
  owners: number
): CrewOwnedGame => ({
  appId,
  name,
  isSinglePlayer: false,
  isOnlineCoop: true,
  isLanCoop: false,
  isSharedSplitCoop: false,
  isOnlinePvp: false,
  isMmo: false,
  mpMaxPlayersApprox: 4,
  maxPlayers: 4,
  medianSessionMinutes: 75,
  priceFinalCents: 3999,
  priceDiscountPct: 0,
  isFree: false,
  releaseComingSoon: false,
  releaseDateText: "Feb 8, 2024",
  developers: ["Arrowhead"],
  tags: ["Co-op", "Shooter"],
  headerImageUrl: null,
  ownerCount: owners,
  owners: Array.from({ length: owners }, (_, i) => ({
    discordUserId: `2000000000000000${i}`,
    displayName: `Crewmate ${i + 1}`,
    avatarUrl: null
  }))
});

const crewGames: CrewOwnedGame[] = [
  game(553850, "Helldivers 2", 6),
  game(1086940, "Baldur's Gate 3", 4),
  game(739630, "Phasmophobia", 5)
];

// QuickSwitcher renders into a fixed, full-viewport portal (createPortal to
// document.body). The command palette is centred and visible; the card needs a
// single-cell sized viewport to contain it (see learnings/D2.md override note).
export const PaletteDefault = () => (
  <Stage style={{ width: 600, minHeight: 460 }}>
    <DayNightProvider>
      <QuickSwitcher
        open
        onClose={noop}
        isAdmin
        guildMembers={guildMembers}
        crewGames={crewGames}
        onNavigate={noop}
        onOpenProfile={noop}
      />
    </DayNightProvider>
  </Stage>
);

export const PaletteAdmin = () => (
  <Stage style={{ width: 600, minHeight: 460 }}>
    <DayNightProvider>
      <QuickSwitcher
        open
        onClose={noop}
        isAdmin
        guildMembers={guildMembers.slice(0, 2)}
        crewGames={crewGames.slice(0, 2)}
        onNavigate={noop}
        onOpenProfile={noop}
      />
    </DayNightProvider>
  </Stage>
);
