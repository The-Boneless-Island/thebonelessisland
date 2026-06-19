import { IslandSkeletonCard } from "@island/web";
import { Stage } from "./_stage";

export const Default = () => (
  <Stage style={{ width: 320 }}>
    <IslandSkeletonCard />
  </Stage>
);

export const FewLines = () => (
  <Stage style={{ width: 320 }}>
    <IslandSkeletonCard lines={2} />
  </Stage>
);

export const ManyLines = () => (
  <Stage style={{ width: 320 }}>
    <IslandSkeletonCard lines={5} />
  </Stage>
);
