import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/client.js";
import { IslandButton, IslandCard } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import type { NuggieTransaction, PageId } from "../types.js";

type NuggiesHistoryPageProps = {
  onNavigate: (page: PageId) => void;
};

const PAGE_SIZE = 50;

function relativeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const delta = Math.max(0, Date.now() - then);
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 8) return `${weeks}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}

export default function NuggiesHistoryPage({ onNavigate }: NuggiesHistoryPageProps) {
  const [transactions, setTransactions] = useState<NuggieTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    void apiFetch(`/nuggies/me/transactions?limit=${PAGE_SIZE}&offset=0`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { transactions: NuggieTransaction[]; total: number } | null) => {
        if (!active) return;
        if (d) {
          setTransactions(d.transactions);
          setTotal(d.total);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function loadMore() {
    setLoadingMore(true);
    void apiFetch(`/nuggies/me/transactions?limit=${PAGE_SIZE}&offset=${transactions.length}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { transactions: NuggieTransaction[]; total: number } | null) => {
        if (d) {
          setTransactions((prev) => [...prev, ...d.transactions]);
          setTotal(d.total);
        }
      })
      .finally(() => setLoadingMore(false));
  }

  const { biggestGain, biggestLoss } = useMemo(() => {
    let gain = 0;
    let loss = 0;
    for (const tx of transactions) {
      if (tx.amount > gain) gain = tx.amount;
      if (tx.amount < loss) loss = tx.amount;
    }
    return { biggestGain: gain, biggestLoss: loss };
  }, [transactions]);

  const hasMore = transactions.length < total;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          className="island-mono"
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: islandTheme.color.textMuted
          }}
        >
          ₦ Nuggies · History
        </span>
        <h1 className="island-display" style={{ margin: 0, fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 800 }}>
          Transaction Log
        </h1>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: islandTheme.color.textSubtle, maxWidth: 640 }}>
          Every Nuggie that's washed in or out. Your personal island bank statement.
        </p>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onNavigate("nuggies");
          }}
          style={{ color: islandTheme.color.primaryGlow, fontSize: 13, fontWeight: 600, textDecoration: "none" }}
        >
          ← Back to Balance & Shop
        </a>
      </header>

      {!loading && transactions.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12
          }}
        >
          <SummaryStat label="Transactions" value={total.toLocaleString()} tone="neutral" />
          <SummaryStat label="Biggest gain" value={`+₦${biggestGain.toLocaleString()}`} tone="gain" />
          <SummaryStat label="Biggest loss" value={`-₦${Math.abs(biggestLoss).toLocaleString()}`} tone="loss" />
        </div>
      )}

      <IslandCard style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "20px 16px", fontSize: 13, color: islandTheme.color.textMuted, textAlign: "center" }}>
            Tallying the ledger…
          </div>
        ) : transactions.length === 0 ? (
          <div style={{ padding: "20px 16px", fontSize: 13, color: islandTheme.color.textMuted, textAlign: "center" }}>
            No transactions yet. Earn or spend some Nuggies and they'll show up here.
          </div>
        ) : (
          transactions.map((tx, i) => <TransactionRow key={tx.id} tx={tx} firstRow={i === 0} />)
        )}
      </IslandCard>

      {hasMore && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <IslandButton variant="secondary" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : `Load more (${total - transactions.length} left)`}
          </IslandButton>
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone: "neutral" | "gain" | "loss" }) {
  const color =
    tone === "gain" ? islandTheme.color.successAccent : tone === "loss" ? islandTheme.color.dangerAccent : islandTheme.color.textPrimary;
  return (
    <IslandCard as="div" style={{ display: "grid", gap: 4 }}>
      <div
        className="island-mono"
        style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}
      >
        {label}
      </div>
      <div className="island-display" style={{ fontWeight: 800, fontSize: 20, color }}>
        {value}
      </div>
    </IslandCard>
  );
}

function TransactionRow({ tx, firstRow }: { tx: NuggieTransaction; firstRow: boolean }) {
  const isEarn = tx.amount >= 0;
  const amountColor = isEarn ? islandTheme.color.successAccent : islandTheme.color.dangerAccent;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        padding: "12px 16px",
        alignItems: "center",
        borderTop: firstRow ? "none" : `1px solid ${islandTheme.color.cardBorder}`
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{tx.reason}</div>
        <div
          className="island-mono"
          style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}
        >
          {tx.type} · {relativeAgo(tx.createdAt)}
        </div>
      </div>
      <span className="island-mono" style={{ fontWeight: 800, fontSize: 15, color: amountColor, whiteSpace: "nowrap" }}>
        {isEarn ? "+" : "-"}₦{Math.abs(tx.amount).toLocaleString()}
      </span>
    </div>
  );
}
