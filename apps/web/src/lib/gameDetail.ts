// Shared response shape for GET /steam/game/:appId — consumed by both the
// Library quick-peek drawer (GameDetailDrawer) and the full game landing page
// (GameLanding) so the two never drift out of sync.

import type { SpecItem } from "../islandUi.js";

export type GameStore = {
  isSinglePlayer: boolean;
  isOnlineCoop: boolean;
  isLanCoop: boolean;
  isSharedSplitCoop: boolean;
  isOnlinePvp: boolean;
  isMmo: boolean;
  mpMaxPlayersApprox: number | null;
  priceInitialCents: number | null;
  priceFinalCents: number | null;
  priceDiscountPct: number | null;
  isFree: boolean;
  releaseComingSoon: boolean;
  releaseDateText: string | null;
  shortDescription: string | null;
  screenshots: Array<{ thumb: string; full: string }>;
  metacriticScore: number | null;
  metacriticUrl: string | null;
  platformWindows: boolean | null;
  platformMac: boolean | null;
  platformLinux: boolean | null;
  controllerSupport: string | null;
  historicalLowCents: number | null;
  /** Hero/background art, when Steam store details have been fetched. */
  backgroundUrl: string | null;
};

export type CatalogueAchievement = {
  displayName: string | null;
  description: string | null;
  iconUrl: string | null;
  globalUnlockPct: number | null;
};

export type GameOwner = {
  discordUserId: string;
  displayName: string;
  avatarUrl: string | null;
  playtimeForever: number;
  playtime2Weeks: number;
  lastPlayedAt: string | null;
};

export type GameWishlister = {
  discordUserId: string;
  displayName: string;
  avatarUrl: string | null;
  addedAt: string | null;
};

export type GameAchievement = {
  displayName: string;
  unlocked: number;
  total: number;
  completionPct: number;
};

export type GameNews = {
  title: string;
  url: string;
  publishedAt: string;
  aiSummary: string | null;
  aiLabel: string | null;
};

export type GameDetail = {
  appId: number;
  name: string;
  headerImageUrl: string | null;
  store: GameStore;
  achievementCatalogue: CatalogueAchievement[];
  owners: GameOwner[];
  wishlistedBy: GameWishlister[];
  achievements: GameAchievement[];
  news: GameNews[];
};

export function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function formatHours(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0h";
  const hours = minutes / 60;
  if (hours < 1) return `${Math.round(minutes)}m`;
  return `${Math.round(hours).toLocaleString()}h`;
}

export function formatPrice(store: GameStore): string {
  if (store.isFree) return "Free";
  if (typeof store.priceFinalCents !== "number") return "—";
  return `$${(store.priceFinalCents / 100).toFixed(2)}`;
}

export function formatNewsDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function metacriticColor(score: number): string {
  if (score >= 75) return "#a3e635"; // green
  if (score >= 50) return "#fde047"; // yellow
  return "#fb7185"; // red
}

export function memberInitials(name: string): string {
  return (name || "??").trim().slice(0, 2).toUpperCase();
}

export function capabilitySpecItems(store: GameStore): SpecItem[] {
  const items: SpecItem[] = [];
  if (store.isSinglePlayer) items.push({ icon: "single", label: "Single-player", color: "#2dd4bf" });
  if (store.isOnlineCoop) items.push({ icon: "coop", label: "Online co-op", color: "#a3e635" });
  if (store.isLanCoop) items.push({ icon: "coop", label: "LAN co-op", color: "#a3e635" });
  if (store.isSharedSplitCoop) items.push({ icon: "split", label: "Split-screen", color: "#ffd166" });
  if (store.isOnlinePvp) items.push({ icon: "pvp", label: "PvP", color: "#ff7a59" });
  if (store.isMmo) items.push({ icon: "players", label: "MMO", color: "#f472b6" });
  if (typeof store.mpMaxPlayersApprox === "number" && store.mpMaxPlayersApprox > 1) {
    items.push({ icon: "players", label: `Up to ${store.mpMaxPlayersApprox}`, color: "#a78bfa" });
  }
  return items;
}
