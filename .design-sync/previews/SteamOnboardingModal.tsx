import { SteamOnboardingModal } from "@island/web";
import { Stage } from "./_stage";

const noop = () => {};

export const Open = () => (
  <Stage style={{ width: 560, minHeight: 620, position: "relative", overflow: "hidden" }}>
    <SteamOnboardingModal open={true} onClose={noop} onSkip={noop} />
  </Stage>
);
