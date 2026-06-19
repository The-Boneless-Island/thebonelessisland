import { IslandActiveMemberRow } from "@island/web";
import { Stage } from "./_stage";

export const Online = () => (
  <Stage style={{ width: 300 }}>
    <IslandActiveMemberRow displayName="CaptainNugget" presenceText="Playing Deep Rock Galactic" />
  </Stage>
);

export const InVoice = () => (
  <Stage style={{ width: 300 }}>
    <IslandActiveMemberRow displayName="ReefRanger" presenceText="Lounging in #tiki-bar" inVoice />
  </Stage>
);

export const ActiveCrew = () => (
  <Stage style={{ width: 300 }}>
    <div style={{ display: "grid", gap: 8 }}>
      <IslandActiveMemberRow displayName="SaltySaucier" presenceText="Hosting tonight's game night" inVoice />
      <IslandActiveMemberRow displayName="TikiTina" presenceText="Idle - last seen 12m ago" />
      <IslandActiveMemberRow displayName="DeepFryDan" presenceText="Grinding Nuggies in Lethal Company" />
    </div>
  </Stage>
);
