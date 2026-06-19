import { IslandSkeleton } from "@island/web";
import { Stage } from "./_stage";

export const TextLines = () => (
  <Stage style={{ width: 320 }}>
    <div style={{ display: "grid", gap: 10 }}>
      <IslandSkeleton width="45%" height={16} />
      <IslandSkeleton width="90%" height={11} />
      <IslandSkeleton width="78%" height={11} />
      <IslandSkeleton width="60%" height={11} />
    </div>
  </Stage>
);

export const Blocks = () => (
  <Stage style={{ width: 320 }}>
    <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
      <IslandSkeleton width={64} height={64} radius={12} />
      <IslandSkeleton width={48} height={84} radius={10} />
      <IslandSkeleton width={80} height={56} radius={10} />
      <IslandSkeleton width={36} height={36} radius={999} />
    </div>
  </Stage>
);

export const StatTiles = () => (
  <Stage style={{ width: 320 }}>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
      <IslandSkeleton width="100%" height={48} radius={10} />
      <IslandSkeleton width="100%" height={48} radius={10} />
      <IslandSkeleton width="100%" height={48} radius={10} />
    </div>
  </Stage>
);
