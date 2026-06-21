import { findCurrentTier } from "../data/rankTiers.js";
import { islandTheme } from "../theme.js";

// Auto "highest reached" milestone rank, shown as the tier coin on the homepage
// Nuggies card + profile pages. Rank is derived from lifetime-earned Nuggies
// (same threshold logic as the rank ladder), so it always reflects the member's
// current tier with no equip step. Renders nothing below the first tier.
export function MilestoneRankBadge({
  lifetimeEarned,
  size = 44,
  showLabel = true,
}: {
  lifetimeEarned: number;
  size?: number;
  showLabel?: boolean;
}) {
  const tier = findCurrentTier(lifetimeEarned);
  if (!tier) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }} title={`Rank: ${tier.label}`}>
      <img
        src={tier.art}
        alt={tier.label}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          display: "block",
          flexShrink: 0,
          boxShadow: `0 0 12px ${tier.reachedGlow}`,
        }}
      />
      {showLabel ? (
        <div style={{ display: "grid", gap: 1, minWidth: 0 }}>
          <span
            className="island-mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.1em",
              color: islandTheme.color.textMuted,
              textTransform: "uppercase",
            }}
          >
            Rank
          </span>
          <span
            className="island-mono"
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.05em",
              color: tier.reachedTextColor,
              lineHeight: 1.1,
            }}
          >
            {tier.label}
          </span>
        </div>
      ) : null}
    </div>
  );
}
