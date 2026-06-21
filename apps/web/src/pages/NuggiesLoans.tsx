import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { apiFetch } from "../api/client.js";
import { useRefetchActivity } from "../system/activityContext.js";
import { useNuggiesSignal } from "../system/nuggiesSignal.js";
import { usePushToast } from "../system/toast.js";
import { ConfettiBurst } from "../system/celebration.js";
import { IslandButton, IslandCard, IslandEmptyState, IslandSkeletonCard } from "../islandUi.js";
import { LoanCalculator } from "../components/LoanCalculator.js";
import { LoanLegend } from "../components/LoanLegend.js";
import { LoanRow } from "../components/LoanRow.js";
import { LoanWizard, type LoanWizardMode } from "../components/LoanWizard.js";
import { pathForLoan } from "../lib/routes.js";
import { islandTheme } from "../theme.js";
import type { GuildMember, NuggiesLoan, PageId } from "../types.js";

type NuggiesLoansPageProps = {
  onNavigate: (page: PageId) => void;
  guildMembers: GuildMember[];
  selfDiscordUserId: string;
};

type LoanSettings = { maxDays: number; defaultRate: number; pendingTtlHours: number };

type MeSnapshot = {
  balance: number;
  availableToLend: number;
  committedPrincipal: number;
  optedOut: boolean;
};

type StatusFilter = "active" | "pending" | "history";
type RoleFilter = "all" | "lent" | "borrowed";

function fmt(n: number) {
  return n.toLocaleString();
}

export default function NuggiesLoansPage({ onNavigate, guildMembers, selfDiscordUserId }: NuggiesLoansPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [loans, setLoans] = useState<NuggiesLoan[]>([]);
  const [me, setMe] = useState<MeSnapshot | null>(null);
  const [settings, setSettings] = useState<LoanSettings>({ maxDays: 7, defaultRate: 10, pendingTtlHours: 24 });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [loanPending, setLoanPending] = useState<number | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<LoanWizardMode>("create");
  const [wizardLoanId, setWizardLoanId] = useState<number | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [detailLoan, setDetailLoan] = useState<NuggiesLoan | null>(null);

  const refetchActivity = useRefetchActivity();
  const pushToast = usePushToast();
  const nuggiesTick = useNuggiesSignal();

  const openLoanId = useMemo(() => {
    const id = Number(searchParams.get("loan"));
    return Number.isInteger(id) && id > 0 ? id : null;
  }, [searchParams]);

  const setOpenLoanId = useCallback(
    (id: number | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set("loan", String(id));
          else next.delete("loan");
          return next;
        },
        { replace: true, preventScrollReset: true }
      );
    },
    [setSearchParams]
  );

  const load = useCallback(async () => {
    const [meRes, loansRes, settingsRes] = await Promise.all([
      apiFetch("/nuggies/me"),
      apiFetch("/nuggies/loans"),
      apiFetch("/nuggies/loan/settings"),
    ]);
    if (meRes.ok) {
      const d = (await meRes.json()) as MeSnapshot & { enabled?: boolean };
      if (d.enabled === false) {
        setMe(null);
      } else {
        setMe({
          balance: d.balance ?? 0,
          availableToLend: d.availableToLend ?? d.balance ?? 0,
          committedPrincipal: d.committedPrincipal ?? 0,
          optedOut: d.optedOut ?? false,
        });
      }
    }
    if (loansRes.ok) {
      const d = (await loansRes.json()) as { loans: NuggiesLoan[] };
      setLoans(d.loans ?? []);
    }
    if (settingsRes.ok) {
      const d = (await settingsRes.json()) as LoanSettings;
      setSettings(d);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, nuggiesTick]);

  useEffect(() => {
    if (searchParams.get("action") === "repay") {
      setWizardMode("repay");
      setWizardLoanId(openLoanId);
      setWizardOpen(true);
    }
  }, [searchParams, openLoanId]);

  useEffect(() => {
    if (!openLoanId) {
      setDetailLoan(null);
      return;
    }
    const found = loans.find((l) => l.id === openLoanId);
    if (found) {
      setDetailLoan(found);
      return;
    }
    void apiFetch(`/nuggies/loan/${openLoanId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { loan?: NuggiesLoan } | null) => {
        if (d?.loan) setDetailLoan(d.loan);
      });
  }, [openLoanId, loans]);

  const filteredLoans = useMemo(() => {
    return loans.filter((l) => {
      if (roleFilter === "lent" && !l.isLender) return false;
      if (roleFilter === "borrowed" && l.isLender) return false;
      if (statusFilter === "active") return l.status === "active";
      if (statusFilter === "pending") return l.status === "pending";
      return l.status === "repaid" || l.status === "defaulted" || l.status === "cancelled";
    });
  }, [loans, statusFilter, roleFilter]);

  const activeBorrowed = loans.filter((l) => l.status === "active" && !l.isLender);

  function openWizard(mode: LoanWizardMode, loanId?: number) {
    setWizardMode(mode);
    setWizardLoanId(loanId ?? null);
    setWizardOpen(true);
  }

  async function loanAction(loanId: number, action: "accept" | "repay" | "cancel") {
    if (action === "repay") {
      openWizard("repay", loanId);
      return;
    }
    setLoanPending(loanId);
    const res = await apiFetch(`/nuggies/loan/${loanId}/${action}`, { method: "POST" });
    if (res.ok) {
      pushToast(action === "accept" ? "Loan accepted" : "Offer cancelled", "success");
      await load();
      void refetchActivity();
    } else {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      pushToast(body?.error ?? `Loan ${action} failed`, "error");
    }
    setLoanPending(null);
  }

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 12 }} aria-busy="true">
        <IslandSkeletonCard lines={4} />
        <IslandSkeletonCard lines={6} />
      </div>
    );
  }

  if (me?.optedOut) {
    return (
      <IslandCard>
        <IslandEmptyState
          pose="shrug"
          title="You've opted out of Nuggies"
          body="Loans are part of the island economy. Opt back in from Balance & Shop when you're ready."
          action={<IslandButton variant="primary" onClick={() => onNavigate("nuggies")}>Go to Balance & Shop</IslandButton>}
        />
      </IslandCard>
    );
  }

  if (!me) {
    return (
      <IslandCard>
        <IslandEmptyState pose="shrug" title="Nuggies are resting" body="The economy is turned off right now. Check back later." />
      </IslandCard>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <ConfettiBurst trigger={confetti} />
      <header style={{ display: "grid", gap: 6 }}>
        <span className="island-mono" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: islandTheme.color.textMuted }}>
          ₦ Nuggies · Loans
        </span>
        <h1 className="island-display" style={{ margin: 0, fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 700 }}>
          Loans Dock
        </h1>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: islandTheme.color.textSubtle, maxWidth: 640 }}>
          Lend to crew, borrow when you're short, repay before the tide turns. Offers expire in {settings.pendingTtlHours}h if nobody accepts.
        </p>
        <button
          type="button"
          onClick={() => onNavigate("nuggies")}
          style={{ color: islandTheme.color.primaryGlow, fontSize: 13, fontWeight: 600, textDecoration: "none", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
        >
          ← Back to Balance & Shop
        </button>
      </header>

      <IslandCard style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <HeroMetric label="Balance" value={`₦${fmt(me.balance)}`} />
        <HeroMetric label="Available to lend" value={`₦${fmt(me.availableToLend)}`} accent />
        <HeroMetric label="Active loans" value={String(loans.filter((l) => l.status === "active" || l.status === "pending").length)} />
      </IslandCard>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <IslandButton variant="primary" onClick={() => openWizard("create")}>Create loan offer</IslandButton>
        <IslandButton variant="secondary" onClick={() => openWizard("repay")} disabled={activeBorrowed.length === 0}>
          Repay a loan
        </IslandButton>
      </div>

      <LoanLegend />
      <LoanCalculator
        settings={settings}
        balance={me.balance}
        availableToLend={me.availableToLend}
        committedPrincipal={me.committedPrincipal}
        activeBorrowedLoans={activeBorrowed}
      />

      <IslandCard as="section" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Your loans</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["active", "pending", "history"] as StatusFilter[]).map((f) => (
              <FilterChip key={f} active={statusFilter === f} onClick={() => setStatusFilter(f)} label={f === "history" ? "History" : f.charAt(0).toUpperCase() + f.slice(1)} />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["all", "lent", "borrowed"] as RoleFilter[]).map((f) => (
            <FilterChip key={f} active={roleFilter === f} onClick={() => setRoleFilter(f)} label={f === "all" ? "All roles" : f.charAt(0).toUpperCase() + f.slice(1)} />
          ))}
        </div>

        {filteredLoans.length === 0 ? (
          <IslandEmptyState
            pose="wave"
            title="No loans here"
            body={statusFilter === "pending" ? "No pending offers on the books." : "Nothing in this filter — start an offer or check another tab."}
            action={<IslandButton variant="primary" onClick={() => openWizard("create")}>Create loan offer</IslandButton>}
          />
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {filteredLoans.map((loan) => (
              <LoanRow
                key={loan.id}
                loan={loan}
                balance={me.balance}
                pending={loanPending === loan.id}
                onSelect={(l) => setOpenLoanId(l.id)}
                onAction={(id, action) => void loanAction(id, action)}
              />
            ))}
          </div>
        )}
      </IslandCard>

      {detailLoan && openLoanId ? (
        <IslandCard as="section" style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Loan #{detailLoan.id}</div>
            <IslandButton variant="ghost" onClick={() => setOpenLoanId(null)}>Close</IslandButton>
          </div>
          <LoanRow loan={detailLoan} balance={me.balance} pending={loanPending === detailLoan.id} onAction={(id, action) => void loanAction(id, action)} />
          <div style={{ fontSize: 13, color: islandTheme.color.textSubtle }}>
            Share: <code style={{ fontSize: 12 }}>{window.location.origin}{pathForLoan(detailLoan.id)}</code>
          </div>
          <IslandButton variant="secondary" onClick={() => onNavigate("nuggies-history")}>
            View transaction history
          </IslandButton>
        </IslandCard>
      ) : null}

      <LoanWizard
        open={wizardOpen}
        mode={wizardMode}
        onClose={() => setWizardOpen(false)}
        onSuccess={() => {
          void load();
          void refetchActivity();
          if (wizardMode === "repay") setConfetti((c) => c + 1);
        }}
        balance={me.balance}
        availableToLend={me.availableToLend}
        settings={settings}
        members={guildMembers}
        selfDiscordUserId={selfDiscordUserId}
        loans={loans}
        initialLoanId={wizardLoanId}
      />
    </div>
  );
}

function HeroMetric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="island-mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 22, color: accent ? islandTheme.color.primaryGlow : undefined }}>{value}</div>
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        border: `1px solid ${active ? islandTheme.color.primaryGlow : islandTheme.color.border}`,
        background: active ? islandTheme.color.panelMutedBg : "transparent",
        color: active ? islandTheme.color.textPrimary : islandTheme.color.textSubtle,
      }}
    >
      {label}
    </button>
  );
}
