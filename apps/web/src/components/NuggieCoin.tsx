import type { CSSProperties } from "react";

type Face = "heads" | "tails";

type Props = {
  face?: Face;
  size?: number;
  style?: CSSProperties;
  title?: string;
};

export function NuggieCoin({ face = "heads", size = 24, style, title }: Props) {
  const rimDark = "#5a2e08";
  const isHeads = face === "heads";
  const showLegends = size >= 64;
  const gradId = `nuggie-coin-grad-${face}`;
  const topArcId = `nuggie-coin-top-${face}`;

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      style={{ display: "inline-block", flexShrink: 0, borderRadius: "50%", ...style }}
      role="img"
      aria-label={title ?? `Nuggie coin (${face})`}
    >
      <defs>
        <radialGradient id={gradId} cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="35%" stopColor="#fbbf24" />
          <stop offset="75%" stopColor="#b45309" />
          <stop offset="100%" stopColor="#7c2d12" />
        </radialGradient>
        <path id={topArcId} d="M 30 100 A 70 70 0 0 1 170 100" fill="none" />
      </defs>

      <circle cx="100" cy="100" r="98" fill={`url(#${gradId})`} />
      <circle cx="100" cy="100" r="92" fill="none" stroke={rimDark} strokeOpacity="0.55" strokeWidth="2.5" />
      <circle
        cx="100"
        cy="100"
        r="84"
        fill="none"
        stroke={rimDark}
        strokeOpacity="0.45"
        strokeWidth="1.6"
        strokeDasharray="1.5 3"
      />
      <ellipse cx="78" cy="62" rx="42" ry="22" fill="rgba(255,255,255,0.18)" />

      {showLegends && (
        <text
          fontFamily="var(--island-mono, monospace)"
          fontSize={isHeads ? 13 : 12}
          fontWeight="800"
          fill={rimDark}
          letterSpacing={isHeads ? "2.5" : "1.8"}
        >
          <textPath href={`#${topArcId}`} startOffset="50%" textAnchor="middle">
            {isHeads ? "THE BONELESS ISLAND" : "IN NUGGIES WE TRUST"}
          </textPath>
        </text>
      )}

      {isHeads ? (
        <text x="100" y={showLegends ? 118 : 130} fontSize={showLegends ? 58 : 92} textAnchor="middle">
          🍗
        </text>
      ) : (
        <>
          <text x="100" y={showLegends ? 112 : 124} fontSize={showLegends ? 44 : 78} textAnchor="middle">
            🏝️
          </text>
          {showLegends && (
            <>
              <text
                x="100"
                y="138"
                fontSize="8"
                fontFamily="var(--island-mono, monospace)"
                fontWeight="800"
                fill={rimDark}
                textAnchor="middle"
                letterSpacing="0.5"
              >
                OUT OF MANY CRUMBS
              </text>
              <text
                x="100"
                y="148"
                fontSize="8"
                fontFamily="var(--island-mono, monospace)"
                fontWeight="800"
                fill={rimDark}
                textAnchor="middle"
                letterSpacing="0.5"
              >
                ONE NUGGIE
              </text>
            </>
          )}
        </>
      )}

      {showLegends && (
        <text
          x="100"
          y="178"
          fontFamily="var(--island-mono, monospace)"
          fontSize="14"
          fontWeight="800"
          fill={rimDark}
          textAnchor="middle"
          letterSpacing="3"
        >
          {isHeads ? "#NUGGIES" : "NUGGIES"}
        </text>
      )}

      {showLegends && (
        <>
          <circle cx="22" cy="100" r="2.5" fill={rimDark} opacity="0.6" />
          <circle cx="178" cy="100" r="2.5" fill={rimDark} opacity="0.6" />
        </>
      )}
    </svg>
  );
}
