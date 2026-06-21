import { useEffect, useRef, useState } from "react";
import { RANK_TIERS } from "../data/rankTiers.js";
import { RANK_BADGE_ASPECT } from "./MilestoneRankBadge.js";
import { islandTheme } from "../theme.js";

// "Path to Kappa" — the rank ladder as a winding island climb. Members start at
// the bottom and ascend node-to-node toward KAPPA at the summit. A gold trail
// fills to the member's exact lifetime-earned position, with a pulsing "you are
// here" marker. The path scrolls inside a compact window (auto-centred on the
// marker) and a Fit/Zoom toggle reveals the whole climb at once.
// Pure geometry (deterministic) so the SVG scales freely; decor sits behind.

const GOLD = islandTheme.color.nuggieGold;
const N = RANK_TIERS.length;

// Illustrated trail scenery, ordered base → summit (climb runs bottom-to-top).
// Placed in the empty pockets so it sits behind the trail and shields.
const TRAIL_ART = "/art/trail/";
const DECOR: Array<{ href: string; cx: number; cy: number; w: number; h: number; op: number }> = [
  { href: "tbi_island_overhead_mstrail_1.webp", cx: 205, cy: 702, w: 300, h: 300, op: 0.92 },
  { href: "tbi_pyramid_mstrail_2.webp", cx: 366, cy: 452, w: 148, h: 148, op: 0.9 },
  { href: "tbi_volcanobase_mstrail_3.webp", cx: 118, cy: 298, w: 214, h: 117, op: 0.92 },
  { href: "tbi_volcano_summit_mstrail_4.webp", cx: 330, cy: 112, w: 224, h: 122, op: 0.94 }
];

const VB_W = 480;
const VB_H = 820;
const CX = 230;
const AMP = 150;
const Y_BOTTOM = 720;
const SPACING = 92;
const BADGE_W = 54;
const BADGE_H = BADGE_W * RANK_BADGE_ASPECT;
const VIEW_H = 430; // compact scroll window

type Pt = { x: number; y: number };

// Bottom-to-top: node 0 (first tier) sits low, KAPPA at the summit.
const NODES = RANK_TIERS.map((tier, i) => ({
  tier,
  i,
  x: CX + AMP * Math.sin((i * Math.PI) / 2),
  y: Y_BOTTOM - i * SPACING
}));
const START: Pt = { x: NODES[0].x, y: Y_BOTTOM + 44 };

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
  const [fitAll, setFitAll] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const earned = Math.max(0, lifetimeEarned);
  const reachedCount = NODES.filter((n) => earned >= n.tier.threshold).length;
  const allDone = reachedCount === N;

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

  // Centre the scroll window on the marker so "you are here" is in view.
  useEffect(() => {
    if (fitAll) return;
    const el = scrollRef.current;
    if (!el) return;
    const target = (marker.y / VB_H) * el.scrollHeight - el.clientHeight / 2;
    el.scrollTop = Math.max(0, target);
  }, [fitAll, marker.y]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => setFitAll((v) => !v)}
          className="island-mono"
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: GOLD,
            background: "rgba(251,191,119,0.12)",
            border: "1px solid rgba(251,191,119,0.3)",
            borderRadius: islandTheme.radius.pill,
            padding: "4px 12px",
            cursor: "pointer"
          }}
        >
          {fitAll ? "⤢ Zoom in" : "⤢ Fit path"}
        </button>
      </div>

      <div style={{ position: "relative", width: "100%", maxWidth: 460, margin: "0 auto" }}>
        <div
          ref={scrollRef}
          style={{
            height: VIEW_H,
            overflowY: fitAll ? "hidden" : "auto",
            overflowX: "hidden",
            borderRadius: islandTheme.radius.card,
            border: `1px solid ${islandTheme.color.cardBorder}`,
            background: "linear-gradient(180deg, rgba(11,28,58,0.55) 0%, rgba(14,58,82,0.4) 100%)",
            boxShadow: "inset 0 2px 6px rgba(2,6,23,0.4)"
          }}
        >
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            width="100%"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`Rank climb — ${reachedCount} of ${N} milestones reached`}
            style={{ display: "block", height: fitAll ? VIEW_H : "auto" }}
          >
            <defs>
              <filter id="rankTrailGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="5" />
              </filter>
            </defs>

            {/* Illustrated island scenery (base island → pyramid → volcano → summit) */}
            {DECOR.map((d) => (
              <image
                key={d.href}
                href={TRAIL_ART + d.href}
                x={d.cx - d.w / 2}
                y={d.cy - d.h / 2}
                width={d.w}
                height={d.h}
                opacity={d.op}
                preserveAspectRatio="xMidYMid meet"
              />
            ))}

            {/* Base (un-climbed) trail */}
            <path d={smoothPath(basePts)} fill="none" stroke="rgba(148,163,184,0.22)" strokeWidth={9} strokeLinecap="round" strokeDasharray="2 13" />

            {/* Climbed trail — glow underlay + crisp gold line */}
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

        {/* Edge fades hint that the path scrolls */}
        {!fitAll && (
          <>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 28, pointerEvents: "none", borderRadius: `${islandTheme.radius.card}px ${islandTheme.radius.card}px 0 0`, background: "linear-gradient(180deg, rgba(11,28,58,0.85), transparent)" }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 28, pointerEvents: "none", borderRadius: `0 0 ${islandTheme.radius.card}px ${islandTheme.radius.card}px`, background: "linear-gradient(0deg, rgba(11,28,58,0.85), transparent)" }} />
          </>
        )}
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
