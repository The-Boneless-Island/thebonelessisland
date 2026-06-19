import { GameDetailDrawer } from "@island/web";
import { Stage } from "./_stage";

const noop = () => {};

export const Loading = () => (
  <Stage style={{ width: 560, minHeight: 560, position: "relative", overflow: "hidden" }}>
    <GameDetailDrawer appId={548430} onClose={noop} />
  </Stage>
);
