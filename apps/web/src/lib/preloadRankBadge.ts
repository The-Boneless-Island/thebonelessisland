import { findCurrentTier } from "../data/rankTiers.js";

const preloaded = new Set<string>();

/** Hint the browser to fetch the member's current rank badge early. */
export function preloadRankBadge(lifetimeEarned: number) {
  const tier = findCurrentTier(lifetimeEarned);
  if (!tier || preloaded.has(tier.art)) return;
  preloaded.add(tier.art);

  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = tier.art;
  document.head.appendChild(link);
}
