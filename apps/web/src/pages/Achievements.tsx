import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../api/client.js";
import { IslandButton, IslandCard } from "../islandUi.js";
import { NuggieBadge } from "../components/NuggieBadge.js";
import { islandTheme } from "../theme.js";
import type {
  NuggieTransaction,
  NuggiesInventoryItem,
  NuggiesShopItem,
  NuggiesLeaderboardEntry,
} from "../types.js";

const MILESTONES = [100, 500, 1_000, 5_000, 10_000];
const MILESTONE_LABELS = ["100", "500", "1K", "5K", "Millionaire 💰"];

type ItemTab = "all" | "title" | "flair" | "badge";

type MeData = {
  balance: number;
  optedOut: boolean;
  transactions: NuggieTransaction[];
  inventory: NuggiesInventoryItem[];
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

function txIcon(type: string, amount: number) {
  if (type === "daily") return "🍗";
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
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  return txs.some((tx) => {
    if (tx.type !== "daily") return false;
    const d = new Date(tx.createdAt).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    return d === today;
  });
}

export function AchievementsPage() {
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

  async function claimDaily() {
    setClaiming(true);
    setClaimMsg(null);
    const res = await apiFetch("/nuggies/daily", { method: "POST" });
    const body = await res.json() as { newBalance?: number; amount?: number; error?: string };
    if (res.ok && body.newBalance !== undefined) {
      setMe((prev) => prev ? { ...prev, balance: body.newBalance! } : prev);
      setClaimedToday(true);
      setClaimMsg(`+${fmt(body.amount ?? 0)} Nuggies claimed!`);
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
    } else {
      const b = await res.json() as { error?: string };
      alert(b.error ?? "Purchase failed");
    }
    setBuying(null);
  }

  async function toggleEquip(itemId: number) {
    setEquipPending(itemId);
    const res = await apiFetch(`/nuggies/inventory/${itemId}/equip`, { method: "POST" });
    if (res.ok) {
      await load();
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

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: islandTheme.color.textMuted }}>
        Loading Nuggies…
      </div>
    );
  }

  if (!me) {
    return (
      <IslandCard>
        <p style={{ margin: 0 }}>Could not load Nuggies data. Are you logged in?</p>
      </IslandCard>
    );
  }

  const myRank = leaderboard.findIndex((e) => e.balance <= me.balance) + 1 || null;
  const filteredInv = invTab === "all" ? me.inventory : me.inventory.filter((i) => i.itemType === invTab);
  const filteredShop = shopTab === "all" ? shop : shop.filter((i) => i.itemType === shopTab);
  const ownedIds = new Set(me.inventory.map((i) => i.itemId));

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Balance Hero */}
      <IslandCard style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, fontFamily: islandTheme.font.mono, textTransform: "uppercase", letterSpacing: "0.1em", color: islandTheme.color.textMuted, marginBottom: 4 }}>
              🍗 Nuggies Balance
            </div>
            <div style={{ fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 800, lineHeight: 1, color: islandTheme.color.textPrimary }}>
              ₦{fmt(me.balance)}
              <span style={{ fontSize: "0.45em", fontWeight: 400, color: islandTheme.color.textMuted, marginLeft: "0.4em" }}>Nuggies</span>
            </div>
            {myRank && !me.optedOut && (
              <div style={{ fontSize: 13, color: islandTheme.color.textMuted, marginTop: 4 }}>
                Rank #{myRank} on the leaderboard
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            {claimedToday ? (
              <div style={{ fontSize: 13, color: islandTheme.color.textMuted, textAlign: "right" }}>
                Daily claimed ✓<br />
                <span style={{ fontSize: 11 }}>Resets at CST midnight</span>
              </div>
            ) : (
              <IslandButton variant="primary" onClick={() => void claimDaily()} disabled={claiming}>
                {claiming ? "Claiming…" : "Claim 75 Nuggies Today"}
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
      <IslandCard as="section" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Milestones</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {MILESTONES.map((m, i) => {
            const reached = me.balance >= m;
            const isNext = !reached && (i === 0 || me.balance >= MILESTONES[i - 1]);
            return (
              <div
                key={m}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  opacity: reached ? 1 : isNext ? 0.8 : 0.35,
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 999,
                    background: reached
                      ? "linear-gradient(135deg, #f59e0b, #facc15)"
                      : isNext
                      ? `${islandTheme.color.panelBg}`
                      : islandTheme.color.panelMutedBg,
                    border: reached
                      ? "2px solid #f59e0b"
                      : isNext
                      ? `2px solid ${islandTheme.color.primary}`
                      : `1px solid ${islandTheme.color.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: reached ? 18 : 14,
                    boxShadow: isNext ? `0 0 12px ${islandTheme.color.primaryGlow}55` : "none",
                  }}
                >
                  {reached ? "⭐" : isNext ? "◎" : "○"}
                </div>
                <div style={{ fontSize: 10, color: islandTheme.color.textMuted, fontFamily: islandTheme.font.mono }}>
                  {MILESTONE_LABELS[i]}
                </div>
              </div>
            );
          })}
        </div>
        {(() => {
          const next = MILESTONES.find((m) => me.balance < m);
          if (!next) return null;
          const pct = Math.min(100, Math.round((me.balance / next) * 100));
          return (
            <div>
              <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginBottom: 6 }}>
                ₦{fmt(me.balance)} / ₦{fmt(next)} · {pct}% to next milestone
              </div>
              <div style={{ height: 6, borderRadius: 999, background: islandTheme.color.panelMutedBg, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, var(--bi-primary), var(--bi-primary-glow))", borderRadius: 999, transition: "width 600ms ease" }} />
              </div>
            </div>
          );
        })()}
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
            {filteredInv.map((item) => (
              <ItemCard key={item.itemId}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 22 }}>{item.itemData.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: islandTheme.color.textMuted, textTransform: "capitalize" }}>{item.itemType}</div>
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
            ))}
          </div>
        )}
      </IslandCard>

      {/* Shop */}
      <IslandCard as="section" style={{ display: "grid", gap: 12 }}>
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
                    <div style={{ fontSize: 11, color: islandTheme.color.textMuted, marginTop: 2, lineHeight: 1.3 }}>{item.description}</div>
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

      {/* Recent Activity */}
      <IslandCard as="section" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Recent Activity</div>
        {me.transactions.length === 0 ? (
          <div style={{ color: islandTheme.color.textMuted, fontSize: 14 }}>No transactions yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 4 }}>
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
                <span style={{ fontSize: 11, color: islandTheme.color.textMuted, flexShrink: 0 }}>
                  {relTime(tx.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </IslandCard>

      {/* Leaderboard Preview */}
      {leaderboard.length > 0 && (
        <IslandCard as="section" style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Leaderboard Top 5</div>
          <div style={{ display: "grid", gap: 4 }}>
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
            ? "Re-join the leaderboard and resume earning Nuggies"
            : "Hide my balance from the leaderboard"}
        </button>
        {me.optedOut && (
          <div style={{ fontSize: 11, color: islandTheme.color.textMuted, marginTop: 4 }}>
            You are opted out — you won't appear on the leaderboard and can't earn or spend Nuggies.
          </div>
        )}
      </div>
    </div>
  );
}

function TabBar({ value, onChange }: { value: ItemTab; onChange: (t: ItemTab) => void }) {
  const tabs: { key: ItemTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "title", label: "Titles" },
    { key: "flair", label: "Flairs" },
    { key: "badge", label: "Badges" },
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

function ItemCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: islandTheme.color.panelMutedBg,
        border: `1px solid ${islandTheme.color.border}`,
        borderRadius: islandTheme.radius.card,
        padding: "12px",
      }}
    >
      {children}
    </div>
  );
}
