import type { ReactNode } from "react";
import {
  describeNuggiesTransaction,
  groupNuggiesTransactions,
  type GroupedNuggiesTransaction,
  type NuggiesTransactionView,
} from "@island/shared";
import type { NuggieTransaction } from "../types.js";
import { NuggieCoin } from "../components/NuggieCoin.js";

export function toTransactionView(tx: NuggieTransaction): NuggiesTransactionView {
  return {
    id: tx.id,
    amount: tx.amount,
    type: tx.type,
    reason: tx.reason,
    referenceId: tx.referenceId,
    createdAt: tx.createdAt,
  };
}

export function displayTransactions(txs: NuggieTransaction[]): GroupedNuggiesTransaction[] {
  return groupNuggiesTransactions(txs.map(toTransactionView));
}

export function renderTransactionIcon(iconKey: string): ReactNode {
  switch (iconKey) {
    case "daily":
      return <NuggieCoin size={18} />;
    case "attendance":
      return "🎮";
    case "casino":
      return "🎲";
    case "first_link":
      return "🔗";
    case "admin":
      return "⚙️";
    case "shop":
      return "🛒";
    case "market":
      return "🏪";
    case "inbound":
      return "📥";
    case "outbound":
      return "📤";
    case "forums":
      return "💬";
    case "milestone":
      return "🏅";
    case "gain":
      return "➕";
    case "loss":
      return "➖";
    default:
      return "🍗";
  }
}

export function getTransactionDisplay(tx: NuggieTransaction) {
  return describeNuggiesTransaction(toTransactionView(tx));
}
