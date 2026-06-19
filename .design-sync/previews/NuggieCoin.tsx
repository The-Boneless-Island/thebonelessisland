import { NuggieCoin } from "@island/web";
import { Stage } from "./_stage";

export const HeadsLarge = () => (
  <Stage inline>
    <NuggieCoin face="heads" size={128} title="One Nuggie — heads" />
  </Stage>
);

export const TailsLarge = () => (
  <Stage inline>
    <NuggieCoin face="tails" size={128} title="One Nuggie — tails" />
  </Stage>
);

export const SizeSweep = () => (
  <Stage inline>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
      <NuggieCoin face="heads" size={24} />
      <NuggieCoin face="heads" size={40} />
      <NuggieCoin face="tails" size={64} />
    </span>
  </Stage>
);

export const InlineWithBalance = () => (
  <Stage inline>
    <span
      className="island-mono"
      style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 800 }}
    >
      <NuggieCoin face="heads" size={28} />
      1,240 Nuggies
    </span>
  </Stage>
);
