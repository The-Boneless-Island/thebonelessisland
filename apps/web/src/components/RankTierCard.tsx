import { MILESTONES, type RankTier } from "../data/rankTiers.js";
import { islandTheme } from "../theme.js";
import { RankBadgeArt, RankBadgeSlot } from "./MilestoneRankBadge.js";

/** Min column width for rank-ladder grids — badge + mono lines need ~220px. */
export const RANK_LADDER_GRID_COLUMNS = "repeat(auto-fill, minmax(220px, 1fr))";

function fmt(n: number) {
  return n.toLocaleString();
}

export function RankTierCard({
  tier,
  reached,
  isNext,
  lifetimeEarned,
}: {
  tier: RankTier;
  reached: boolean;
  isNext: boolean;
  lifetimeEarned: number;
}) {
  const idx = MILESTONES.indexOf(tier.threshold);
  const lower = idx > 0 ? MILESTONES[idx - 1] : 0;
  const span = Math.max(1, tier.threshold - lower);
  const within = Math.max(0, lifetimeEarned - lower);
  const pct = reached ? 100 : isNext ? Math.min(100, Math.round((within / span) * 100)) : 0;

  const status = reached ? "REACHED" : isNext ? "IN PROGRESS" : "LOCKED";
  const statusColor = reached
    ? tier.reachedTextColor
    : isNext
      ? "#7dd3fc"
      : islandTheme.color.textMuted;

  const thresholdLine = `₦${fmt(tier.threshold)} · +₦${fmt(tier.bonus)} bonus`;

  return (
    <div
      title={`${tier.label} — ${thresholdLine}`}
      style={{
        position: "relative",
        minWidth: 0,
        overflow: "hidden",
        padding: 14,
        borderRadius: 14,
        background: islandTheme.color.panelMutedBg,
        border: `1px solid ${reached ? tier.reachedBorder : isNext ? tier.nextBorder : islandTheme.color.border}`,
        boxShadow: reached
          ? `0 0 18px ${tier.reachedGlow}`
          : isNext
            ? `0 0 12px ${tier.reachedGlow}`
            : "none",
        opacity: reached || isNext ? 1 : 0.55,
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <RankBadgeSlot width={52}>
          <RankBadgeArt tier={tier} reached={reached} width={52} glow={reached || isNext} lazy={!reached && !isNext} />
        </RankBadgeSlot>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="island-mono"
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: reached ? tier.reachedTextColor : islandTheme.color.textPrimary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {tier.label}
          </div>
          <div
            style={{
              fontSize: 12,
              color: islandTheme.color.textMuted,
              fontFamily: islandTheme.font.mono,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            ₦{fmt(tier.threshold)} · <span style={{ color: islandTheme.color.successAccent }}>+₦{fmt(tier.bonus)} bonus</span>
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <div style={{ height: 4, borderRadius: 999, background: islandTheme.color.panelBg, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: tier.reachedGrad,
              borderRadius: 999,
              transition: "width 500ms ease",
            }}
          />
        </div>
        <span
          className="island-mono"
          style={{
            fontSize: 12,
            letterSpacing: "0.1em",
            color: statusColor,
            fontWeight: 700,
            textAlign: "right",
          }}
        >
          {status}
        </span>
      </div>
    </div>
  );
}
