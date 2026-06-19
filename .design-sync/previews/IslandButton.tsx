import { IslandButton } from "@island/web";
import { Stage } from "./_stage";

export const Primary = () => (
  <Stage inline>
    <IslandButton variant="primary">Launch game night</IslandButton>
  </Stage>
);

export const Secondary = () => (
  <Stage inline>
    <IslandButton variant="secondary">Cancel</IslandButton>
  </Stage>
);

export const Danger = () => (
  <Stage inline>
    <IslandButton variant="danger">Leave crew</IslandButton>
  </Stage>
);

export const Disabled = () => (
  <Stage inline>
    <IslandButton variant="primary" disabled>
      Syncing crew…
    </IslandButton>
  </Stage>
);
