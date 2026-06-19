import { IslandNewsPlaceholderCard } from "@island/web";
import { Stage } from "./_stage";

export const Single = () => (
  <Stage style={{ width: 340 }}>
    <IslandNewsPlaceholderCard
      title="Sea of Thieves Season 12 drops"
      meta="Gaming News · 2h ago"
    />
  </Stage>
);

export const Feed = () => (
  <Stage style={{ width: 340 }}>
    <div style={{ display: "grid", gap: 8 }}>
      <IslandNewsPlaceholderCard
        title="Helldivers 2 balance patch lands"
        meta="Patches & Updates · 5h ago"
      />
      <IslandNewsPlaceholderCard
        title="Crew night recap: Lethal Company chaos"
        meta="Community · yesterday"
      />
      <IslandNewsPlaceholderCard
        title="New Nuggies bounties posted"
        meta="Announcement · 2d ago"
      />
    </div>
  </Stage>
);
