import { QuickActionCard } from "@island/web";
import { Stage } from "./_stage";

export const PrimaryWithCount = () => (
  <Stage style={{ width: 320 }}>
    <QuickActionCard
      icon="🎮"
      title="Schedule game night"
      subtitle="Pick a night and rally the crew"
      count={3}
      tone="primary"
      onClick={() => {}}
    />
  </Stage>
);

export const WarningPending = () => (
  <Stage style={{ width: 320 }}>
    <QuickActionCard
      icon="🛡️"
      title="Review join requests"
      subtitle="New islanders waiting for approval"
      count={7}
      tone="warning"
      onClick={() => {}}
    />
  </Stage>
);

export const SuccessNoCount = () => (
  <Stage style={{ width: 320 }}>
    <QuickActionCard
      icon="🍗"
      title="Award Nuggies"
      subtitle="Drop bonus crumbs on this week's MVPs"
      tone="success"
      onClick={() => {}}
    />
  </Stage>
);

export const DefaultPlain = () => (
  <Stage style={{ width: 320 }}>
    <QuickActionCard
      icon="📰"
      title="Edit gaming news feed"
      subtitle="Tune what the island reads each morning"
      tone="default"
      onClick={() => {}}
    />
  </Stage>
);
