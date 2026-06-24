import { useState } from "react";
import { findCurrentTier, type RankTier } from "../data/rankTiers.js";
import { islandTheme } from "../theme.js";

/** Badge art is 100×118 — keep aspect everywhere we render rank icons. */
export const RANK_BADGE_ASPECT = 118 / 100;

export function rankBadgeHeight(width: number): number {
  return Math.round(width * RANK_BADGE_ASPECT);
}

type RankBadgeArtProps = {
  tier: RankTier;
  reached?: boolean;
  width: number;
  alt?: string;
  glow?: boolean;
  priority?: boolean;
  lazy?: boolean;
};

/** Fixed-size slot for rank badge art in flex/grid rows — prevents layout bleed. */
export function RankBadgeSlot({
  width,
  children,
}: {
  width: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        width,
        height: rankBadgeHeight(width),
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      {children}
    </div>
  );
}

/** Shield badge image — art includes its own frame; no circular crop. */
export function RankBadgeArt({
  tier,
  reached = true,
  width,
  alt,
  glow = true,
  priority = false,
  lazy = false,
}: RankBadgeArtProps) {
  const height = rankBadgeHeight(width);
  const src = reached ? tier.art : tier.artLocked;
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      {!loaded ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            width,
            height,
            borderRadius: 8,
            background: `linear-gradient(110deg, ${islandTheme.color.panelMutedBg} 25%, ${islandTheme.color.panelBg} 50%, ${islandTheme.color.panelMutedBg} 75%)`,
            backgroundSize: "200% 100%",
            animation: "bi-badge-shimmer 1.2s ease-in-out infinite",
          }}
        />
      ) : null}
      <img
        src={src}
        alt={alt ?? tier.label}
        width={width}
        height={height}
        loading={lazy && !priority ? "lazy" : "eager"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        onLoad={() => setLoaded(true)}
        style={{
          width,
          height,
          display: "block",
          flexShrink: 0,
          filter: glow && reached ? `drop-shadow(0 0 14px ${tier.reachedGlow})` : undefined,
          opacity: loaded ? (reached ? 1 : 0.88) : 0,
          transition: "opacity 180ms ease",
        }}
      />
    </>
  );
}

// Auto "highest reached" milestone rank on the homepage Nuggies card + profile pages.
export function MilestoneRankBadge({
  lifetimeEarned,
  size = 44,
  showLabel = true,
  variant = "default",
}: {
  lifetimeEarned: number;
  size?: number;
  showLabel?: boolean;
  variant?: "default" | "profile";
}) {
  const tier = findCurrentTier(lifetimeEarned);
  if (!tier) return null;

  const isProfile = variant === "profile";
  const badgeWidth = size;
  const rankLabelSize = isProfile ? 11 : 10;
  const tierLabelSize = isProfile ? 14 : 12;

  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: isProfile ? 12 : 8 }}
      title={`Rank: ${tier.label}`}
    >
      <RankBadgeSlot width={badgeWidth}>
        <RankBadgeArt tier={tier} width={badgeWidth} priority />
      </RankBadgeSlot>
      {showLabel ? (
        <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
          <span
            className="island-mono"
            style={{
              fontSize: rankLabelSize,
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
              fontSize: tierLabelSize,
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
