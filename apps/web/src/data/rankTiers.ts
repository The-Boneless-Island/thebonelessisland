export type RankTier = {
  label: string;
  threshold: number;
  /** One-time Nuggie bonus paid when the tier is first reached. */
  bonus: number;
  emblem: string;
  reachedGrad: string;
  reachedBorder: string;
  reachedGlow: string;
  nextBorder: string;
  reachedTextColor: string;
};

export const RANK_TIERS: RankTier[] = [
  { label: "TUTORIAL ISLAND",  threshold:    500, bonus:    50, emblem: "🪵", reachedGrad: "linear-gradient(135deg, #475569, #94a3b8)",                       reachedBorder: "#64748b", reachedGlow: "rgba(100, 116, 139, 0.55)", nextBorder: "#94a3b8", reachedTextColor: "#cbd5e1" },
  { label: "SIDEKICK",         threshold:  2_000, bonus:   200, emblem: "🐢", reachedGrad: "linear-gradient(135deg, #047857, #34d399)",                       reachedBorder: "#10b981", reachedGlow: "rgba(16, 185, 129, 0.55)",  nextBorder: "#10b981", reachedTextColor: "#a7f3d0" },
  { label: "REGULAR",          threshold:  5_000, bonus:   500, emblem: "🐚", reachedGrad: "linear-gradient(135deg, #92400e, #d97706)",                       reachedBorder: "#d97706", reachedGlow: "rgba(217, 119, 6, 0.6)",    nextBorder: "#d97706", reachedTextColor: "#fbbf24" },
  { label: "RISING STAR",      threshold: 15_000, bonus:  1500, emblem: "🌊", reachedGrad: "linear-gradient(135deg, #94a3b8, #e2e8f0)",                       reachedBorder: "#cbd5e1", reachedGlow: "rgba(203, 213, 225, 0.6)",  nextBorder: "#cbd5e1", reachedTextColor: "#e2e8f0" },
  { label: "A-LISTER",         threshold: 40_000, bonus:  4000, emblem: "🏖️", reachedGrad: "linear-gradient(135deg, #f59e0b, #facc15)",                       reachedBorder: "#facc15", reachedGlow: "rgba(250, 204, 21, 0.6)",   nextBorder: "#facc15", reachedTextColor: "#fde68a" },
  { label: "KING OF THE HILL", threshold:100_000, bonus: 10000, emblem: "⛈️", reachedGrad: "linear-gradient(135deg, #312e81, #6366f1, #8b5cf6)",              reachedBorder: "#818cf8", reachedGlow: "rgba(129, 140, 248, 0.65)", nextBorder: "#818cf8", reachedTextColor: "#c4b5fd" },
  { label: "BIG BOSS",         threshold:250_000, bonus: 25000, emblem: "🦑", reachedGrad: "linear-gradient(135deg, #be185d, #f472b6 60%, #fb7185)",          reachedBorder: "#f472b6", reachedGlow: "rgba(244, 114, 182, 0.7)",  nextBorder: "#f472b6", reachedTextColor: "#fbcfe8" },
  { label: "MR. WORLDWIDE",    threshold:750_000, bonus: 75000, emblem: "🔱", reachedGrad: "linear-gradient(135deg, #06b6d4 0%, #fbbf24 60%, #fb7185 100%)", reachedBorder: "#fbbf24", reachedGlow: "rgba(251, 191, 36, 0.85)",  nextBorder: "#fbbf24", reachedTextColor: "#fef3c7" },
];

export const MILESTONES = RANK_TIERS.map((t) => t.threshold);
export const MILESTONE_LABELS = RANK_TIERS.map((t) => t.label);

export function findCurrentTier(amount: number): RankTier | null {
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (amount >= RANK_TIERS[i].threshold) return RANK_TIERS[i];
  }
  return null;
}

export function findNextTier(amount: number): RankTier | null {
  return RANK_TIERS.find((t) => amount < t.threshold) ?? null;
}
