import { useMemo, useState } from "react";
import { calcAmountDue, calcDueAt, calcRepayBreakdown, suggestCollateral } from "@island/shared";
import { IslandCard, islandInputStyle } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import type { NuggiesLoan } from "../types.js";

type LoanSettings = {
  maxDays: number;
  defaultRate: number;
};

type LoanCalculatorProps = {
  settings: LoanSettings;
  balance: number;
  availableToLend: number;
  committedPrincipal: number;
  activeBorrowedLoans: NuggiesLoan[];
};

function fmt(n: number) {
  return n.toLocaleString();
}

export function LoanCalculator({
  settings,
  balance,
  availableToLend,
  committedPrincipal,
  activeBorrowedLoans,
}: LoanCalculatorProps) {
  const [principal, setPrincipal] = useState(100);
  const [interestPct, setInterestPct] = useState(settings.defaultRate);
  const [days, setDays] = useState(settings.maxDays);
  const [previewLoanId, setPreviewLoanId] = useState<number | "">("");

  const preview = useMemo(() => {
    const amountDue = calcAmountDue(principal, interestPct);
    return {
      amountDue,
      interestPortion: amountDue - principal,
      dueAt: calcDueAt(Math.min(days, settings.maxDays)),
      suggestedCollateral: suggestCollateral(principal, interestPct),
    };
  }, [principal, interestPct, days, settings.maxDays]);

  const selectedLoan = activeBorrowedLoans.find((l) => l.id === previewLoanId) ?? null;
  const repayPreview = selectedLoan
    ? calcRepayBreakdown({
        principal: selectedLoan.principal,
        amountDue: selectedLoan.amountDue,
        collateral: selectedLoan.collateral,
        dueAt: selectedLoan.dueAt,
        balance,
      })
    : null;

  return (
    <IslandCard as="section" style={{ display: "grid", gap: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>Loan tools</div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
          fontSize: 13,
        }}
      >
        <Metric label="Your balance" value={`₦${fmt(balance)}`} />
        <Metric label="Committed to offers" value={`₦${fmt(committedPrincipal)}`} />
        <Metric label="Available to lend" value={`₦${fmt(availableToLend)}`} accent />
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Offer calculator</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Principal
            <input
              type="number"
              min={1}
              value={principal}
              onChange={(e) => setPrincipal(Math.max(1, parseInt(e.target.value, 10) || 1))}
              style={islandInputStyle}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Interest %
            <input
              type="number"
              min={0}
              max={100}
              value={interestPct}
              onChange={(e) => setInterestPct(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
              style={islandInputStyle}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Days (max {settings.maxDays})
            <input
              type="number"
              min={1}
              max={settings.maxDays}
              value={days}
              onChange={(e) => setDays(Math.min(settings.maxDays, Math.max(1, parseInt(e.target.value, 10) || 1)))}
              style={islandInputStyle}
            />
          </label>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
          Borrower would owe <strong>₦{fmt(preview.amountDue)}</strong> (₦{fmt(preview.interestPortion)} interest) · due{" "}
          {new Date(preview.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          {principal > availableToLend ? (
            <span style={{ color: islandTheme.color.dangerText }}> · Exceeds your available-to-lend</span>
          ) : null}
          <br />
          Suggested collateral (guidance): ₦{fmt(preview.suggestedCollateral)}
        </p>
      </div>

      {activeBorrowedLoans.length > 0 ? (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Repay preview</div>
          <select
            value={previewLoanId}
            onChange={(e) => setPreviewLoanId(e.target.value ? parseInt(e.target.value, 10) : "")}
            style={islandInputStyle}
          >
            <option value="">Pick an active loan…</option>
            {activeBorrowedLoans.map((l) => (
              <option key={l.id} value={l.id}>
                #{l.id} · due ₦{fmt(l.amountDue)} · {l.counterparty?.displayName ?? "lender"}
              </option>
            ))}
          </select>
          {repayPreview && selectedLoan ? (
            <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
              Pay <strong>₦{fmt(selectedLoan.amountDue)}</strong>
              {repayPreview.collateralReturned > 0
                ? ` · collateral ₦${fmt(repayPreview.collateralReturned)} returned`
                : ""}
              {repayPreview.bankRunEligible ? " · Early repay earns BANK RUN" : ""}
              {!repayPreview.canRepay ? (
                <span style={{ color: islandTheme.color.dangerText }}> · Short ₦{fmt(repayPreview.shortfall)}</span>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </IslandCard>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: islandTheme.radius.control,
        background: islandTheme.color.panelMutedBg,
        border: `1px solid ${islandTheme.color.border}`,
      }}
    >
      <div className="island-mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}>
        {label}
      </div>
      <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4, color: accent ? islandTheme.color.primaryGlow : undefined }}>
        {value}
      </div>
    </div>
  );
}
