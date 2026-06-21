export type RankTier = {
  label: string;
  threshold: number;
  /** One-time Nuggie bonus paid when the tier is first reached. */
  bonus: number;
  emblem: string;
  /** Path to the illustrated badge art shown when the tier is reached. */
  art: string;
  /** Path to the "locked" silhouette variant, shown before the tier is reached. */
  artLocked: string;
  reachedGrad: string;
  reachedBorder: string;
  reachedGlow: string;
  nextBorder: string;
  reachedTextColor: string;
};

export const RANK_TIERS: RankTier[] = [
  { label: "VAULT DWELLER",      threshold:    500, bonus:    50, emblem: "☢️", art: "/art/milestones/vault-dweller.svg", artLocked: "/art/milestones/vault-dweller-locked.svg",  reachedGrad: "linear-gradient(135deg, #475569, #94a3b8)",             reachedBorder: "#64748b", reachedGlow: "rgba(100, 116, 139, 0.55)", nextBorder: "#94a3b8", reachedTextColor: "#cbd5e1" },
  { label: "HARD STUCK SILVER", threshold:  2_000, bonus:   200, emblem: "🥈", art: "/art/milestones/silver.svg", artLocked: "/art/milestones/silver-locked.svg",           reachedGrad: "linear-gradient(135deg, #64748b, #e2e8f0)",             reachedBorder: "#cbd5e1", reachedGlow: "rgba(203, 213, 225, 0.55)", nextBorder: "#cbd5e1", reachedTextColor: "#e2e8f0" },
  { label: "REGULAR",              threshold:  5_000, bonus:   500, emblem: "🍺", art: "/art/milestones/regular.svg", artLocked: "/art/milestones/regular-locked.svg",          reachedGrad: "linear-gradient(135deg, #92400e, #d97706)",             reachedBorder: "#d97706", reachedGlow: "rgba(217, 119, 6, 0.6)",    nextBorder: "#d97706", reachedTextColor: "#fbbf24" },
  { label: "DIVINE",          threshold: 15_000, bonus:  1500, emblem: "🔮", art: "/art/milestones/divine.svg", artLocked: "/art/milestones/divine-locked.svg",      reachedGrad: "linear-gradient(135deg, #8a6a2e, #c9a86a, #8b6fae)",             reachedBorder: "#c9a86a", reachedGlow: "rgba(167, 139, 202, 0.6)",   nextBorder: "#c9a86a", reachedTextColor: "#e8d6b0" },
  { label: "GOT GUD",              threshold: 40_000, bonus:  4000, emblem: "🔥", art: "/art/milestones/got-gud.svg", artLocked: "/art/milestones/got-gud-locked.svg",          reachedGrad: "linear-gradient(135deg, #b45309, #f59e0b, #facc15)",     reachedBorder: "#f59e0b", reachedGlow: "rgba(245, 158, 11, 0.6)",   nextBorder: "#f59e0b", reachedTextColor: "#fde68a" },
  { label: "KING OF THE HILL",     threshold:100_000, bonus: 10000, emblem: "💀", art: "/art/milestones/king-of-the-hill.svg", artLocked: "/art/milestones/king-of-the-hill-locked.svg", reachedGrad: "linear-gradient(135deg, #312e81, #6366f1, #8b5cf6)",     reachedBorder: "#818cf8", reachedGlow: "rgba(129, 140, 248, 0.65)", nextBorder: "#818cf8", reachedTextColor: "#c4b5fd" },
  { label: "BIG BOSS",             threshold:250_000, bonus: 25000, emblem: "🪖", art: "/art/milestones/big-boss.svg", artLocked: "/art/milestones/big-boss-locked.svg",         reachedGrad: "linear-gradient(135deg, #3f4d2c, #6b7f3a, #a3ad6a)",     reachedBorder: "#8a9a52", reachedGlow: "rgba(132, 160, 82, 0.6)",   nextBorder: "#8a9a52", reachedTextColor: "#d9e0a8" },
  { label: "KAPPA",                threshold:750_000, bonus: 75000, emblem: "🧰", art: "/art/milestones/kappa.svg", artLocked: "/art/milestones/kappa-locked.svg",            reachedGrad: "linear-gradient(135deg, #374151, #6b7280 55%, #f97316)", reachedBorder: "#f97316", reachedGlow: "rgba(249, 115, 22, 0.7)",   nextBorder: "#f97316", reachedTextColor: "#fdba74" },
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
