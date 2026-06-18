import { PosterCard, PosterWall, IslandTag } from "@island/web";
import { Stage } from "./_stage";

const crew = [
  { discordUserId: "100", displayName: "Reef", avatarUrl: null },
  { discordUserId: "101", displayName: "Mango", avatarUrl: null },
  { discordUserId: "102", displayName: "Coco", avatarUrl: null }
];

export const CoopOwned = () => (
  <Stage style={{ width: 200 }}>
    <PosterWall>
      <PosterCard
        appId={548430}
        name="Deep Rock Galactic"
        category="co-op"
        capabilities={{
          isSinglePlayer: false,
          isOnlineCoop: true,
          isLanCoop: false,
          isSharedSplitCoop: false,
          isOnlinePvp: false,
          isMmo: false,
          mpMaxPlayersApprox: 4,
          tags: ["Co-op", "Mining"]
        }}
        owners={crew}
        caption="5 own · 2 online"
        onDetails={() => {}}
      />
    </PosterWall>
  </Stage>
);

export const HorrorWishlist = () => (
  <Stage style={{ width: 200 }}>
    <PosterWall>
      <PosterCard
        appId={1966720}
        name="Lethal Company"
        category="horror"
        capabilities={{
          isSinglePlayer: false,
          isOnlineCoop: true,
          isLanCoop: false,
          isSharedSplitCoop: false,
          isOnlinePvp: false,
          isMmo: false,
          mpMaxPlayersApprox: 4,
          tags: ["Horror", "Co-op"]
        }}
        owners={crew.slice(0, 2)}
        caption="3 want"
        badges={<IslandTag>SOON</IslandTag>}
      />
    </PosterWall>
  </Stage>
);

export const SoloNoArt = () => (
  <Stage style={{ width: 200 }}>
    <PosterWall>
      <PosterCard
        appId={1245620}
        name="Elden Ring"
        category="solo"
        capabilities={{
          isSinglePlayer: true,
          isOnlineCoop: true,
          isLanCoop: false,
          isSharedSplitCoop: false,
          isOnlinePvp: true,
          isMmo: false,
          mpMaxPlayersApprox: 4,
          tags: ["Souls-like", "Open World"]
        }}
        owners={crew}
        caption="7 own · 1 online"
        badges={<IslandTag>MINE</IslandTag>}
        onDetails={() => {}}
      />
    </PosterWall>
  </Stage>
);
