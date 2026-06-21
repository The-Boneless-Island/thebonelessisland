import { RANK_TIERS } from "../data/rankTiers.js";
import { RANK_BADGE_ASPECT } from "./MilestoneRankBadge.js";
import { islandTheme } from "../theme.js";

// "Path to Kappa" — the rank ladder drawn as a winding journey instead of a flat
// grid. Each node is a rank shield; a gold trail fills up to the member's exact
// lifetime-earned position, with a pulsing marker showing where they stand.
// Pure/deterministic geometry (no refs, SSR-safe) — everything lives in one SVG
// so it scales with the card width.

const GOLD = islandTheme.color.nuggieGold;
const N = RANK_TIERS.length;

const VB_W = 420;
const VB_H = 600;
const CX = 210;
const AMP = 140;
const Y_TOP = 56;
const SPACING = 70;
const BADGE_W = 52;
const BADGE_H = BADGE_W * RANK_BADGE_ASPECT;

type Pt = { x: number; y: number };

const NODES = RANK_TIERS.map((tier, i) => ({
  tier,
  i,
  x: CX + AMP * Math.sin((i * Math.PI) / 2),
  y: Y_TOP + i * SPACING
}));
const START: Pt = { x: NODES[0].x, y: Y_TOP - 40 };

function smoothPath(pts: Pt[]): string {
  if (pts.length === 0) return "";
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let k = 1; k < pts.length; k++) {
    const p0 = pts[k - 1];
    const p1 = pts[k];
    const midY = ((p0.y + p1.y) / 2).toFixed(1);
    d += ` C ${p0.x.toFixed(1)} ${midY} ${p1.x.toFixed(1)} ${midY} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return d;
}

const fmt = (n: number) => n.toLocaleString();

export function RankPath({ lifetimeEarned }: { lifetimeEarned: number }) {
  const earned = Math.max(0, lifetimeEarned);
  const reachedCount = NODES.filter((n) => earned >= n.tier.threshold).length;
  const allDone = reachedCount === N;

  // Marker = the member's live position along the trail.
  let marker: Pt;
  let filledPts: Pt[];
  let next: (typeof NODES)[number] | null = null;
  if (allDone) {
    marker = { x: NODES[N - 1].x, y: NODES[N - 1].y };
    filledPts = [START, ...NODES.map((n) => ({ x: n.x, y: n.y }))];
  } else {
    next = NODES[reachedCount];
    const lower = reachedCount > 0 ? NODES[reachedCount - 1] : START;
    const lowerThresh = reachedCount > 0 ? NODES[reachedCount - 1].tier.threshold : 0;
    const span = next.tier.threshold - lowerThresh;
    const segFrac = span > 0 ? Math.max(0, Math.min(1, (earned - lowerThresh) / span)) : 0;
    marker = { x: lower.x + (next.x - lower.x) * segFrac, y: lower.y + (next.y - lower.y) * segFrac };
    filledPts = [START, ...NODES.slice(0, reachedCount).map((n) => ({ x: n.x, y: n.y })), marker];
  }
  const basePts = [START, ...NODES.map((n) => ({ x: n.x, y: n.y }))];

  const pct = next ? Math.min(100, Math.round((earned / next.tier.threshold) * 100)) : 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
      <div style={{ width: "100%", maxWidth: VB_W, margin: "0 auto" }}>
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          width="100%"
          height="auto"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Rank journey — ${reachedCount} of ${N} milestones reached`}
          style={{ display: "block", overflow: "visible" }}
        >
          <defs>
            <filter id="rankTrailGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>

          {/* Base (un-walked) trail */}
          <path
            d={smoothPath(basePts)}
            fill="none"
            stroke="rgba(148,163,184,0.22)"
            strokeWidth={9}
            strokeLinecap="round"
            strokeDasharray="2 13"
          />

          {/* Walked trail — soft glow underlay + crisp gold line */}
          <path d={smoothPath(filledPts)} fill="none" stroke={GOLD} strokeOpacity={0.5} strokeWidth={15} strokeLinecap="round" filter="url(#rankTrailGlow)" />
          <path d={smoothPath(filledPts)} fill="none" stroke={GOLD} strokeWidth={6} strokeLinecap="round" />

          {/* Nodes */}
          {NODES.map((n) => {
            const reached = earned >= n.tier.threshold;
            const isNext = !reached && next?.i === n.i;
            const labelSide = n.x > CX ? "left" : n.x < CX ? "right" : n.i % 2 ? "right" : "left";
            const labelX = labelSide === "left" ? n.x - BADGE_W / 2 - 10 : n.x + BADGE_W / 2 + 10;
            const anchor = labelSide === "left" ? "end" : "start";
            const labelColor = reached ? n.tier.reachedTextColor : isNext ? GOLD : islandTheme.color.textMuted;
            const checkCx = n.x + BADGE_W / 2 - 4;
            const checkCy = n.y - BADGE_H / 2 + 7;
            return (
              <g key={n.tier.threshold}>
                {isNext && (
                  <circle cx={n.x} cy={n.y} r={BADGE_H / 2 + 5} fill="none" stroke={GOLD} strokeWidth={2}>
                    <animate attributeName="r" values={`${BADGE_H / 2 + 5};${BADGE_H / 2 + 12}`} dur="1.9s" repeatCount="indefinite" />
                    <animate attributeName="stroke-opacity" values="0.85;0" dur="1.9s" repeatCount="indefinite" />
                  </circle>
                )}
                <image
                  href={reached ? n.tier.art : n.tier.artLocked}
                  x={n.x - BADGE_W / 2}
                  y={n.y - BADGE_H / 2}
                  width={BADGE_W}
                  height={BADGE_H}
                  opacity={reached ? 1 : isNext ? 0.95 : 0.6}
                  style={{ filter: reached ? `drop-shadow(0 0 6px ${n.tier.reachedGlow})` : "none" }}
                />
                {reached && (
                  <g>
                    <circle cx={checkCx} cy={checkCy} r={8} fill={n.tier.reachedBorder} stroke={islandTheme.color.panelBg} strokeWidth={1.5} />
                    <path d={`M ${checkCx - 3.4} ${checkCy} L ${checkCx - 1} ${checkCy + 2.6} L ${checkCx + 3.6} ${checkCy - 3}`} fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                )}
                <text x={labelX} y={n.y - 2} textAnchor={anchor} fontFamily={islandTheme.font.mono} fontSize={12} fontWeight={700} letterSpacing="0.03em" fill={labelColor}>
                  {n.tier.label}
                </text>
                <text x={labelX} y={n.y + 13} textAnchor={anchor} fontFamily={islandTheme.font.mono} fontSize={10} fill={islandTheme.color.textMuted}>
                  ₦{fmt(n.tier.threshold)}
                </text>
              </g>
            );
          })}

          {/* "You are here" marker */}
          {!allDone && (
            <g>
              <circle cx={marker.x} cy={marker.y} r={11} fill="none" stroke={GOLD} strokeWidth={2}>
                <animate attributeName="r" values="11;22" dur="1.8s" repeatCount="indefinite" />
                <animate attributeName="stroke-opacity" values="0.7;0" dur="1.8s" repeatCount="indefinite" />
              </circle>
              <circle cx={marker.x} cy={marker.y} r={8.5} fill={GOLD} stroke={islandTheme.color.panelBg} strokeWidth={2} />
              <circle cx={marker.x - 2} cy={marker.y - 2} r={2.4} fill="#fff7e6" />
            </g>
          )}
        </svg>
      </div>

      <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, textAlign: "center", letterSpacing: "0.02em" }}>
        {next ? (
          <>
            Lifetime ₦{fmt(earned)} / ₦{fmt(next.tier.threshold)} · {pct}% to{" "}
            <span style={{ color: next.tier.reachedTextColor, fontWeight: 700, letterSpacing: "0.06em" }}>{next.tier.label}</span>
          </>
        ) : (
          <span style={{ color: GOLD, fontWeight: 700, letterSpacing: "0.06em" }}>KAPPA reached — top of the ladder 🧰</span>
        )}
      </div>
    </div>
  );
}
