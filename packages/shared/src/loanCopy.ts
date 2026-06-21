export type LoanStatus = "pending" | "active" | "repaid" | "defaulted" | "cancelled";

export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  pending: "Pending",
  active: "Active",
  repaid: "Repaid",
  defaulted: "Defaulted",
  cancelled: "Cancelled",
};

export const LOAN_STATUS_DESCRIPTIONS: Record<LoanStatus, string> = {
  pending: "Offer on the table — no Nuggies moved yet. Expires in 24 hours if not accepted.",
  active: "Funds transferred. Repay principal + interest by the due date.",
  repaid: "Settled in full. Repay before the due date to earn the BANK RUN badge.",
  defaulted: "Missed the due date. Collateral (if any) went to the lender; spent principal stays with the borrower.",
  cancelled: "Offer pulled by the lender or expired without acceptance.",
};

export const LOAN_LEGEND_SECTIONS = [
  {
    title: "The deal",
    body: "A lender offers Nuggies to a crew member. The borrower accepts, spends the principal, then repays the full amount due (principal + interest) by the due date.",
  },
  {
    title: "Interest",
    body: "Simple interest, rounded up. Example: lend ₦100 at 10% → borrower owes ₦110 total.",
  },
  {
    title: "Collateral",
    body: "Optional safety deposit from the borrower, locked on accept. Returned on repay; forfeited to the lender on default.",
  },
  {
    title: "Lender risk",
    body: "If a borrower defaults, you keep any collateral — but you cannot claw back principal they've already spent. Offer collateral on risky loans.",
  },
  {
    title: "BANK RUN badge",
    body: "Repay an active loan before its due date to earn the BANK RUN earned title.",
  },
] as const;

/** Discord embed field chunks for /loan guide */
export function loanGuideEmbedFields(): Array<{ name: string; value: string }> {
  return [
    ...Object.entries(LOAN_STATUS_DESCRIPTIONS).map(([status, desc]) => ({
      name: LOAN_STATUS_LABELS[status as LoanStatus],
      value: desc,
    })),
    {
      name: "Where to act",
      value: "Web: **/nuggies/loans** hub · Discord: `/loan offer`, `accept`, `repay`, `cancel`, `list`, `guide`, `calc`",
    },
  ];
}
