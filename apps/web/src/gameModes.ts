import type { GameModeFlags } from "./types.js";

// Steam capability flags → short human labels. Shared by night cards, wishlist
// cards, library rows, and the game detail drawer so the wording stays in sync.
export function modePills(flags: GameModeFlags | null | undefined): string[] {
  if (!flags) return [];
  const pills: string[] = [];
  if (flags.isSinglePlayer) pills.push("Single-player");
  if (flags.isOnlineCoop) pills.push("Online co-op");
  if (flags.isLanCoop) pills.push("LAN co-op");
  if (flags.isSharedSplitCoop) pills.push("Split-screen");
  if (flags.isOnlinePvp) pills.push("PvP");
  if (flags.isMmo) pills.push("MMO");
  return pills;
}

/** Format integer cents as a USD price string. */
export function formatCents(cents: number | null | undefined): string | null {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
  return `$${(cents / 100).toFixed(2)}`;
}
