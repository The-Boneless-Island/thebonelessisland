import { findCurrentTier, findNextTier, RANK_TIERS } from "../data/rankTiers.js";

const preloaded = new Set<string>();

function preloadUrl(url: string) {
  if (preloaded.has(url)) return;
  preloaded.add(url);
  const img = new Image();
  img.src = url;
}

/** Preload current + next tier badge art to avoid pop-in on Home / Milestones. */
export function preloadRankBadgesForLifetime(lifetimeEarned: number) {
  const current = findCurrentTier(lifetimeEarned);
  const next = findNextTier(lifetimeEarned);

  if (current) {
    preloadUrl(current.art);
    preloadUrl(current.artLocked);
  }
  if (next) {
    preloadUrl(next.art);
    preloadUrl(next.artLocked);
  }
}

/** Back-compat alias used by App.tsx. */
export function preloadRankBadge(lifetimeEarned: number) {
  preloadRankBadgesForLifetime(lifetimeEarned);
}

/** Preload all ladder badges (Milestones page shows the full grid). */
export function preloadAllRankBadges() {
  for (const tier of RANK_TIERS) {
    preloadUrl(tier.art);
    preloadUrl(tier.artLocked);
  }
}
