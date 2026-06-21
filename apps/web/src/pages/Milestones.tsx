import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";
import { useNuggiesSignal } from "../system/nuggiesSignal.js";
import { IslandCard, IslandEmptyState, IslandSkeleton, IslandSkeletonCard } from "../islandUi.js";
import { NuggieCoin } from "../components/NuggieCoin.js";
import { ItemGlyph } from "../components/ItemGlyph.js";
import {
  MILESTONES,
  RANK_TIERS,
  findCurrentTier,
  findNextTier,
} from "../data/rankTiers.js";
import { RankBadgeArt, rankBadgeHeight } from "../components/MilestoneRankBadge.js";
import { islandTheme } from "../theme.js";

type EarnedAchievement = {
  id: number;
  name: string;
  description: string;
  itemType: "title" | "flair" | "badge";
  itemData: { emoji?: string; label?: string; color?: string; image?: string };
  unlocked: boolean;
  unlockedAt: string | null;
  equipped: boolean;
};

type MeSnapshot = {
  balance: number;
  lifetimeEarned: number;
  optedOut: boolean;
};

function fmt(n: number) {
  return n.toLocaleString();
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const delta = Math.max(0, Date.now() - t);
  const m = Math.round(delta / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.round(d / 30)}mo ago`;
}

export function MilestonesPage() {
  const [me, setMe] = useState<MeSnapshot | null>(null);
  const [achievements, setAchievements] = useState<EarnedAchievement[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [equipPending, setEquipPending] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [meRes, achRes] = await Promise.all([
      apiFetch("/nuggies/me"),
      apiFetch("/nuggies/achievements"),
    ]);
    if (meRes.ok) {
      const d = (await meRes.json()) as { balance: number; lifetimeEarned: number; optedOut: boolean };
      setMe({ balance: d.balance, lifetimeEarned: d.lifetimeEarned ?? 0, optedOut: d.optedOut });
    }
    if (achRes.ok) {
      const d = (await achRes.json()) as { achievements: EarnedAchievement[] };
      setAchievements(d.achievements);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live balance: refetch when the SSE bus reports this member's Nuggies changed.
  const nuggiesSignal = useNuggiesSignal();
  useEffect(() => {
    if (nuggiesSignal > 0) void load();
  }, [nuggiesSignal, load]);

  const handleEquipToggle = useCallback(async (itemId: number) => {
    setEquipPending(itemId);
    try {
      const res = await apiFetch(`/nuggies/inventory/${itemId}/equip`, { method: "POST" });
      if (res.ok) {
        await load();
      }
    } finally {
      setEquipPending(null);
    }
  }, [load]);

  if (loading) {
    // Render the page silhouette immediately instead of blocking on a spinner.
    return (
      <div style={{ display: "grid", gap: 12 }} aria-busy="true" aria-label="Loading milestones">
        <IslandSkeletonCard lines={2} />
        <IslandSkeleton height={10} radius={999} />
        <IslandSkeletonCard lines={5} />
        <IslandSkeletonCard lines={5} />
      </div>
    );
  }

  if (!me) {
    return (
      <IslandCard>
        <IslandEmptyState
          pose="shrug"
          title="Couldn't load milestones"
          body="The ladder didn't come back from the server. Refresh the page, or check that you're still logged in."
        />
      </IslandCard>
    );
  }

  const balance = me.balance;
  const lifetimeEarned = me.lifetimeEarned;
  const currentTier = findCurrentTier(lifetimeEarned);
  const nextTier = findNextTier(lifetimeEarned);
  const reachedCount = RANK_TIERS.filter((t) => lifetimeEarned >= t.threshold).length;
  const earnedCount = achievements?.filter((a) => a.unlocked).length ?? 0;
  const totalCount = achievements?.length ?? 0;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* ── Eyebrow / Header ──────────────────────────────────────────── */}
      <div style={{ display: "grid", gap: 6 }}>
        <span
          className="island-mono"
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: islandTheme.color.textMuted,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <NuggieCoin size={14} /> Nuggies · Progression
        </span>
        <h1
          className="island-display"
          style={{ margin: 0, fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 700 }}
        >
          Milestones &amp; Achievements
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            lineHeight: 1.5,
            color: islandTheme.color.textSubtle,
            maxWidth: 640,
          }}
        >
          Climb the ladder, unlock proof-of-play titles. Rank tiers are based on
          your <strong>lifetime earned</strong> Nuggies — once you reach a rank, it
          sticks. Spending, trading, and losing don&rsquo;t drop you down. Achievements
          come from playing — they can&rsquo;t be bought.
        </p>
      </div>

      {/* ── Current Rank Hero ─────────────────────────────────────────── */}
      <CurrentRankHero
        balance={balance}
        lifetimeEarned={lifetimeEarned}
        currentTier={currentTier}
        nextTier={nextTier}
      />

      {/* ── Ladder Grid ───────────────────────────────────────────────── */}
      <IslandCard as="section" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Rank Ladder</div>
          <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, letterSpacing: "0.06em" }}>
            {reachedCount} / {RANK_TIERS.length} reached
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {RANK_TIERS.map((tier, i) => {
            const reached = lifetimeEarned >= tier.threshold;
            const isNext = !reached && (i === 0 || lifetimeEarned >= RANK_TIERS[i - 1].threshold);
            return (
              <RankTierCard
                key={tier.label}
                tier={tier}
                reached={reached}
                isNext={isNext}
                lifetimeEarned={lifetimeEarned}
              />
            );
          })}
        </div>
      </IslandCard>

      {/* ── Achievements Grid ─────────────────────────────────────────── */}
      <IslandCard as="section" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Achievements</div>
          <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, letterSpacing: "0.06em" }}>
            {earnedCount} / {totalCount} unlocked
          </div>
        </div>
        {achievements && achievements.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 10,
            }}
          >
            {achievements.map((ach) => (
              <AchievementCard
                key={ach.id}
                achievement={ach}
                onEquipToggle={handleEquipToggle}
                equipPending={equipPending === ach.id}
              />
            ))}
          </div>
        ) : (
          <div style={{ color: islandTheme.color.textMuted, fontSize: 14 }}>
            No achievements catalogued yet.
          </div>
        )}
      </IslandCard>
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function CurrentRankHero({
  balance,
  lifetimeEarned,
  currentTier,
  nextTier,
}: {
  balance: number;
  lifetimeEarned: number;
  currentTier: ReturnType<typeof findCurrentTier>;
  nextTier: ReturnType<typeof findNextTier>;
}) {
  // Progress to next rank uses lifetime earned (monotonic). If under the first
  // tier, show progress toward DRIFTWOOD.
  const target = nextTier ?? RANK_TIERS[0];
  const lower = currentTier?.threshold ?? 0;
  const upper = target?.threshold ?? RANK_TIERS[0].threshold;
  const span = Math.max(1, upper - lower);
  const within = Math.max(0, lifetimeEarned - lower);
  const pct = nextTier ? Math.min(100, Math.round((within / span) * 100)) : 100;

  const heroBg = currentTier
    ? currentTier.reachedGrad
    : "linear-gradient(135deg, #1f2937, #334155)";
  const heroGlow = currentTier ? currentTier.reachedGlow : "rgba(56, 189, 248, 0.35)";
  const heroText = currentTier ? currentTier.reachedTextColor : islandTheme.color.textMuted;

  return (
    <IslandCard
      as="section"
      style={{
        position: "relative",
        overflow: "hidden",
        padding: 0,
      }}
    >
      <div
        style={{
          padding: "24px 22px 26px",
          background: heroBg,
          color: "#0f172a",
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 18,
          alignItems: "center",
          boxShadow: `inset 0 -40px 60px ${heroGlow}, inset 0 0 0 1px rgba(255,255,255,0.10)`,
        }}
      >
        <div
          style={{
            width: 96,
            height: rankBadgeHeight(96),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            filter: "drop-shadow(0 12px 32px rgba(0,0,0,0.35))",
          }}
        >
          {currentTier ? (
            <RankBadgeArt tier={currentTier} width={96} />
          ) : (
            <span style={{ fontSize: 42, opacity: 0.5 }}>○</span>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            className="island-mono"
            style={{
              fontSize: 12,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              opacity: 0.8,
              marginBottom: 4,
            }}
          >
            Current Rank
          </div>
          <div
            className="island-display"
            style={{
              fontSize: "clamp(24px, 3.5vw, 34px)",
              fontWeight: 700,
              letterSpacing: "0.03em",
              lineHeight: 1.05,
              textShadow: "0 2px 12px rgba(0,0,0,0.3)",
            }}
          >
            {currentTier?.label ?? "UNRANKED"}
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 13,
              opacity: 0.9,
              fontFamily: islandTheme.font.mono,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>Lifetime ₦{fmt(lifetimeEarned)}</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>Balance ₦{fmt(balance)}</span>
            {nextTier && (
              <>
                <span style={{ opacity: 0.5 }}>·</span>
                <span>{pct}% to {nextTier.label}</span>
              </>
            )}
            {!nextTier && (
              <>
                <span style={{ opacity: 0.5 }}>·</span>
                <span>apex tier</span>
              </>
            )}
          </div>
        </div>
      </div>
      {nextTier && (
        <div style={{ padding: "12px 18px 16px", display: "grid", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: islandTheme.color.textMuted, fontFamily: islandTheme.font.mono, letterSpacing: "0.05em" }}>
            <span>₦{fmt(lower)}</span>
            <span style={{ color: heroText }}>{nextTier.label} · ₦{fmt(upper)}</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: islandTheme.color.panelMutedBg, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                background: nextTier.reachedGrad,
                borderRadius: 999,
                transition: "width 600ms ease",
                boxShadow: `0 0 10px ${nextTier.reachedGlow}`,
              }}
            />
          </div>
        </div>
      )}
    </IslandCard>
  );
}

// ── Ladder card ───────────────────────────────────────────────────────────────

function RankTierCard({
  tier,
  reached,
  isNext,
  lifetimeEarned,
}: {
  tier: (typeof RANK_TIERS)[number];
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

  return (
    <div
      style={{
        position: "relative",
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
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <RankBadgeArt tier={tier} reached={reached} width={52} glow={reached || isNext} />
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
          <div style={{ fontSize: 12, color: islandTheme.color.textMuted, fontFamily: islandTheme.font.mono }}>
            ₦{fmt(tier.threshold)} · <span style={{ color: islandTheme.color.successAccent }}>+₦{fmt(tier.bonus)} bonus</span>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 4, borderRadius: 999, background: islandTheme.color.panelBg, overflow: "hidden" }}>
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
            whiteSpace: "nowrap",
          }}
        >
          {status}
        </span>
      </div>
    </div>
  );
}

// ── Achievement card ──────────────────────────────────────────────────────────

function AchievementCard({
  achievement,
  onEquipToggle,
  equipPending,
}: {
  achievement: EarnedAchievement;
  onEquipToggle?: (itemId: number) => void | Promise<void>;
  equipPending?: boolean;
}) {
  const { id, unlocked, equipped, name, description, itemData, unlockedAt, itemType } = achievement;

  return (
    <div
      style={{
        position: "relative",
        padding: 14,
        borderRadius: 14,
        background: islandTheme.color.panelMutedBg,
        border: `1px solid ${unlocked ? "rgba(163, 230, 53, 0.45)" : islandTheme.color.border}`,
        boxShadow: unlocked ? "0 0 14px rgba(163, 230, 53, 0.18)" : "none",
        opacity: unlocked ? 1 : 0.55,
        display: "grid",
        gap: 8,
        minHeight: 130,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            background: unlocked
              ? "linear-gradient(135deg, rgba(163, 230, 53, 0.25), rgba(34, 197, 94, 0.15))"
              : islandTheme.color.panelBg,
            border: `1px solid ${unlocked ? "rgba(163, 230, 53, 0.45)" : islandTheme.color.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            flexShrink: 0,
            filter: unlocked ? "none" : "grayscale(0.7)",
          }}
        >
          {unlocked ? <ItemGlyph itemData={itemData} size={22} /> : "🔒"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="island-mono"
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: islandTheme.color.textPrimary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </div>
          <div style={{ fontSize: 12, color: islandTheme.color.textMuted, textTransform: "capitalize" }}>
            {itemType}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: islandTheme.color.textSubtle, lineHeight: 1.45 }}>
        {description}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: "auto", flexWrap: "wrap" }}>
        {unlocked ? (
          <>
            <span
              className="island-mono"
              style={{
                fontSize: 12,
                padding: "2px 8px",
                borderRadius: 999,
                background: "rgba(163, 230, 53, 0.18)",
                color: "#a3e635",
                border: "1px solid rgba(163, 230, 53, 0.45)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Unlocked {relTime(unlockedAt)}
            </span>
            {onEquipToggle && (
              <button
                type="button"
                onClick={() => void onEquipToggle(id)}
                disabled={equipPending}
                className="island-mono"
                style={{
                  fontSize: 12,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: equipped ? "rgba(56, 189, 248, 0.18)" : "transparent",
                  color: equipped ? "#7dd3fc" : islandTheme.color.textSubtle,
                  border: `1px solid ${equipped ? "rgba(56, 189, 248, 0.45)" : islandTheme.color.border}`,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  cursor: equipPending ? "wait" : "pointer",
                  opacity: equipPending ? 0.6 : 1,
                  font: "inherit",
                  transition: "background 140ms ease, color 140ms ease, border-color 140ms ease",
                }}
                title={equipped ? "Unequip this item" : `Equip this ${itemType}`}
              >
                {equipPending ? "…" : equipped ? "Equipped · Unequip" : "Equip"}
              </button>
            )}
          </>
        ) : (
          <span
            className="island-mono"
            style={{
              fontSize: 12,
              padding: "2px 8px",
              borderRadius: 999,
              background: islandTheme.color.panelBg,
              color: islandTheme.color.textMuted,
              border: `1px solid ${islandTheme.color.border}`,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Locked
          </span>
        )}
      </div>
    </div>
  );
}
