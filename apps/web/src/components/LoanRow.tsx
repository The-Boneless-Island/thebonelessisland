import { IslandButton, IslandStatusPill } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import { LOAN_STATUS_LABELS } from "@island/shared";
import type { NuggiesLoan } from "../types.js";

function fmt(n: number) {
  return n.toLocaleString();
}

type LoanRowProps = {
  loan: NuggiesLoan;
  balance?: number;
  pending?: boolean;
  compact?: boolean;
  onSelect?: (loan: NuggiesLoan) => void;
  onAction?: (loanId: number, action: "accept" | "repay" | "cancel") => void;
};

export function LoanRow({ loan, balance, pending, compact, onSelect, onAction }: LoanRowProps) {
  const overdue = loan.status === "active" && new Date(loan.dueAt).getTime() < Date.now();
  const due = new Date(loan.dueAt);
  const dueLabel = due.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const role = loan.isLender ? "Lent" : "Borrowed";
  const arrow = loan.isLender ? "📤" : "📥";
  const counterparty = loan.counterparty?.displayName ?? "Crew member";
  const statusLabel = LOAN_STATUS_LABELS[loan.status] ?? loan.status;

  return (
    <div
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect ? () => onSelect(loan) : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(loan);
              }
            }
          : undefined
      }
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: compact ? "8px 10px" : "10px 12px",
        borderRadius: islandTheme.radius.control,
        background: islandTheme.color.panelMutedBg,
        border: `1px solid ${overdue ? "rgba(239,68,68,0.45)" : islandTheme.color.border}`,
        fontSize: 13,
        flexWrap: "wrap",
        cursor: onSelect ? "pointer" : undefined,
      }}
    >
      <span style={{ fontSize: 18 }} aria-hidden="true">{arrow}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>
          {role} ₦{fmt(loan.principal)} · due ₦{fmt(loan.amountDue)}
          {!compact && loan.counterparty ? (
            <span style={{ fontWeight: 500, color: islandTheme.color.textSubtle }}> · {counterparty}</span>
          ) : null}
        </div>
        <div style={{ color: islandTheme.color.textMuted, fontSize: 12, marginTop: 2 }}>
          #{loan.id} ·{" "}
          {overdue || loan.status === "defaulted" ? (
            <IslandStatusPill tone="danger">{statusLabel}</IslandStatusPill>
          ) : loan.status === "active" || loan.status === "repaid" ? (
            <IslandStatusPill tone="success">{statusLabel}</IslandStatusPill>
          ) : (
            statusLabel
          )}
          {" · "}
          {overdue ? "OVERDUE · " : ""}due {dueLabel}
          {loan.collateral > 0 ? ` · collateral ₦${fmt(loan.collateral)}` : ""}
          {loan.interestRatePct != null ? ` · ${loan.interestRatePct}% interest` : ""}
        </div>
      </div>
      {onAction ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
          {loan.status === "pending" && !loan.isLender ? (
            <IslandButton variant="primary" disabled={pending} onClick={() => onAction(loan.id, "accept")}>
              {pending ? "…" : "Accept"}
            </IslandButton>
          ) : null}
          {loan.status === "pending" && loan.isLender ? (
            <IslandButton variant="secondary" disabled={pending} onClick={() => onAction(loan.id, "cancel")}>
              {pending ? "…" : "Cancel"}
            </IslandButton>
          ) : null}
          {loan.status === "active" && !loan.isLender ? (
            <IslandButton
              variant="primary"
              disabled={pending || (balance != null && balance < loan.amountDue)}
              onClick={() => onAction(loan.id, "repay")}
            >
              {pending ? "…" : "Repay"}
            </IslandButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
