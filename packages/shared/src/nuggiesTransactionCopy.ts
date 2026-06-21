/** User-facing copy for Nuggies ledger rows. Internal `type` codes stay stable for queries. */

export const NUGGIES_TX_TYPE = {
  daily: "daily",
  first_link: "first_link",
  spend: "spend",
  earn: "earn",
  attendance: "attendance",
  admin_grant: "admin_grant",
  admin_deduct: "admin_deduct",
  milestone_bonus: "milestone_bonus",
  trade_in: "trade_in",
  trade_out: "trade_out",
  loan_in: "loan_in",
  loan_out: "loan_out",
  loan_repay: "loan_repay",
  loan_forfeit_in: "loan_forfeit_in",
  loan_forfeit_out: "loan_forfeit_out",
  market_buy: "market_buy",
  market_sell: "market_sell",
  game_coinflip: "game_coinflip",
  game_guessnumber: "game_guessnumber",
  game_blackjack_bet: "game_blackjack_bet",
  game_blackjack: "game_blackjack",
} as const;

export type NuggiesTxType = (typeof NUGGIES_TX_TYPE)[keyof typeof NUGGIES_TX_TYPE];

export type NuggiesTxMetadata = {
  call?: "heads" | "tails";
  outcome?: "heads" | "tails";
  bet?: number;
  payout?: number;
  won?: boolean;
  guess?: number;
  secret?: number;
  blackjackResult?: "win" | "lose" | "push" | "blackjack";
  doubled?: boolean;
  additionalBet?: number;
  isLossSettlement?: boolean;
  isDoubleDown?: boolean;
  itemName?: string;
  threadTitle?: string;
  isForumReply?: boolean;
  counterpartyName?: string;
  feePct?: number;
  gameNightId?: number;
  tierLabel?: string;
  adminReason?: string;
  isCollateral?: boolean;
  collateralReturned?: boolean;
};

export type NuggiesTransactionView = {
  id?: number;
  amount: number;
  type: string;
  reason: string;
  referenceId?: string | null;
  createdAt?: string;
};

export type NuggiesTransactionDisplay = {
  title: string;
  subtitle: string;
  iconKey: string;
};

export type GroupedNuggiesTransaction = NuggiesTransactionView & {
  groupedIds: number[];
  netAmount: number;
};

const fmt = (n: number) => `₦${Math.abs(n).toLocaleString("en-US")}`;

export function casinoGameLabel(game: string): string {
  switch (game) {
    case "coinflip":
      return "Coinflip";
    case "blackjack":
      return "Blackjack";
    case "guessnumber":
      return "Guess the Number";
    default:
      return game.charAt(0).toUpperCase() + game.slice(1);
  }
}

export function transactionCategoryLabel(type: string): string {
  switch (type) {
    case NUGGIES_TX_TYPE.daily:
      return "Daily claim";
    case NUGGIES_TX_TYPE.first_link:
      return "Steam link bonus";
    case NUGGIES_TX_TYPE.spend:
      return "Island shop";
    case NUGGIES_TX_TYPE.earn:
      return "Forums";
    case NUGGIES_TX_TYPE.attendance:
      return "Game night";
    case NUGGIES_TX_TYPE.admin_grant:
    case NUGGIES_TX_TYPE.admin_deduct:
      return "Crew adjustment";
    case NUGGIES_TX_TYPE.milestone_bonus:
      return "Milestone";
    case NUGGIES_TX_TYPE.trade_in:
    case NUGGIES_TX_TYPE.trade_out:
      return "Crew trade";
    case NUGGIES_TX_TYPE.loan_in:
    case NUGGIES_TX_TYPE.loan_out:
    case NUGGIES_TX_TYPE.loan_repay:
    case NUGGIES_TX_TYPE.loan_forfeit_in:
    case NUGGIES_TX_TYPE.loan_forfeit_out:
      return "Loans";
    case NUGGIES_TX_TYPE.market_buy:
    case NUGGIES_TX_TYPE.market_sell:
      return "Marketplace";
    case NUGGIES_TX_TYPE.game_coinflip:
    case NUGGIES_TX_TYPE.game_guessnumber:
      return "Casino";
    case NUGGIES_TX_TYPE.game_blackjack_bet:
    case NUGGIES_TX_TYPE.game_blackjack:
      return "Casino · Blackjack";
    default:
      return type.startsWith("game_") ? "Casino" : "Nuggies";
  }
}

function blackjackOutcomePhrase(result: string, payout: number, bet: number): string {
  switch (result) {
    case "blackjack":
      return payout > bet ? `Natural blackjack — ${fmt(payout)} back` : `Natural blackjack — push`;
    case "win":
      return `Won the hand — ${fmt(payout)} back`;
    case "push":
      return `Push — ${fmt(payout)} returned`;
    case "lose":
      return `Lost the hand — ${fmt(bet)} gone`;
    default:
      return payout > 0 ? `Blackjack — ${fmt(payout)} back` : `Blackjack — lost ${fmt(bet)}`;
  }
}

export function formatNuggiesReason(input: {
  type: string;
  amount: number;
  reason?: string;
  metadata?: NuggiesTxMetadata;
}): string {
  const m = input.metadata ?? {};
  const abs = Math.abs(input.amount);

  switch (input.type) {
    case NUGGIES_TX_TYPE.daily:
      return "Claimed today's shore stipend";
    case NUGGIES_TX_TYPE.first_link:
      return "Welcome bonus for linking Steam";
    case NUGGIES_TX_TYPE.spend:
      return m.itemName ? `Bought ${m.itemName} from the island shop` : "Spent at the island shop";
    case NUGGIES_TX_TYPE.earn:
      if (m.threadTitle && m.isForumReply) {
        return `Replied in the forums — ${m.threadTitle}`;
      }
      return m.threadTitle
        ? `Posted in the forums — ${m.threadTitle}`
        : "Earned Nuggies in the forums";
    case NUGGIES_TX_TYPE.attendance:
      return m.gameNightId != null
        ? `Showed up for game night #${m.gameNightId}`
        : "Game night attendance reward";
    case NUGGIES_TX_TYPE.admin_grant:
      return m.adminReason?.trim() ? m.adminReason.trim() : `Crew grant — ${fmt(input.amount)}`;
    case NUGGIES_TX_TYPE.admin_deduct:
      return m.adminReason?.trim() ? m.adminReason.trim() : `Crew deduction — ${fmt(abs)}`;
    case NUGGIES_TX_TYPE.milestone_bonus:
      return m.tierLabel ? `Milestone reached — ${m.tierLabel}` : "Milestone bonus";
    case NUGGIES_TX_TYPE.trade_out:
      return m.counterpartyName
        ? `Sent ${fmt(abs)} to ${m.counterpartyName}${m.feePct != null ? ` (${m.feePct}% dock fee)` : ""}`
        : `Sent ${fmt(abs)} to a crewmate`;
    case NUGGIES_TX_TYPE.trade_in:
      return m.counterpartyName
        ? `Received ${fmt(abs)} from ${m.counterpartyName}`
        : `Received ${fmt(abs)} from a crewmate`;
    case NUGGIES_TX_TYPE.loan_out:
      if (m.isCollateral) {
        return "Collateral locked for a loan";
      }
      return "Loan issued to a crewmate";
    case NUGGIES_TX_TYPE.loan_in:
      return "Loan received from a crewmate";
    case NUGGIES_TX_TYPE.loan_repay:
      return input.amount < 0 ? "Repaid a loan" : "Loan repayment received";
    case NUGGIES_TX_TYPE.loan_forfeit_in:
      if (m.collateralReturned) {
        return "Collateral returned after repaying the loan";
      }
      return "Loan defaulted — collateral received";
    case NUGGIES_TX_TYPE.loan_forfeit_out:
      return "Loan defaulted — collateral forfeited";
    case NUGGIES_TX_TYPE.market_buy:
      return "Bought from the crew marketplace";
    case NUGGIES_TX_TYPE.market_sell:
      return "Sold on the crew marketplace";
    case NUGGIES_TX_TYPE.game_coinflip: {
      const { call, outcome, bet = abs, payout = 0, won } = m;
      if (call && outcome) {
        return won
          ? `Won the flip — called ${call}, landed ${outcome} (+${fmt(payout)})`
          : `Lost the flip — called ${call}, landed ${outcome} (${fmt(bet)} in)`;
      }
      return input.amount >= 0 ? `Coinflip win (+${fmt(input.amount)})` : `Coinflip loss (${fmt(abs)} in)`;
    }
    case NUGGIES_TX_TYPE.game_guessnumber: {
      const { guess, secret, bet = abs, payout = 0, won } = m;
      if (guess != null && secret != null) {
        return won
          ? `Nailed it — guessed ${guess}, secret was ${secret} (+${fmt(payout)})`
          : `Missed the number — guessed ${guess}, secret was ${secret} (${fmt(bet)} in)`;
      }
      return input.amount >= 0 ? `Guess the Number win (+${fmt(input.amount)})` : `Guess the Number loss (${fmt(abs)} in)`;
    }
    case NUGGIES_TX_TYPE.game_blackjack_bet:
      if (m.isLossSettlement) {
        return `Blackjack — lost ${fmt(abs)}`;
      }
      if (m.isDoubleDown) {
        return `Doubled down — ${fmt(abs)} more on Blackjack`;
      }
      return `Sat down at Blackjack — ${fmt(abs)} in`;
    case NUGGIES_TX_TYPE.game_blackjack: {
      const result = m.blackjackResult ?? "win";
      const bet = m.bet ?? abs;
      const payout = m.payout ?? input.amount;
      return blackjackOutcomePhrase(result, payout, bet);
    }
    default:
      return input.reason?.trim() || transactionCategoryLabel(input.type);
  }
}

const LEGACY_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: NUGGIES_TX_TYPE.game_coinflip, pattern: /^Coinflip (\w+) → (\w+) \(bet (\d+), payout (\d+)\)$/ },
  { type: NUGGIES_TX_TYPE.game_guessnumber, pattern: /^Guess number (\d+) \(secret (\d+), bet (\d+), payout (\d+)\)$/ },
  { type: NUGGIES_TX_TYPE.game_blackjack_bet, pattern: /^Blackjack bet placed \(bet (\d+)\)$/ },
  { type: NUGGIES_TX_TYPE.game_blackjack_bet, pattern: /^Blackjack double-down \(additional (\d+)\)$/ },
  { type: NUGGIES_TX_TYPE.game_blackjack, pattern: /^Blackjack (\w+) \(bet (\d+), payout (\d+)\)$/ },
  { type: NUGGIES_TX_TYPE.daily, pattern: /^Daily claim$/ },
  { type: NUGGIES_TX_TYPE.first_link, pattern: /^First Steam account link bonus$/ },
  { type: NUGGIES_TX_TYPE.spend, pattern: /^Bought (.+)$/ },
  { type: NUGGIES_TX_TYPE.earn, pattern: /^Forum thread: (.+)$/ },
  { type: NUGGIES_TX_TYPE.earn, pattern: /^Forum reply on: (.+)$/ },
  { type: NUGGIES_TX_TYPE.attendance, pattern: /^Game night attendance reward \(night #(\d+)\)$/ },
  { type: NUGGIES_TX_TYPE.trade_out, pattern: /^Sent to (\d+) \((\d+)% fee\)$/ },
  { type: NUGGIES_TX_TYPE.trade_in, pattern: /^Received from (\d+)$/ },
  { type: NUGGIES_TX_TYPE.milestone_bonus, pattern: /^Reached (.+)$/ },
  { type: NUGGIES_TX_TYPE.loan_out, pattern: /^Collateral locked for loan$/ },
  { type: NUGGIES_TX_TYPE.loan_out, pattern: /^Loan issued$/ },
  { type: NUGGIES_TX_TYPE.loan_in, pattern: /^Loan received$/ },
  { type: NUGGIES_TX_TYPE.loan_repay, pattern: /^Loan repaid$/ },
  { type: NUGGIES_TX_TYPE.loan_repay, pattern: /^Loan repayment received$/ },
  { type: NUGGIES_TX_TYPE.loan_forfeit_in, pattern: /^Loan defaulted — collateral received$/ },
  { type: NUGGIES_TX_TYPE.loan_forfeit_in, pattern: /^Collateral returned after repayment$/ },
  { type: NUGGIES_TX_TYPE.loan_forfeit_out, pattern: /^Loan defaulted — collateral forfeited$/ },
  { type: NUGGIES_TX_TYPE.market_buy, pattern: /^Marketplace purchase$/ },
  { type: NUGGIES_TX_TYPE.market_sell, pattern: /^Marketplace sale$/ },
];

export function isLegacyNuggiesReason(type: string, reason: string): boolean {
  return LEGACY_PATTERNS.some((entry) => entry.type === type && entry.pattern.test(reason));
}

export function parseLegacyReason(type: string, reason: string): NuggiesTxMetadata | null {
  for (const entry of LEGACY_PATTERNS) {
    if (entry.type !== type) continue;
    const match = reason.match(entry.pattern);
    if (!match) continue;

    switch (type) {
      case NUGGIES_TX_TYPE.game_coinflip: {
        const bet = parseInt(match[3], 10);
        const payout = parseInt(match[4], 10);
        return {
          call: match[1] as "heads" | "tails",
          outcome: match[2] as "heads" | "tails",
          bet,
          payout,
          won: payout > 0,
        };
      }
      case NUGGIES_TX_TYPE.game_guessnumber: {
        const payout = parseInt(match[4], 10);
        return {
          guess: parseInt(match[1], 10),
          secret: parseInt(match[2], 10),
          bet: parseInt(match[3], 10),
          payout,
          won: payout > 0,
        };
      }
      case NUGGIES_TX_TYPE.game_blackjack_bet:
        if (reason.includes("double-down")) {
          return { isDoubleDown: true, additionalBet: parseInt(match[1], 10), bet: parseInt(match[1], 10) };
        }
        return { bet: parseInt(match[1], 10) };
      case NUGGIES_TX_TYPE.game_blackjack:
        return {
          blackjackResult: match[1] as NuggiesTxMetadata["blackjackResult"],
          bet: parseInt(match[2], 10),
          payout: parseInt(match[3], 10),
        };
      case NUGGIES_TX_TYPE.spend:
        return { itemName: match[1] };
      case NUGGIES_TX_TYPE.earn:
        return { threadTitle: match[1], isForumReply: reason.startsWith("Forum reply") };
      case NUGGIES_TX_TYPE.attendance:
        return { gameNightId: parseInt(match[1], 10) };
      case NUGGIES_TX_TYPE.trade_out:
        return { counterpartyName: match[1], feePct: parseInt(match[2], 10) };
      case NUGGIES_TX_TYPE.trade_in:
        return { counterpartyName: match[1] };
      case NUGGIES_TX_TYPE.loan_forfeit_in:
        if (reason.includes("returned")) {
          return { collateralReturned: true };
        }
        return {};
      case NUGGIES_TX_TYPE.milestone_bonus:
        return { tierLabel: match[1] };
      default:
        return {};
    }
  }
  return null;
}

function iconKeyForType(type: string, amount: number): string {
  switch (type) {
    case NUGGIES_TX_TYPE.daily:
      return "daily";
    case NUGGIES_TX_TYPE.attendance:
      return "attendance";
    case NUGGIES_TX_TYPE.first_link:
      return "first_link";
    case NUGGIES_TX_TYPE.admin_grant:
    case NUGGIES_TX_TYPE.admin_deduct:
      return "admin";
    case NUGGIES_TX_TYPE.spend:
    case NUGGIES_TX_TYPE.market_buy:
      return "shop";
    case NUGGIES_TX_TYPE.market_sell:
      return "market";
    case NUGGIES_TX_TYPE.trade_in:
    case NUGGIES_TX_TYPE.loan_in:
    case NUGGIES_TX_TYPE.loan_repay:
      return amount >= 0 ? "inbound" : "outbound";
    case NUGGIES_TX_TYPE.trade_out:
    case NUGGIES_TX_TYPE.loan_out:
    case NUGGIES_TX_TYPE.loan_forfeit_out:
      return "outbound";
    case NUGGIES_TX_TYPE.loan_forfeit_in:
      return "inbound";
    case NUGGIES_TX_TYPE.earn:
      return "forums";
    case NUGGIES_TX_TYPE.milestone_bonus:
      return "milestone";
    case NUGGIES_TX_TYPE.game_coinflip:
    case NUGGIES_TX_TYPE.game_guessnumber:
    case NUGGIES_TX_TYPE.game_blackjack_bet:
    case NUGGIES_TX_TYPE.game_blackjack:
      return "casino";
    default:
      return amount >= 0 ? "gain" : "loss";
  }
}

export function describeNuggiesTransaction(tx: NuggiesTransactionView): NuggiesTransactionDisplay {
  const metadata = parseLegacyReason(tx.type, tx.reason);
  const title =
    metadata || isLegacyNuggiesReason(tx.type, tx.reason)
      ? formatNuggiesReason({ type: tx.type, amount: tx.amount, metadata: metadata ?? undefined })
      : tx.reason.trim() || transactionCategoryLabel(tx.type);

  return {
    title,
    subtitle: transactionCategoryLabel(tx.type),
    iconKey: iconKeyForType(tx.type, tx.amount),
  };
}

/** Collapse casino rows that share a game:{sessionId} reference into one net line. */
export function groupNuggiesTransactions(txs: NuggiesTransactionView[]): GroupedNuggiesTransaction[] {
  const out: GroupedNuggiesTransaction[] = [];
  const used = new Set<number>();

  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i];
    if (tx.id != null && used.has(tx.id)) continue;

    const ref = tx.referenceId;
    if (ref?.startsWith("game:")) {
      const group = txs.filter((t) => t.referenceId === ref);
      if (group.length > 1) {
        const netAmount = group.reduce((sum, t) => sum + t.amount, 0);
        const ids = group.map((t) => t.id).filter((id): id is number => id != null);
        ids.forEach((id) => used.add(id));

        const payoutRow = group.find((t) => t.type === NUGGIES_TX_TYPE.game_blackjack);
        const betTotal = Math.abs(
          group.filter((t) => t.type === NUGGIES_TX_TYPE.game_blackjack_bet).reduce((s, t) => s + t.amount, 0)
        );

        let title: string;
        if (payoutRow) {
          const meta = parseLegacyReason(payoutRow.type, payoutRow.reason);
          title = formatNuggiesReason({
            type: payoutRow.type,
            amount: payoutRow.amount,
            metadata: meta ?? { bet: betTotal, payout: payoutRow.amount },
          });
        } else if (netAmount < 0) {
          title = formatNuggiesReason({
            type: NUGGIES_TX_TYPE.game_blackjack_bet,
            amount: netAmount,
            metadata: { isLossSettlement: true, bet: betTotal || Math.abs(netAmount) },
          });
        } else {
          title = describeNuggiesTransaction({ ...tx, amount: netAmount }).title;
        }

        out.push({
          ...tx,
          amount: netAmount,
          reason: title,
          groupedIds: ids,
          netAmount,
        });
        continue;
      }
    }

    if (tx.id != null) used.add(tx.id);
    out.push({ ...tx, groupedIds: tx.id != null ? [tx.id] : [], netAmount: tx.amount });
  }

  return out;
}
