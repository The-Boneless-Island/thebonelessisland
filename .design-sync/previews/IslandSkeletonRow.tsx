import { IslandSkeletonRow } from "@island/web";
import { Stage } from "./_stage";

export const Single = () => (
  <Stage style={{ width: 300 }}>
    <IslandSkeletonRow />
  </Stage>
);

export const RosterLoading = () => (
  <Stage style={{ width: 300 }}>
    <div style={{ display: "grid", gap: 14 }}>
      <IslandSkeletonRow />
      <IslandSkeletonRow />
      <IslandSkeletonRow />
    </div>
  </Stage>
);
