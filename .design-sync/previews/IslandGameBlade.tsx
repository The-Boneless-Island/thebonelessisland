import { IslandGameBlade } from "@island/web";
import { Stage } from "./_stage";

export const Default = () => (
  <Stage style={{ width: 460 }}>
    <IslandGameBlade
      title="Deep Rock Galactic"
      subtitle="4-player co-op mining"
      meta="Up to 4 crew - 90 min sessions"
      tags={["Co-op", "PvE", "Voice-friendly"]}
      selected={false}
    />
  </Stage>
);

export const Selected = () => (
  <Stage style={{ width: 460 }}>
    <IslandGameBlade
      title="Lethal Company"
      subtitle="Co-op horror salvage"
      meta="4 crew - bring a headset"
      tags={["Horror", "Co-op", "Chaos"]}
      selected={true}
      currentUserVote={1}
    />
  </Stage>
);

export const Hovered = () => (
  <Stage style={{ width: 460 }}>
    <IslandGameBlade
      title="Sea of Thieves"
      subtitle="Pirate crew sailing"
      meta="Full galleon - 6 crew"
      tags={["Adventure", "PvPvE", "Island vibes"]}
      selected={false}
      hovered={true}
    />
  </Stage>
);

export const JustVoted = () => (
  <Stage style={{ width: 460 }}>
    <IslandGameBlade
      title="Helldivers 2"
      subtitle="Galactic bug-stomping"
      meta="4 crew - for democracy"
      tags={["Co-op", "Shooter", "Loud"]}
      selected={true}
      justVoted={true}
      voteFlashLabel="+1 Nuggie"
      voteFlashTone="up"
      currentUserVote={1}
    />
  </Stage>
);
