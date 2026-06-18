import { IslandStatusPill } from "@island/web";
import { Stage } from "./_stage";

export const Synced = () => (
  <Stage inline>
    <IslandStatusPill tone="success">Steam: Synced</IslandStatusPill>
  </Stage>
);

export const NotSynced = () => (
  <Stage inline>
    <IslandStatusPill tone="danger">Steam: Not synced</IslandStatusPill>
  </Stage>
);
