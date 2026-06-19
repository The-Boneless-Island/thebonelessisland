import { IslandComingSoonTile } from "@island/web";
import { Stage } from "./_stage";

export const Default = () => (
  <Stage style={{ width: 320 }}>
    <IslandComingSoonTile />
  </Stage>
);

export const Tournaments = () => (
  <Stage style={{ width: 340 }}>
    <IslandComingSoonTile
      title="Island Tournaments"
      description="Bracketed crew showdowns with Nuggies on the line. Dropping next season."
    />
  </Stage>
);

export const Leaderboards = () => (
  <Stage style={{ width: 340 }}>
    <IslandComingSoonTile
      title="Crew Leaderboards"
      description="See who's hoarding the most Nuggies across every game night."
    />
  </Stage>
);
