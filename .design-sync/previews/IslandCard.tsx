import { IslandCard, IslandButton, IslandTag } from "@island/web";
import { Stage } from "./_stage";

export const GameNight = () => (
  <Stage style={{ width: 360 }}>
    <IslandCard>
      <h3 style={{ margin: "0 0 6px", fontSize: 18 }}>Friday Game Night</h3>
      <p style={{ margin: "0 0 14px", fontSize: 14, opacity: 0.85, lineHeight: 1.5 }}>
        The crew lands on Sea of Thieves at 8pm island time. Bring your grog and your worst maps.
      </p>
      <IslandButton variant="primary">Count me in</IslandButton>
    </IslandCard>
  </Stage>
);

export const NuggiesBalance = () => (
  <Stage style={{ width: 320 }}>
    <IslandCard>
      <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 4 }}>Your Nuggies</div>
      <div style={{ fontSize: 32, fontWeight: 800, marginBottom: 12 }}>4,820</div>
      <div style={{ display: "flex", gap: 8 }}>
        <IslandTag tone="success">+120 today</IslandTag>
        <IslandTag tone="info">Rank #7</IslandTag>
      </div>
    </IslandCard>
  </Stage>
);

export const Article = () => (
  <Stage style={{ width: 380 }}>
    <IslandCard as="article">
      <h3 style={{ margin: "0 0 8px", fontSize: 17 }}>Welcome to the Island</h3>
      <p style={{ margin: 0, fontSize: 14, opacity: 0.85, lineHeight: 1.55 }}>
        Six years strong and still boneless. Link your Discord, sync your Steam, and start
        racking up Nuggies for showing up to crew nights.
      </p>
    </IslandCard>
  </Stage>
);
