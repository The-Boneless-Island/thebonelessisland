import React, { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../api/client.js";
import { useRefetchActivity } from "../system/activityContext.js";
import { useNuggiesSignal } from "../system/nuggiesSignal.js";
import { usePushToast } from "../system/toast.js";
import { ConfettiBurst } from "../system/celebration.js";
import { IslandButton, IslandCard, IslandEmptyState, IslandSkeletonCard } from "../islandUi.js";
import { NuggieBadge } from "../components/NuggieBadge.js";
import { NuggieCoin } from "../components/NuggieCoin.js";
import { MILESTONES, MILESTONE_LABELS, RANK_TIERS } from "../data/rankTiers.js";
import { islandTheme } from "../theme.js";
import type {
  NuggieTransaction,
  NuggiesInventoryItem,
  NuggiesShopItem,
  NuggiesLeaderboardEntry,
  NuggiesLoan,
} from "../types.js";

type ItemTab = "all" | "title" | "flair" | "badge";

type MeData = {
  balance: number;
  lifetimeEarned: number;
  optedOut: boolean;
  transactions: NuggieTransaction[];
  inventory: NuggiesInventoryItem[];
  loans: NuggiesLoan[];
  dailyAmount?: number;
};

function fmt(n: number) {
  return n.toLocaleString();
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function txIcon(type: string, amount: number): React.ReactNode {
  if (type === "daily") return <NuggieCoin size={18} />;
  if (type === "attendance") return "🎮";
  if (type.startsWith("game_")) return "🎲";
  if (type === "first_link") return "🔗";
  if (type === "admin_grant" || type === "admin_deduct") return "⚙️";
  if (type === "spend" || type === "market_buy") return "🛒";
  if (type === "trade_in" || type === "loan_in") return "📥";
  if (type === "trade_out" || type === "loan_out") return "📤";
  return amount >= 0 ? "➕" : "➖";
}

function hasDailyToday(txs: NuggieTransaction[]) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Halifax" });
  return txs.some((tx) => {
    if (tx.type !== "daily") return false;
    const d = new Date(tx.createdAt).toLocaleDateString("en-CA", { timeZone: "America/Halifax" });
    return d === today;
  });
}

type AchievementsPageProps = {
  onProfileChanged?: () => void;
};

function AchievementsPageInner({ onProfileChanged }: AchievementsPageProps = {}) {
  const [me, setMe] = useState<MeData | null>(null);
  const [shop, setShop] = useState<NuggiesShopItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<NuggiesLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [invTab, setInvTab] = useState<ItemTab>("all");
  const [shopTab, setShopTab] = useState<ItemTab>("all");

  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [claimedToday, setClaimedToday] = useState(false);

  const [buying, setBuying] = useState<number | null>(null);
  const [equipPending, setEquipPending] = useState<number | null>(null);
  const [loanPending, setLoanPending] = useState<number | null>(null);

  const [claimConfetti, setClaimConfetti] = useState(0);
  const [shopConfetti, setShopConfetti] = useState(0);

  const refetchActivity = useRefetchActivity();
  const pushToast = usePushToast();

  const load = useCallback(async () => {
    const [meRes, shopRes, lbRes] = await Promise.all([
      apiFetch("/nuggies/me"),
      apiFetch("/nuggies/shop"),
      apiFetch("/nuggies/leaderboard"),
    ]);
    if (meRes.ok) {
      const d = await meRes.json() as MeData;
      setMe(d);
      setClaimedToday(hasDailyToday(d.transactions));
    }
    if (shopRes.ok) {
      const d = await shopRes.json() as { items: NuggiesShopItem[] };
      setShop(d.items);
    }
    if (lbRes.ok) {
      const d = await lbRes.json() as { leaderboard: NuggiesLeaderboardEntry[] };
      setLeaderboard(d.leaderboard);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Live balance: refetch the instant the SSE bus reports this member's Nuggies
  // changed (admin grant, daily claim, trade, loan…) — no manual refresh needed.
  const nuggiesSignal = useNuggiesSignal();
  useEffect(() => {
    if (nuggiesSignal > 0) void load();
  }, [nuggiesSignal, load]);

  async function claimDaily() {
    setClaiming(true);
    setClaimMsg(null);
    const res = await apiFetch("/nuggies/daily", { method: "POST" });
    const body = await res.json() as { newBalance?: number; amount?: number; error?: string };
    if (res.ok && body.newBalance !== undefined) {
      setMe((prev) =>
        prev
          ? {
              ...prev,
              balance: body.newBalance!,
              lifetimeEarned: prev.lifetimeEarned + (body.amount ?? 0),
            }
          : prev
      );
      setClaimedToday(true);
      setClaimMsg(`+${fmt(body.amount ?? 0)} Nuggies claimed!`);
      setClaimConfetti((n) => n + 1);
      void refetchActivity();
    } else {
      setClaimMsg(body.error ?? "Could not claim daily");
    }
    setClaiming(false);
  }

  async function buyItem(itemId: number) {
    setBuying(itemId);
    const res = await apiFetch(`/nuggies/shop/${itemId}/buy`, { method: "POST" });
    if (res.ok) {
      await load();
      setShopConfetti((n) => n + 1);
    } else {
      const b = await res.json() as { error?: string };
      pushToast(b.error ?? "Purchase failed", "error");
    }
    setBuying(null);
  }

  async function toggleEquip(itemId: number) {
    setEquipPending(itemId);
    const res = await apiFetch(`/nuggies/inventory/${itemId}/equip`, { method: "POST" });
    if (res.ok) {
      await load();
      onProfileChanged?.();
    }
    setEquipPending(null);
  }

  async function toggleOptOut() {
    if (!me) return;
    const path = me.optedOut ? "/nuggies/opt-in" : "/nuggies/opt-out";
    const res = await apiFetch(path, { method: "POST" });
    if (res.ok) {
      setMe((prev) => prev ? { ...prev, optedOut: !prev.optedOut } : prev);
    }
  }

  async function loanAction(loanId: number, action: "accept" | "repay" | "cancel") {
    setLoanPending(loanId);
    const res = await apiFetch(`/nuggies/loan/${loanId}/${action}`, { method: "POST" });
    if (res.ok) {
      await load();
      void refetchActivity();
    } else {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      alert(body?.error ?? `Loan ${action} failed`);
    }
    setLoanPending(null);
  }

  if (loading) {
    // Render the page silhouette immediately instead of blocking on a spinner.
    return (
      <div style={{ display: "grid", gap: 12 }} aria-busy="true" aria-label="Loading Nuggies">
        <div className="bi-nuggies-top">
          <IslandSkeletonCard lines={4} />
          <IslandSkeletonCard lines={4} />
        </div>
        <IslandSkeletonCard lines={6} />
        <IslandSkeletonCard lines={5} />
      </div>
    );
  }

  if (!me) {
    return (
      <IslandCard>
        <IslandEmptyState
          pose="shrug"
          title="Couldn't load your Nuggies"
          body="The tide didn't bring your balance back. Refresh the page, or check that you're still logged in."
        />
      </IslandCard>
    );
  }

  const myRank = leaderboard.findIndex((e) => e.balance <= me.balance) + 1 || null;
  const filteredInv = invTab === "all" ? me.inventory : me.inventory.filter((i) => i.itemType === invTab);
  const filteredShop = shopTab === "all" ? shop : shop.filter((i) => i.itemType === shopTab);
  const ownedIds = new Set(me.inventory.map((i) => i.itemId));

  const activeLoans = me.loans?.filter((l) => l.status === "pending" || l.status === "active") ?? [];

  const loansCard = activeLoans.length > 0 ? (
    <IslandCard as="section" style={{ display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>Loans</div>
      <div style={{ display: "grid", gap: 6 }}>
        {activeLoans.map((loan) => {
          const overdue = loan.status === "active" && new Date(loan.dueAt).getTime() < Date.now();
          const due = new Date(loan.dueAt);
          const dueLabel = due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
          const role = loan.isLender ? "Lent" : "Borrowed";
          const arrow = loan.isLender ? "📤" : "📥";
          return (
            <div
              key={loan.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 8,
                background: islandTheme.color.panelMutedBg,
                border: `1px solid ${overdue ? "rgba(239,68,68,0.45)" : islandTheme.color.border}`,
                fontSize: 13,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{arrow}</span>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: islandTheme.color.textSecondary }}>
                  {role} ₦{fmt(loan.principal)} · due ₦{fmt(loan.amountDue)}
                </div>
                <div style={{ fontSize: 12, color: islandTheme.color.textMuted, fontFamily: islandTheme.font.mono }}>
                  #{loan.id} · {loan.status} · {overdue ? "OVERDUE · " : ""}due {dueLabel}
                  {loan.collateral > 0 ? ` · collateral ₦${fmt(loan.collateral)}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {loan.status === "pending" && !loan.isLender && (
                  <IslandButton
                    variant="primary"
                    style={{ fontSize: 12, padding: "0.3rem 0.65rem" }}
                    disabled={loanPending === loan.id}
                    onClick={() => void loanAction(loan.id, "accept")}
                  >
                    {loanPending === loan.id ? "…" : "Accept"}
                  </IslandButton>
                )}
                {loan.status === "pending" && loan.isLender && (
                  <IslandButton
                    variant="secondary"
                    style={{ fontSize: 12, padding: "0.3rem 0.65rem" }}
                    disabled={loanPending === loan.id}
                    onClick={() => void loanAction(loan.id, "cancel")}
                  >
                    {loanPending === loan.id ? "…" : "Cancel"}
                  </IslandButton>
                )}
                {loan.status === "active" && !loan.isLender && (
                  <IslandButton
                    variant="primary"
                    style={{ fontSize: 12, padding: "0.3rem 0.65rem" }}
                    disabled={loanPending === loan.id || me.balance < loan.amountDue}
                    onClick={() => void loanAction(loan.id, "repay")}
                  >
                    {loanPending === loan.id ? "…" : "Repay"}
                  </IslandButton>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: islandTheme.color.textMuted, fontFamily: islandTheme.font.mono }}>
        Use /loan in Discord to make new offers.
      </div>
    </IslandCard>
  ) : null;

  const recentActivity = (
    <IslandCard as="section" style={{ display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>Recent Activity</div>
      {me.transactions.length === 0 ? (
        <div style={{ color: islandTheme.color.textMuted, fontSize: 14 }}>No transactions yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 4, maxWidth: islandTheme.layout.listMaxWidth, width: "100%" }}>
          {me.transactions.slice(0, 15).map((tx) => (
            <div
              key={tx.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 10px",
                borderRadius: 8,
                background: islandTheme.color.panelMutedBg,
                fontSize: 13,
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{txIcon(tx.type, tx.amount)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: islandTheme.color.textSecondary }}>
                  {tx.reason}
                </div>
              </div>
              <span style={{ fontWeight: 700, flexShrink: 0, color: tx.amount >= 0 ? islandTheme.color.successAccent : islandTheme.color.dangerAccent }}>
                {tx.amount >= 0 ? "+" : ""}{fmt(tx.amount)}
              </span>
              <span style={{ fontSize: 12, color: islandTheme.color.textMuted, flexShrink: 0 }}>
                {relTime(tx.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </IslandCard>
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="bi-nuggies-top">
        <div style={{ display: "grid", gap: 12 }}>
      {/* Balance Hero */}
      <IslandCard style={{ display: "grid", gap: 12, position: "relative" }}>
        <ConfettiBurst trigger={claimConfetti} />
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, fontFamily: islandTheme.font.mono, textTransform: "uppercase", letterSpacing: "0.1em", color: islandTheme.color.textMuted, marginBottom: 4, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <NuggieCoin size={16} /> Nuggies Balance
            </div>
            <div style={{ fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 800, lineHeight: 1, color: islandTheme.color.textPrimary }}>
              ₦{fmt(me.balance)}
              <span style={{ fontSize: "0.45em", fontWeight: 400, color: islandTheme.color.textMuted, marginLeft: "0.4em" }}>Nuggies</span>
            </div>
            {myRank && !me.optedOut && (
              <div style={{ fontSize: 13, color: islandTheme.color.textMuted, marginTop: 4 }}>
                #{myRank} on the ladder
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            {claimedToday ? (
              <div style={{ fontSize: 13, color: islandTheme.color.textMuted, textAlign: "right" }}>
                Daily claimed ✓<br />
                <span style={{ fontSize: 12 }}>Resets at 11pm ET</span>
              </div>
            ) : (
              <IslandButton variant="primary" onClick={() => void claimDaily()} disabled={claiming}>
                {claiming ? "Claiming…" : me.dailyAmount != null ? `Claim ${fmt(me.dailyAmount)} Nuggies Today` : "Claim Daily Nuggies"}
              </IslandButton>
            )}
            {claimMsg && (
              <div style={{ fontSize: 13, color: claimMsg.startsWith("+") ? islandTheme.color.successAccent : islandTheme.color.textMuted }}>
                {claimMsg}
              </div>
            )}
          </div>
        </div>

        {/* Equipped items */}
        {me.inventory.filter((i) => i.equipped).length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {me.inventory.filter((i) => i.equipped).map((item) => (
              <NuggieBadge key={item.itemId} item={{ ...item, id: item.itemId, itemData: item.itemData as Parameters<typeof NuggieBadge>[0]["item"]["itemData"] }} />
            ))}
          </div>
        )}
      </IslandCard>

      {/* Milestones */}
      <IslandCard as="section" style={{ display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Rank</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
          {MILESTONES.map((m, i) => {
            const reached = me.lifetimeEarned >= m;
            const isNext = !reached && (i === 0 || me.lifetimeEarned >= MILESTONES[i - 1]);
            const tier = RANK_TIERS[i];
            const isApex = i === RANK_TIERS.length - 1;
            return (
              <div
                key={m}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  opacity: reached ? 1 : isNext ? 0.92 : 0.4,
                  flex: "1 1 64px",
                  minWidth: 64,
                }}
              >
                <div
                  className={reached && isApex ? "bi-rank-apex-pulse" : undefined}
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 999,
                    background: reached
                      ? tier.reachedGrad
                      : isNext
                        ? islandTheme.color.panelBg
                        : islandTheme.color.panelMutedBg,
                    border: reached
                      ? `2px solid ${tier.reachedBorder}`
                      : isNext
                        ? `2px solid ${tier.nextBorder}`
                        : `1px solid ${islandTheme.color.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: reached ? 22 : 16,
                    color: reached ? "#0f172a" : islandTheme.color.textMuted,
                    boxShadow: reached
                      ? `0 0 18px ${tier.reachedGlow}, inset 0 0 0 1px rgba(255,255,255,0.18)`
                      : isNext
                        ? `0 0 14px ${tier.reachedGlow}`
                        : "none",
                    transition: "box-shadow 240ms ease, transform 240ms ease",
                  }}
                >
                  {reached ? tier.emblem : isNext ? "◎" : "○"}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: reached ? tier.reachedTextColor : islandTheme.color.textMuted,
                    fontFamily: islandTheme.font.mono,
                    letterSpacing: "0.08em",
                    fontWeight: reached ? 700 : 500,
                    textAlign: "center",
                    lineHeight: 1.2,
                  }}
                >
                  {MILESTONE_LABELS[i]}
                </div>
              </div>
            );
          })}
        </div>
        {(() => {
          const next = MILESTONES.find((m) => me.lifetimeEarned < m);
          if (!next) return null;
          const pct = Math.min(100, Math.round((me.lifetimeEarned / next) * 100));
          const nextIdx = MILESTONES.indexOf(next);
          const nextTier = RANK_TIERS[nextIdx];
          return (
            <div>
              <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginBottom: 6 }}>
                Lifetime ₦{fmt(me.lifetimeEarned)} / ₦{fmt(next)} · {pct}% to{" "}
                <span style={{ color: nextTier.reachedTextColor, fontWeight: 700, fontFamily: islandTheme.font.mono, letterSpacing: "0.06em" }}>
                  {MILESTONE_LABELS[nextIdx]}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: islandTheme.color.panelMutedBg, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: nextTier.reachedGrad,
                    borderRadius: 999,
                    transition: "width 600ms ease",
                    boxShadow: `0 0 8px ${nextTier.reachedGlow}`,
                  }}
                />
              </div>
            </div>
          );
        })()}
        <style>{`
          @keyframes biRankApexPulse {
            0%, 100% {
              box-shadow: 0 0 18px rgba(244, 114, 182, 0.7), inset 0 0 0 1px rgba(255,255,255,0.18);
            }
            50% {
              box-shadow: 0 0 28px rgba(244, 114, 182, 0.95), inset 0 0 0 1px rgba(255,255,255,0.30);
            }
          }
          .bi-rank-apex-pulse {
            animation: biRankApexPulse 2.6s ease-in-out infinite;
          }
        `}</style>
      </IslandCard>

      {/* My Items */}
      <IslandCard as="section" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>My Items</div>
          <TabBar value={invTab} onChange={setInvTab} />
        </div>
        {filteredInv.length === 0 ? (
          <div style={{ color: islandTheme.color.textMuted, fontSize: 14, padding: "8px 0" }}>
            No items{invTab !== "all" ? ` in ${invTab}s` : ""} yet. Check the shop below!
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {filteredInv.map((item) => {
              const earned = item.acquisition === "earned";
              return (
                <ItemCard key={item.itemId} tooltip={item.description || undefined}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 22 }}>{item.itemData.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                      <div style={{ fontSize: 12, color: islandTheme.color.textMuted, textTransform: "capitalize", display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{item.itemType}</span>
                        {earned && (
                          <span
                            className="island-mono"
                            style={{
                              fontSize: 12,
                              padding: "1px 6px",
                              borderRadius: 999,
                              background: "rgba(163, 230, 53, 0.18)",
                              color: "#a3e635",
                              border: "1px solid rgba(163, 230, 53, 0.45)",
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                            }}
                          >
                            Earned
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <IslandButton
                      variant={item.equipped ? "primary" : "secondary"}
                      style={{ width: "100%", fontSize: 12, padding: "0.35rem 0.6rem" }}
                      onClick={() => void toggleEquip(item.itemId)}
                      disabled={equipPending === item.itemId}
                    >
                      {equipPending === item.itemId ? "…" : item.equipped ? "Equipped ✓" : "Equip"}
                    </IslandButton>
                  </div>
                </ItemCard>
              );
            })}
          </div>
        )}
      </IslandCard>
        </div>
        {recentActivity}
      </div>

      {/* Shop */}
      <IslandCard as="section" style={{ display: "grid", gap: 12, position: "relative" }}>
        <ConfettiBurst trigger={shopConfetti} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Shop</div>
          <TabBar value={shopTab} onChange={setShopTab} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {filteredShop.map((item) => {
            const owned = ownedIds.has(item.id);
            return (
              <ItemCard key={item.id}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{item.itemData.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2, lineHeight: 1.3 }}>{item.description}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: islandTheme.color.primaryGlow }}>
                    ₦{fmt(item.price)}
                  </span>
                  {owned ? (
                    <span style={{ fontSize: 12, color: islandTheme.color.textMuted }}>Owned ✓</span>
                  ) : (
                    <IslandButton
                      variant="primary"
                      style={{ fontSize: 12, padding: "0.3rem 0.65rem" }}
                      onClick={() => void buyItem(item.id)}
                      disabled={buying === item.id || me.balance < item.price}
                    >
                      {buying === item.id ? "…" : "Buy"}
                    </IslandButton>
                  )}
                </div>
              </ItemCard>
            );
          })}
        </div>
      </IslandCard>

      {loansCard}

      {/* Leaderboard Preview */}
      {leaderboard.length > 0 && (
        <IslandCard as="section" style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Ladder · Top 5</div>
          <div style={{ display: "grid", gap: 4, maxWidth: islandTheme.layout.listMaxWidth, width: "100%" }}>
            {leaderboard.slice(0, 5).map((entry) => (
              <div
                key={entry.discordUserId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "7px 10px",
                  borderRadius: 8,
                  background: islandTheme.color.panelMutedBg,
                  fontSize: 13,
                }}
              >
                <span style={{ fontFamily: islandTheme.font.mono, width: 24, flexShrink: 0, color: entry.rank <= 3 ? "#f59e0b" : islandTheme.color.textMuted }}>
                  {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `#${entry.rank}`}
                </span>
                {entry.avatarUrl && (
                  <img src={entry.avatarUrl} alt="" width={24} height={24} style={{ borderRadius: 999, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.username}</span>
                  {entry.equippedTitle && (
                    <NuggieBadge item={{ ...entry.equippedTitle, itemType: entry.equippedTitle.itemType as "title" | "flair" | "badge" }} size="sm" />
                  )}
                </div>
                <span style={{ fontWeight: 700, color: islandTheme.color.primaryGlow, flexShrink: 0 }}>
                  ₦{fmt(entry.balance)}
                </span>
              </div>
            ))}
          </div>
        </IslandCard>
      )}

      {/* Opt-out */}
      <div style={{ textAlign: "center", paddingBottom: 8 }}>
        <button
          type="button"
          onClick={() => void toggleOptOut()}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            color: islandTheme.color.textMuted,
            textDecoration: "underline",
          }}
        >
          {me.optedOut
            ? "Re-join the ladder and resume earning Nuggies"
            : "Hide my balance from the ladder"}
        </button>
        {me.optedOut && (
          <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 4 }}>
            Unranked. You won't appear on the ladder and can't earn or spend Nuggies.
          </div>
        )}
      </div>
    </div>
  );
}

export const AchievementsPage = React.memo(AchievementsPageInner);

function TabBar({ value, onChange }: { value: ItemTab; onChange: (t: ItemTab) => void }) {
  const tabs: { key: ItemTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "title", label: "Titles" },
    { key: "flair", label: "Status" },
    { key: "badge", label: "Trophies" },
  ];
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          style={{
            fontSize: 12,
            padding: "0.25rem 0.6rem",
            borderRadius: 999,
            border: `1px solid ${value === t.key ? islandTheme.color.primary : islandTheme.color.border}`,
            background: value === t.key ? islandTheme.color.primary : "transparent",
            color: value === t.key ? islandTheme.color.primaryText : islandTheme.color.textMuted,
            cursor: "pointer",
            fontWeight: value === t.key ? 600 : 400,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function ItemCard({ children, tooltip }: { children: React.ReactNode; tooltip?: string }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        background: islandTheme.color.panelMutedBg,
        border: `1px solid ${islandTheme.color.border}`,
        borderRadius: islandTheme.radius.card,
        padding: "12px",
      }}
    >
      {children}
      {tooltip && hover ? (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 8,
            right: 8,
            zIndex: 50,
            padding: "8px 10px",
            background: islandTheme.color.panelBg,
            border: `1px solid ${islandTheme.color.cardBorder}`,
            borderRadius: 8,
            boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
            fontSize: 12,
            lineHeight: 1.45,
            color: islandTheme.color.textPrimary,
            pointerEvents: "none",
          }}
        >
          {tooltip}
        </div>
      ) : null}
    </div>
  );
}
