import { IslandMemberChip } from "@island/web";
import { Stage } from "./_stage";

export const Unselected = () => (
  <Stage inline>
    <IslandMemberChip label="CaptainNugget" selected={false} />
  </Stage>
);

export const Selected = () => (
  <Stage inline>
    <IslandMemberChip label="ReefRanger" selected={true} />
  </Stage>
);

export const Roster = () => (
  <Stage inline>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: 320 }}>
      <IslandMemberChip label="CaptainNugget" selected={true} />
      <IslandMemberChip label="ReefRanger" selected={false} />
      <IslandMemberChip label="SaltySaucier" selected={true} />
      <IslandMemberChip label="TikiTina" selected={false} />
      <IslandMemberChip label="DeepFryDan" selected={false} />
    </div>
  </Stage>
);
