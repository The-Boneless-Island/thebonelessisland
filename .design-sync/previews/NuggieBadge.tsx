import { NuggieBadge } from "@island/web";
import { Stage } from "./_stage";

export const TitleBadge = () => (
  <Stage inline>
    <NuggieBadge
      item={{
        id: 1,
        name: "Reef Royalty",
        itemType: "title",
        itemData: { emoji: "👑", label: "Reef Royalty", color: "#fbbf24" }
      }}
    />
  </Stage>
);

export const FlairBadge = () => (
  <Stage inline>
    <NuggieBadge
      item={{
        id: 2,
        name: "Night Owl",
        itemType: "flair",
        itemData: { emoji: "🦉", color: "#a855f7" }
      }}
    />
  </Stage>
);

export const BadgeType = () => (
  <Stage inline>
    <NuggieBadge
      item={{
        id: 3,
        name: "Game Night MVP",
        itemType: "badge",
        itemData: { emoji: "🏆", color: "#22c55e" }
      }}
    />
  </Stage>
);

export const SmallSize = () => (
  <Stage inline>
    <NuggieBadge
      size="sm"
      item={{
        id: 4,
        name: "Crew OG",
        itemType: "title",
        itemData: { emoji: "🌴", label: "Crew OG", color: "#38bdf8" }
      }}
    />
  </Stage>
);
