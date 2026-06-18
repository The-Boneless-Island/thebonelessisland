import { IslandTag } from "@island/web";
import { Stage } from "./_stage";

export const Tones = () => (
  <Stage inline>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: 340 }}>
      <IslandTag tone="default">Default</IslandTag>
      <IslandTag tone="primary">Primary</IslandTag>
      <IslandTag tone="success">Online</IslandTag>
      <IslandTag tone="warning">Maybe</IslandTag>
      <IslandTag tone="danger">Leak</IslandTag>
      <IslandTag tone="info">Patch</IslandTag>
    </div>
  </Stage>
);

export const Genres = () => (
  <Stage inline>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: 320 }}>
      <IslandTag color="#a855f7">RPG</IslandTag>
      <IslandTag color="#22c55e">Survival</IslandTag>
      <IslandTag color="#ef4444">FPS</IslandTag>
      <IslandTag color="#f97316">Battle Royale</IslandTag>
    </div>
  </Stage>
);

export const Active = () => (
  <Stage inline>
    <div style={{ display: "flex", gap: 8 }}>
      <IslandTag tone="primary" active>Co-op</IslandTag>
      <IslandTag tone="primary">Solo</IslandTag>
    </div>
  </Stage>
);

export const Clickable = () => (
  <Stage inline>
    <IslandTag tone="info" onClick={() => {}}>Filter: Patches</IslandTag>
  </Stage>
);
