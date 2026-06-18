import { IslandGameCard } from "@island/web";
import { Stage } from "./_stage";

export const Default = () => (
  <Stage style={{ width: 250 }}>
    <IslandGameCard title="Deep Rock Galactic" subtitle="4-player co-op mining" selected={false} />
  </Stage>
);

export const Selected = () => (
  <Stage style={{ width: 250 }}>
    <IslandGameCard title="Lethal Company" subtitle="Co-op horror salvage" selected={true} />
  </Stage>
);
