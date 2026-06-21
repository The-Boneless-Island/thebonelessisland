import { useEffect, useRef, useState } from "react";
import { calcAmountDue, calcDueAt, calcRepayBreakdown, clampLoanDays } from "@island/shared";
import { apiFetch } from "../api/client.js";
import { IslandButton, IslandCard, islandInputStyle } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import type { GuildMember, NuggiesLoan, NuggiesLoanCounterparty } from "../types.js";

type LoanSettings = { maxDays: number; defaultRate: number };

type MemberOption = GuildMember | NuggiesLoanCounterparty;

export type LoanWizardMode = "create" | "repay";

type LoanWizardProps = {
  open: boolean;
  mode: LoanWizardMode;
  onClose: () => void;
  onSuccess: () => void;
  balance: number;
  availableToLend: number;
  settings: LoanSettings;
  members: MemberOption[];
  selfDiscordUserId: string;
  loans: NuggiesLoan[];
  initialLoanId?: number | null;
};

function fmt(n: number) {
  return n.toLocaleString();
}

export function LoanWizard({
  open,
  mode,
  onClose,
  onSuccess,
  balance,
  availableToLend,
  settings,
  members,
  selfDiscordUserId,
  loans,
  initialLoanId,
}: LoanWizardProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [memberQuery, setMemberQuery] = useState("");
  const [borrower, setBorrower] = useState<MemberOption | null>(null);
  const [principal, setPrincipal] = useState(100);
  const [interestPct, setInterestPct] = useState(settings.defaultRate);
  const [days, setDays] = useState(settings.maxDays);
  const [collateral, setCollateral] = useState(0);
  const [selectedLoanId, setSelectedLoanId] = useState<number | null>(initialLoanId ?? null);

  const repayLoans = loans.filter((l) => l.status === "active" && !l.isLender);
  const selectedLoan = repayLoans.find((l) => l.id === selectedLoanId) ?? null;

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setError(null);
    setSubmitting(false);
    setInterestPct(settings.defaultRate);
    setDays(settings.maxDays);
    if (mode === "repay") {
      const id = initialLoanId ?? repayLoans[0]?.id ?? null;
      setSelectedLoanId(id);
      setStep(repayLoans.length <= 1 && id ? 1 : 0);
    }
  }, [open, mode, initialLoanId, settings.defaultRate, settings.maxDays, repayLoans.length]);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
  }, [open, step]);

  if (!open) return null;

  const createSteps = ["Pick crew", "Amount", "Terms", "Review", "Done"];
  const repaySteps = ["Pick loan", "Breakdown", "Confirm", "Done"];
  const steps = mode === "create" ? createSteps : repaySteps;
  const isLast = step >= steps.length - 1;

  const previewDue = calcAmountDue(principal, interestPct);
  const previewDays = clampLoanDays(days, settings.maxDays);
  const previewDueAt = calcDueAt(previewDays);
  const repayBreakdown = selectedLoan
    ? calcRepayBreakdown({
        principal: selectedLoan.principal,
        amountDue: selectedLoan.amountDue,
        collateral: selectedLoan.collateral,
        dueAt: selectedLoan.dueAt,
        balance,
      })
    : null;

  const filteredMembers = members
    .filter((m) => m.discordUserId !== selfDiscordUserId)
    .filter((m) => {
      if (!memberQuery.trim()) return true;
      const q = memberQuery.toLowerCase();
      return m.displayName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q);
    })
    .slice(0, 12);

  async function submitCreate() {
    if (!borrower) return;
    setSubmitting(true);
    setError(null);
    const res = await apiFetch("/nuggies/loan/offer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        toDiscordUserId: borrower.discordUserId,
        amount: principal,
        interestPct,
        durationDays: previewDays,
        collateral,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not create offer");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setStep(steps.length - 1);
    onSuccess();
  }

  async function submitRepay() {
    if (!selectedLoan) return;
    setSubmitting(true);
    setError(null);
    const res = await apiFetch(`/nuggies/loan/${selectedLoan.id}/repay`, { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Repay failed");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setStep(steps.length - 1);
    onSuccess();
  }

  function next() {
    setError(null);
    if (mode === "create" && step === 3) {
      void submitCreate();
      return;
    }
    if (mode === "repay" && step === 2) {
      void submitRepay();
      return;
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  const canNext =
    mode === "create"
      ? (step === 0 && borrower != null) ||
        (step === 1 && principal > 0 && principal <= availableToLend) ||
        (step === 2 && previewDays >= 1) ||
        step === 3
      : (step === 0 && selectedLoan != null) ||
        (step === 1 && repayBreakdown != null) ||
        (step === 2 && repayBreakdown?.canRepay === true);

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.45)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="loan-wizard-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(520px, 100%)", maxHeight: "90vh", overflow: "auto" }}
      >
        <IslandCard style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}>
            <div>
              <div className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted, letterSpacing: "0.08em" }}>
                Step {Math.min(step + 1, steps.length)} / {steps.length}
              </div>
              <h2 id="loan-wizard-title" style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 700 }}>
                {mode === "create" ? "Create loan offer" : "Repay a loan"}
              </h2>
            </div>
            <IslandButton variant="ghost" onClick={onClose}>Close</IslandButton>
          </div>

          {error ? (
            <div style={{ color: islandTheme.color.dangerText, fontSize: 13 }}>{error}</div>
          ) : null}

          {mode === "create" && step === 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              <input
                placeholder="Search crew…"
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
                style={islandInputStyle}
              />
              <div style={{ display: "grid", gap: 6, maxHeight: 220, overflow: "auto" }}>
                {filteredMembers.map((m) => (
                  <button
                    key={m.discordUserId}
                    type="button"
                    onClick={() => setBorrower(m)}
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      borderRadius: islandTheme.radius.control,
                      border: `1px solid ${borrower?.discordUserId === m.discordUserId ? islandTheme.color.primaryGlow : islandTheme.color.border}`,
                      background: borrower?.discordUserId === m.discordUserId ? islandTheme.color.panelMutedBg : "transparent",
                      color: islandTheme.color.textPrimary,
                      cursor: "pointer",
                    }}
                  >
                    {m.displayName}
                    <span style={{ color: islandTheme.color.textMuted }}> @{m.username}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {mode === "create" && step === 1 ? (
            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                Principal (available ₦{fmt(availableToLend)})
                <input
                  type="number"
                  min={1}
                  value={principal}
                  onChange={(e) => setPrincipal(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  style={islandInputStyle}
                />
              </label>
            </div>
          ) : null}

          {mode === "create" && step === 2 ? (
            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                Interest %
                <input type="number" min={0} max={100} value={interestPct} onChange={(e) => setInterestPct(parseFloat(e.target.value) || 0)} style={islandInputStyle} />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                Days (max {settings.maxDays})
                <input type="number" min={1} max={settings.maxDays} value={days} onChange={(e) => setDays(parseInt(e.target.value, 10) || 1)} style={islandInputStyle} />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                Collateral (optional)
                <input type="number" min={0} value={collateral} onChange={(e) => setCollateral(Math.max(0, parseInt(e.target.value, 10) || 0))} style={islandInputStyle} />
              </label>
            </div>
          ) : null}

          {mode === "create" && step === 3 ? (
            <div style={{ fontSize: 13, lineHeight: 1.6, color: islandTheme.color.textSubtle }}>
              Offer <strong>₦{fmt(principal)}</strong> to <strong>{borrower?.displayName}</strong>.
              <br />
              Due back: <strong>₦{fmt(previewDue)}</strong> by {new Date(previewDueAt).toLocaleString()}.
              {collateral > 0 ? <><br />Collateral required: ₦{fmt(collateral)}</> : null}
              <br />
              <span style={{ color: islandTheme.color.dangerText }}>
                If they default, you only recover collateral — not spent principal.
              </span>
            </div>
          ) : null}

          {mode === "create" && step === 4 ? (
            <p style={{ margin: 0, fontSize: 14, color: islandTheme.color.textSubtle }}>
              Offer sent. Share the loan ID from your list so they can accept on web or Discord.
            </p>
          ) : null}

          {mode === "repay" && step === 0 ? (
            <div style={{ display: "grid", gap: 6 }}>
              {repayLoans.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setSelectedLoanId(l.id)}
                  style={{
                    textAlign: "left",
                    padding: "8px 10px",
                    borderRadius: islandTheme.radius.control,
                    border: `1px solid ${selectedLoanId === l.id ? islandTheme.color.primaryGlow : islandTheme.color.border}`,
                    background: "transparent",
                    color: islandTheme.color.textPrimary,
                    cursor: "pointer",
                  }}
                >
                  #{l.id} · due ₦{fmt(l.amountDue)} · {l.counterparty?.displayName ?? "lender"}
                </button>
              ))}
            </div>
          ) : null}

          {mode === "repay" && step === 1 && selectedLoan && repayBreakdown ? (
            <div style={{ fontSize: 13, lineHeight: 1.6, color: islandTheme.color.textSubtle }}>
              Principal ₦{fmt(selectedLoan.principal)} · interest ₦{fmt(repayBreakdown.interestPortion)}
              <br />
              Total due: <strong>₦{fmt(selectedLoan.amountDue)}</strong>
              {repayBreakdown.collateralReturned > 0 ? (
                <><br />Collateral returned: ₦{fmt(repayBreakdown.collateralReturned)}</>
              ) : null}
              {repayBreakdown.bankRunEligible ? <><br />Early repay qualifies for <strong>BANK RUN</strong></> : null}
            </div>
          ) : null}

          {mode === "repay" && step === 2 && repayBreakdown ? (
            <div style={{ fontSize: 13, lineHeight: 1.6, color: islandTheme.color.textSubtle }}>
              Your balance: ₦{fmt(balance)} · paying ₦{fmt(selectedLoan?.amountDue ?? 0)}
              {!repayBreakdown.canRepay ? (
                <div style={{ color: islandTheme.color.dangerText, marginTop: 6 }}>
                  Short ₦{fmt(repayBreakdown.shortfall)} — earn or trade before repaying.
                </div>
              ) : null}
            </div>
          ) : null}

          {mode === "repay" && step === 3 ? (
            <p style={{ margin: 0, fontSize: 14, color: islandTheme.color.textSubtle }}>
              Loan repaid. Collateral returned if any — check your balance on the dock.
            </p>
          ) : null}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            {step > 0 && !isLast ? (
              <IslandButton variant="secondary" onClick={back} disabled={submitting}>Back</IslandButton>
            ) : null}
            {!isLast ? (
              <IslandButton variant="primary" onClick={next} disabled={!canNext || submitting}>
                {submitting ? "…" : step === 3 && mode === "create" ? "Send offer" : step === 2 && mode === "repay" ? "Repay now" : "Next"}
              </IslandButton>
            ) : (
              <IslandButton variant="primary" onClick={onClose}>Done</IslandButton>
            )}
          </div>
        </IslandCard>
      </div>
    </div>
  );
}
