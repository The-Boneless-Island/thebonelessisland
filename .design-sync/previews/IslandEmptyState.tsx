import { IslandEmptyState, IslandButton } from "@island/web";
import { Stage } from "./_stage";

export const NoGameNights = () => (
  <Stage style={{ width: 420 }}>
    <IslandEmptyState
      pose="snooze"
      title="No game nights docked yet"
      body="When a crewmate schedules the next session it shows up here with the roster and the vote tally."
      action={<IslandButton variant="primary">Plan a night</IslandButton>}
    />
  </Stage>
);

export const Compact = () => (
  <Stage style={{ width: 360 }}>
    <IslandEmptyState
      compact
      pose="shrug"
      title="No island crew in voice right now"
      body="Ask an admin to refresh crew sync."
    />
  </Stage>
);
