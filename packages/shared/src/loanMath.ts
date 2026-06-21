export const MS_PER_DAY = 86_400_000;
export const PENDING_OFFER_TTL_HOURS = 24;

export function calcAmountDue(principal: number, interestPct: number): number {
  const rate = interestPct / 100;
  return Math.ceil(principal * (1 + rate));
}

export function calcInterestPortion(principal: number, amountDue: number): number {
  return Math.max(0, amountDue - principal);
}

export function calcDueAt(days: number, fromMs = Date.now()): string {
  return new Date(fromMs + days * MS_PER_DAY).toISOString();
}

export function calcLiquidity(balance: number, committedPrincipal: number): {
  balance: number;
  committedPrincipal: number;
  availableToLend: number;
} {
  return {
    balance,
    committedPrincipal,
    availableToLend: Math.max(0, balance - committedPrincipal),
  };
}

export function clampLoanDays(requested: number | undefined, maxDays: number): number {
  const d = requested ?? maxDays;
  return Math.min(Math.max(1, Math.floor(d)), maxDays);
}

export function calcRepayBreakdown(params: {
  principal: number;
  amountDue: number;
  collateral: number;
  dueAt: string;
  balance: number;
  nowMs?: number;
}): {
  interestPortion: number;
  shortfall: number;
  collateralReturned: number;
  bankRunEligible: boolean;
  canRepay: boolean;
} {
  const interestPortion = calcInterestPortion(params.principal, params.amountDue);
  const shortfall = Math.max(0, params.amountDue - params.balance);
  const dueAtMs = new Date(params.dueAt).getTime();
  const now = params.nowMs ?? Date.now();
  const bankRunEligible = Number.isFinite(dueAtMs) && now < dueAtMs;
  return {
    interestPortion,
    shortfall,
    collateralReturned: params.collateral,
    bankRunEligible,
    canRepay: params.balance >= params.amountDue,
  };
}

export function suggestCollateral(principal: number, interestPct: number): number {
  const interest = calcInterestPortion(principal, calcAmountDue(principal, interestPct));
  return Math.max(interest, Math.ceil(principal * 0.1));
}
