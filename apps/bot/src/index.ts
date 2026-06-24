import { loanGuideEmbedFields } from "@island/shared";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  ComponentType,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { loadSecrets } from "./lib/secrets.js";
import { installRedactor } from "./lib/logger.js";
import { initSentry, Sentry } from "./lib/sentry.js";
import { installProcessFatalHandlers } from "./lib/structuredLog.js";
import { renderRankCard } from "./cards/index.js";

dotenv.config({ path: "../../.env" });

await loadSecrets();
installRedactor();
initSentry();
installProcessFatalHandlers("bot");

const token = process.env.DISCORD_BOT_TOKEN ?? "";
const clientId = process.env.DISCORD_BOT_CLIENT_ID ?? "";
const guildId = process.env.DISCORD_GUILD_ID ?? "";
const apiBase = process.env.API_BASE_URL ?? "http://localhost:3000";
const botApiSharedSecret = process.env.BOT_API_SHARED_SECRET ?? "";

// ── API Helper ────────────────────────────────────────────────────────────────

async function api(
  method: string,
  path: string,
  discordUserId: string,
  body?: unknown,
  idempotencyKey?: string
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-island-bot-secret": botApiSharedSecret,
    "x-discord-user-id": discordUserId,
  };
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

/** Internal endpoints don't require x-discord-user-id; just the bot secret. */
async function internalApi(
  method: string,
  path: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-island-bot-secret": botApiSharedSecret,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

// ── Autocomplete ──────────────────────────────────────────────────────────────

type AutocompleteChoice = { name: string; value: string | number };

/**
 * Maps (command, subcommand, focused option) → internal autocomplete endpoint,
 * fetches up to 25 contextually-correct suggestions, and returns them in the
 * shape Discord expects. Discord enforces a 3s deadline; bail to `[]` on any
 * error so the dropdown just goes empty instead of crashing the interaction.
 */
async function fetchAutocomplete(
  commandName: string,
  subcommand: string | null,
  optionName: string,
  focusedValue: string,
  discordUserId: string
): Promise<AutocompleteChoice[]> {
  const q = encodeURIComponent(focusedValue ?? "");
  const uid = encodeURIComponent(discordUserId);
  let path: string | null = null;

  if (commandName === "buy" && optionName === "item") {
    path = `/internal/autocomplete/shop?discordUserId=${uid}&q=${q}`;
  } else if (commandName === "equip" && optionName === "item") {
    path = `/internal/autocomplete/inventory?discordUserId=${uid}&q=${q}`;
  } else if (commandName === "market" && subcommand === "list" && optionName === "item") {
    path = `/internal/autocomplete/inventory?discordUserId=${uid}&q=${q}&exclude_listed=true`;
  } else if (commandName === "market" && subcommand === "buy" && optionName === "id") {
    path = `/internal/autocomplete/market-listings?discordUserId=${uid}&q=${q}&seller=others`;
  } else if (commandName === "market" && subcommand === "cancel" && optionName === "id") {
    path = `/internal/autocomplete/market-listings?discordUserId=${uid}&q=${q}&seller=mine`;
  } else if (commandName === "loan" && subcommand === "accept" && optionName === "id") {
    path = `/internal/autocomplete/loans?discordUserId=${uid}&q=${q}&role=borrower&status=pending`;
  } else if (commandName === "loan" && subcommand === "repay" && optionName === "id") {
    path = `/internal/autocomplete/loans?discordUserId=${uid}&q=${q}&role=borrower&status=active`;
  } else if (commandName === "loan" && subcommand === "cancel" && optionName === "id") {
    path = `/internal/autocomplete/loans?discordUserId=${uid}&q=${q}&role=lender&status=pending`;
  } else if (commandName === "loan" && subcommand === "info" && optionName === "id") {
    path = `/internal/autocomplete/loans?discordUserId=${uid}&q=${q}&role=any&status=any`;
  } else if (commandName === "loan" && subcommand === "wizard" && optionName === "id") {
    path = `/internal/autocomplete/loans?discordUserId=${uid}&q=${q}&role=borrower&status=active`;
  } else if (commandName === "nightrecommend" && optionName === "nightid") {
    path = `/internal/autocomplete/game-nights?q=${q}`;
  }

  if (!path) return [];

  const { ok, data } = await internalApi("GET", path);
  if (!ok) return [];
  const d = data as { choices?: AutocompleteChoice[] } | null;
  return d?.choices ?? [];
}

// ── Game-state rendering helpers (data comes from server) ───────────────────

type Card = { rank: string; suit: string };

function formatCard(c: Card): string {
  return `\`${c.rank}${c.suit}\``;
}

function formatHand(cards: Card[]): string {
  if (!cards || cards.length === 0) return "—";
  return cards.map(formatCard).join(" ");
}

function formatHandWithHidden(visible: Card[], hidden: number): string {
  const parts = (visible ?? []).map(formatCard);
  for (let i = 0; i < hidden; i++) parts.push("`??`");
  return parts.length > 0 ? parts.join(" ") : "—";
}

function blackjackResultText(r: "win" | "lose" | "push" | "blackjack"): string {
  switch (r) {
    case "blackjack": return "🃏✨ BLACKJACK!";
    case "win":      return "🏆 You win!";
    case "push":     return "🤝 Push — bet refunded";
    case "lose":     return "💀 You lose";
  }
}

type GameStateResponse = {
  sessionId: number;
  gameType: string;
  bet: number;
  status: "active" | "resolved";
  data: {
    playerHand?: Card[];
    dealerHand?: Card[];
    dealerHidden?: number;
    playerTotal?: number;
    dealerVisibleTotal?: number;
    dealerTotal?: number;
  };
  result?:
    | { type: "coinflip"; call: "heads" | "tails"; outcome: "heads" | "tails"; won: boolean }
    | { type: "guessnumber"; guess: number; secret: number; won: boolean }
    | { type: "blackjack"; playerHand: Card[]; dealerHand: Card[]; result: "win" | "lose" | "push" | "blackjack" };
  payout?: number;
  newBalance?: number;
  expiresAt: string;
};

function gameErrorMessage(status: number, body: { error?: string; secondsLeft?: number; code?: string } | null): string {
  if (status === 409 && body?.code === "cooldown") {
    return `⏱️ Cooldown — try again in ${body.secondsLeft ?? "?"}s.`;
  }
  if (status === 409 && body?.code === "game_active") {
    return `🃏 You already have a game in progress. Finish that one first.`;
  }
  if (status === 410) {
    return `⏰ That game session expired.`;
  }
  if (status === 422) {
    return `❌ Insufficient Nuggies for that bet.`;
  }
  if (status === 403) {
    return `🚫 You're opted out of Nuggies. Use /nuggies-opt-in to rejoin.`;
  }
  if (status === 503) {
    return `⏸️ Nuggies games are paused.`;
  }
  return `❌ ${body?.error ?? "Game request failed"}`;
}

function nuggie(n: number): string {
  return `**₦${n.toLocaleString()}**`;
}

// ── Phase 1 read-only helpers ───────────────────────────────────────────────

// Mirror of MILESTONE_TIERS in apps/api/src/lib/nuggiesAchievements.ts.
// Keep in sync if thresholds change.
const MILESTONES = [500, 2_000, 5_000, 15_000, 40_000, 100_000, 250_000, 750_000];
const MILESTONE_LABELS = [
  "TUTORIAL ISLAND",
  "SIDEKICK",
  "REGULAR",
  "RISING STAR",
  "A-LISTER",
  "KING OF THE HILL",
  "BIG BOSS",
  "MR. WORLDWIDE",
];

function progressBar(current: number, target: number, width = 20): string {
  if (target <= 0) return "▓".repeat(width);
  const ratio = Math.max(0, Math.min(1, current / target));
  const filled = Math.round(ratio * width);
  return "▓".repeat(filled) + "░".repeat(width - filled);
}

function relativeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const delta = Math.max(0, Date.now() - t);
  const m = Math.round(delta / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d}d ago`;
  const w = Math.round(d / 7);
  if (w < 8) return `${w}w ago`;
  return `${Math.round(d / 30)}mo ago`;
}

type ActivityEvent = {
  id: string;
  eventType: string;
  category: "all" | "friends" | "achievements" | "milestones" | "patches" | "forums" | "nuggies";
  createdAt: string;
  actor: { displayName: string; discordUserId?: string | null } | null;
  target: { displayName: string; discordUserId?: string | null } | null;
  game: { name: string } | null;
  payload: Record<string, unknown>;
};

// ── Activity deep links (mirror apps/web/src/lib/routes.ts) ──────────────────
const webOrigin = (process.env.WEB_ORIGIN ?? "http://localhost:5173").replace(/\/+$/, "");
const webUrl = (path: string): string => `${webOrigin}${path}`;

type PendingLoanWizard =
  | {
      kind: "offer";
      userId: string;
      toDiscordUserId: string;
      amount: number;
      durationDays?: number;
      interestPct?: number;
      collateral: number;
    }
  | { kind: "repay"; userId: string; loanId: number };

const loanWizardPending = new Map<string, PendingLoanWizard>();

function loanWebLink(loanId: number): string {
  return webUrl(`/nuggies/loans?loan=${loanId}`);
}

function posIntFrom(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

function botCasinoLabel(game: string): string {
  switch (game) {
    case "coinflip": return "Coinflip";
    case "blackjack": return "Blackjack";
    case "guessnumber": return "Guess the Number";
    default: return game;
  }
}

// Site URL an activity row links to, or null when it has nowhere to go.
function activityUrl(e: ActivityEvent): string | null {
  const t = e.eventType;
  const p = e.payload ?? {};
  if (t.startsWith("forum")) {
    const threadId = posIntFrom(p.threadId);
    if (!threadId) return null;
    const postId = posIntFrom(p.postId);
    return webUrl(`/forums/thread/${threadId}${postId ? `/post/${postId}` : ""}`);
  }
  if (t.startsWith("game_night.")) return webUrl("/tide-check");
  if (t.startsWith("news.")) return webUrl("/games/news");
  if (t === "member.joined") {
    const did = (typeof p.discordUserId === "string" && p.discordUserId) || e.actor?.discordUserId || null;
    return did ? webUrl(`/islanders/${did}`) : null;
  }
  if (
    t.startsWith("achievement.") ||
    t.startsWith("milestone.") ||
    t.startsWith("steam.") ||
    t.startsWith("casino.") ||
    t.startsWith("nuggies.")
  ) {
    return e.actor?.discordUserId ? webUrl(`/islanders/${e.actor.discordUserId}`) : null;
  }
  return null;
}

// Full feed line for Discord: human copy + a deep link back to the site.
function describeActivity(e: ActivityEvent): string {
  const line = activityLine(e);
  const url = activityUrl(e);
  return url ? `${line} · [open ↗](${url})` : line;
}

function activityLine(e: ActivityEvent): string {
  const actor = e.actor?.displayName ?? "A crew member";
  const ago = relativeAgo(e.createdAt);
  const game = e.game?.name;
  const payload = e.payload ?? {};
  switch (e.eventType) {
    case "game_night.created": {
      const title = typeof payload.title === "string" ? payload.title : "a new session";
      return `🌴 **${actor}** scheduled **${title}** · ${ago}`;
    }
    case "game_night.rsvp_joined":
      return `🪵 **${actor}** RSVP'd to the next game night · ${ago}`;
    case "game_night.rsvp_left":
      return `🌫 **${actor}** stepped off the dock · ${ago}`;
    case "game_night.game_picked":
      return `🎯 **${actor}** locked in **${game ?? "a game"}** · ${ago}`;
    case "steam.linked":
      return `🔗 **${actor}** wired up their Steam library · ${ago}`;
    case "steam.unlinked":
      return `🪢 **${actor}** unhooked their Steam library · ${ago}`;
    case "achievement.unlocked": {
      const name = typeof payload.name === "string" ? payload.name : "an achievement";
      const emoji = typeof payload.emoji === "string" ? payload.emoji : "🏆";
      return `${emoji} **${actor}** unlocked **${name}** · ${ago}`;
    }
    case "achievement.steam_progress": {
      const delta = typeof payload.unlockedDelta === "number" ? payload.unlockedDelta : 0;
      const gameName = typeof payload.gameName === "string" ? payload.gameName : "a game";
      return `🏆 **${actor}** unlocked ${delta} achievement${delta === 1 ? "" : "s"} in **${gameName}** · ${ago}`;
    }
    case "milestone.reached": {
      const label = typeof payload.label === "string" ? payload.label : "a new tier";
      const emoji = typeof payload.emoji === "string" ? payload.emoji : "⭐";
      const threshold = typeof payload.threshold === "number" ? `₦${payload.threshold.toLocaleString()}` : "";
      return `${emoji} **${actor}** hit **${label}**${threshold ? ` (${threshold})` : ""} · ${ago}`;
    }
    case "forum_thread_created": {
      const title = typeof payload.title === "string" ? payload.title : "a new thread";
      return `💬 **${actor}** posted **${title}** in the forums · ${ago}`;
    }
    case "forum_reply_created": {
      const title = typeof payload.threadTitle === "string" ? payload.threadTitle : "a thread";
      return `💬 **${actor}** replied to **${title}** · ${ago}`;
    }
    case "forum.reactions_milestone": {
      const title = typeof payload.threadTitle === "string" ? payload.threadTitle : "a post";
      const count = typeof payload.count === "number" ? payload.count : 0;
      return `🔥 **${actor}**'s post in **${title}** hit ${count} reactions · ${ago}`;
    }
    case "news.card_published": {
      const title = typeof payload.title === "string" ? payload.title : "an update";
      return `📰 **${actor}** posted **${title}** to the drift log · ${ago}`;
    }
    case "member.joined": {
      const name =
        typeof payload.displayName === "string" && payload.displayName ? payload.displayName : actor;
      return `🌴 **${name}** washed ashore — welcome aboard! · ${ago}`;
    }
    case "nuggies.daily_claimed": {
      const amount = typeof payload.amount === "number" ? payload.amount : 0;
      return `🍗 **${actor}** claimed their daily ₦${amount.toLocaleString()} · ${ago}`;
    }
    case "casino.big_win": {
      const net = typeof payload.net === "number" ? payload.net : 0;
      const g = typeof payload.game === "string" ? payload.game : "the casino";
      return `🎰 **${actor}** won big at **${botCasinoLabel(g)}** — +₦${net.toLocaleString()} · ${ago}`;
    }
    case "nuggies.loan_accepted": {
      const principal = typeof payload.principal === "number" ? payload.principal : 0;
      const to = e.target?.displayName ? ` from **${e.target.displayName}**` : "";
      return `🤝 **${actor}** took a ₦${principal.toLocaleString()} loan${to} · ${ago}`;
    }
    case "nuggies.loan_repaid": {
      const amount = typeof payload.amount === "number" ? payload.amount : 0;
      const to = e.target?.displayName ? ` to **${e.target.displayName}**` : "";
      return `💸 **${actor}** repaid a ₦${amount.toLocaleString()} loan${to} · ${ago}`;
    }
    default:
      return `✨ **${actor}** · ${e.eventType} · ${ago}`;
  }
}

// ── Command Definitions ───────────────────────────────────────────────────────

const commands = [
  // Existing
  new SlashCommandBuilder()
    .setName("whatcanweplay")
    .setDescription("Suggest games this group can play now")
    .addStringOption((o) =>
      o.setName("memberids").setDescription("Comma-separated Discord member IDs").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("nightrecommend")
    .setDescription("Suggest games for a specific game night")
    .addIntegerOption((o) =>
      o.setName("nightid").setDescription("Game night ID from the website").setRequired(true).setAutocomplete(true)
    )
    .addStringOption((o) =>
      o.setName("memberids").setDescription("Optional: comma-separated Discord member IDs").setRequired(false)
    ),

  // Nuggies core
  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily Nuggies 🍗"),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your Nuggies balance (or another member's)")
    .addUserOption((o) => o.setName("user").setDescription("Member to check").setRequired(false)),

  new SlashCommandBuilder()
    .setName("give")
    .setDescription("Send Nuggies to another member (5% fee applies)")
    .addUserOption((o) => o.setName("user").setDescription("Recipient").setRequired(true))
    .addIntegerOption((o) =>
      o.setName("amount").setDescription("How many Nuggies to send").setRequired(true).setMinValue(1)
    ),

  // Shop & inventory
  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Browse the Nuggies shop 🛒"),

  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy an item from the shop")
    .addStringOption((o) => o.setName("item").setDescription("Item name").setRequired(true).setAutocomplete(true)),

  new SlashCommandBuilder()
    .setName("equip")
    .setDescription("Equip or unequip an item you own")
    .addStringOption((o) => o.setName("item").setDescription("Item name").setRequired(true).setAutocomplete(true)),

  // Games
  new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Flip a coin — 1.9× payout on a win 🪙")
    .addIntegerOption((o) =>
      o.setName("bet").setDescription("Amount to bet").setRequired(true).setMinValue(1)
    )
    .addStringOption((o) =>
      o.setName("call").setDescription("heads or tails").setRequired(true)
        .addChoices({ name: "Heads", value: "heads" }, { name: "Tails", value: "tails" })
    ),

  new SlashCommandBuilder()
    .setName("blackjack")
    .setDescription("Play blackjack against the dealer 🃏")
    .addIntegerOption((o) =>
      o.setName("bet").setDescription("Amount to bet").setRequired(true).setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("guessnumber")
    .setDescription("Pick a number 1–10. Correct guess = 8× payout 🎯")
    .addIntegerOption((o) =>
      o.setName("bet").setDescription("Amount to bet").setRequired(true).setMinValue(1)
    ),

  // Admin: set each milestone role's icon to its coin art (needs Boost L2).
  new SlashCommandBuilder()
    .setName("sync-rank-icons")
    .setDescription("Admin: set each milestone role's icon to its coin art")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // Loans
  new SlashCommandBuilder()
    .setName("loan")
    .setDescription("Nuggies loan system")
    .addSubcommand((s) =>
      s.setName("offer")
        .setDescription("Offer a loan to another member")
        .addUserOption((o) => o.setName("borrower").setDescription("Who to lend to").setRequired(true))
        .addIntegerOption((o) => o.setName("amount").setDescription("Principal amount").setRequired(true).setMinValue(1))
        .addIntegerOption((o) => o.setName("days").setDescription("Repayment window in days (max 7)").setRequired(false))
        .addIntegerOption((o) => o.setName("interest").setDescription("Interest % (default from server settings)").setRequired(false))
        .addIntegerOption((o) => o.setName("collateral").setDescription("Required collateral from borrower").setRequired(false).setMinValue(0))
    )
    .addSubcommand((s) =>
      s.setName("accept")
        .setDescription("Accept a pending loan offer")
        .addIntegerOption((o) => o.setName("id").setDescription("Loan ID").setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((s) =>
      s.setName("repay")
        .setDescription("Repay an active loan")
        .addIntegerOption((o) => o.setName("id").setDescription("Loan ID").setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((s) =>
      s.setName("cancel")
        .setDescription("Cancel a pending loan offer (lender only)")
        .addIntegerOption((o) => o.setName("id").setDescription("Loan ID").setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((s) =>
      s.setName("list")
        .setDescription("View your loans")
        .addStringOption((o) =>
          o
            .setName("status")
            .setDescription("Filter by status")
            .setRequired(false)
            .addChoices(
              { name: "All", value: "all" },
              { name: "Pending", value: "pending" },
              { name: "Active", value: "active" },
              { name: "History", value: "history" }
            )
        )
    )
    .addSubcommand((s) => s.setName("guide").setDescription("How island loans work (rules + status key)"))
    .addSubcommand((s) =>
      s.setName("calc")
        .setDescription("Preview amount due for a loan offer")
        .addIntegerOption((o) => o.setName("principal").setDescription("Principal amount").setRequired(true).setMinValue(1))
        .addIntegerOption((o) => o.setName("interest").setDescription("Interest % (default from settings)").setRequired(false))
        .addIntegerOption((o) => o.setName("days").setDescription("Repayment window in days").setRequired(false))
    )
    .addSubcommand((s) =>
      s.setName("info")
        .setDescription("View details for a loan")
        .addIntegerOption((o) => o.setName("id").setDescription("Loan ID").setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((s) =>
      s.setName("wizard")
        .setDescription("Guided loan flow with confirmation")
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription("Create an offer or repay a loan")
            .setRequired(true)
            .addChoices(
              { name: "Offer", value: "offer" },
              { name: "Repay", value: "repay" }
            )
        )
        .addUserOption((o) => o.setName("borrower").setDescription("Who to lend to (offer only)").setRequired(false))
        .addIntegerOption((o) => o.setName("amount").setDescription("Principal (offer only)").setRequired(false).setMinValue(1))
        .addIntegerOption((o) => o.setName("days").setDescription("Repayment days (offer only)").setRequired(false))
        .addIntegerOption((o) => o.setName("interest").setDescription("Interest % (offer only)").setRequired(false))
        .addIntegerOption((o) => o.setName("collateral").setDescription("Collateral (offer only)").setRequired(false).setMinValue(0))
        .addIntegerOption((o) => o.setName("id").setDescription("Loan ID (repay only)").setRequired(false).setAutocomplete(true))
    ),

  // Marketplace
  new SlashCommandBuilder()
    .setName("market")
    .setDescription("Nuggies marketplace")
    .addSubcommand((s) =>
      s.setName("list")
        .setDescription("List one of your items for sale")
        .addStringOption((o) => o.setName("item").setDescription("Item name to sell").setRequired(true).setAutocomplete(true))
        .addIntegerOption((o) => o.setName("price").setDescription("Asking price in Nuggies").setRequired(true).setMinValue(1))
    )
    .addSubcommand((s) =>
      s.setName("buy")
        .setDescription("Buy a marketplace listing")
        .addIntegerOption((o) => o.setName("id").setDescription("Listing ID").setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((s) =>
      s.setName("browse")
        .setDescription("Browse active marketplace listings")
    )
    .addSubcommand((s) =>
      s.setName("cancel")
        .setDescription("Cancel your own listing")
        .addIntegerOption((o) => o.setName("id").setDescription("Listing ID").setRequired(true).setAutocomplete(true))
    ),

  // ── Read-only parity commands ────────────────────────────────────────────

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("The ladder — top Nuggies holders on the island"),

  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View an islander's Nuggies profile")
    .addUserOption((o) =>
      o.setName("user").setDescription("Member to view (default: you)").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("View your Nuggies inventory")
    .addStringOption((o) =>
      o
        .setName("type")
        .setDescription("Filter by item type")
        .setRequired(false)
        .addChoices(
          { name: "All", value: "all" },
          { name: "Titles", value: "title" },
          { name: "Flairs", value: "flair" },
          { name: "Badges", value: "badge" }
        )
    ),

  new SlashCommandBuilder()
    .setName("milestones")
    .setDescription("Your rank progress on the ladder"),

  new SlashCommandBuilder()
    .setName("activity")
    .setDescription("Recent activity from the island")
    .addStringOption((o) =>
      o
        .setName("scope")
        .setDescription("Filter by category")
        .setRequired(false)
        .addChoices(
          { name: "All", value: "all" },
          { name: "Friends", value: "friends" },
          { name: "Achievements", value: "achievements" },
          { name: "Milestones", value: "milestones" },
          { name: "Patches", value: "patches" }
        )
    ),

  // Opt out/in
  new SlashCommandBuilder()
    .setName("nuggies-opt-out")
    .setDescription("Opt out of the Nuggies economy (hides balance, blocks earning/spending)"),

  new SlashCommandBuilder()
    .setName("nuggies-opt-in")
    .setDescription("Opt back in to the Nuggies economy"),

  // ── Nuggie persona chat ────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName("nuggie")
    .setDescription("Ask Nuggie anything")
    .addSubcommand((s) =>
      s
        .setName("ask")
        .setDescription("Ask Nuggie a question")
        .addStringOption((o) =>
          o
            .setName("question")
            .setDescription("What do you want to ask?")
            .setRequired(true)
            .setMaxLength(500)
        )
    ),
];

// ── Register Commands ─────────────────────────────────────────────────────────

async function registerCommands() {
  if (!token || !clientId) return;
  const rest = new REST({ version: "10" }).setToken(token);
  const body = commands.map((c) => c.toJSON());
  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
      console.log(`Registered ${body.length} commands for guild ${guildId}`);
      return;
    }
  } catch (error) {
    console.error("Guild command registration failed, falling back to global", error);
  }
  await rest.put(Routes.applicationCommands(clientId), { body });
  console.log(`Registered ${body.length} global commands`);
}

// ── Client ────────────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    // Privileged — enable both in Discord Dev Portal under the bot's
    // "Privileged Gateway Intents" section.
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ]
});

// ── Presence sync ───────────────────────────────────────────────────────────
// Push every Discord presence change (online/idle/dnd/offline) to the API so
// the web UI's Friends Online card reflects real Discord status. We dedupe by
// last-pushed status per user — Discord fires PresenceUpdate on activity
// changes too (game start/stop), and we only care about the status field.

const lastPushedStatus = new Map<string, string>();

// First non-custom activity (Playing/Streaming/Listening/Watching/Competing).
// Custom Status (type 4) carries no game name in .name, so we skip it.
function extractActivity(
  activities: ReadonlyArray<{ name?: string | null; type?: number | null }> | undefined
): { activityName: string | null; activityType: number | null } {
  const act = (activities ?? []).find((a) => a.type !== 4);
  if (!act?.name) return { activityName: null, activityType: null };
  return { activityName: act.name, activityType: typeof act.type === "number" ? act.type : null };
}

async function pushPresence(
  discordUserId: string,
  status: string,
  activityName: string | null = null,
  activityType: number | null = null
): Promise<void> {
  if (!botApiSharedSecret) return;
  const dedupeKey = `${status}|${activityName ?? ""}|${activityType ?? ""}`;
  if (lastPushedStatus.get(discordUserId) === dedupeKey) return;
  lastPushedStatus.set(discordUserId, dedupeKey);
  try {
    await fetch(`${apiBase}/members/presence/${discordUserId}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-island-bot-secret": botApiSharedSecret
      },
      body: JSON.stringify({ status, activityName, activityType })
    });
  } catch {
    // Best-effort. Next presence event will retry.
    lastPushedStatus.delete(discordUserId);
  }
}

client.on(Events.PresenceUpdate, (_oldPresence, newPresence) => {
  const userId = newPresence?.userId;
  const status = newPresence?.status;
  if (!userId || !status) return;
  if (newPresence.guild?.id && newPresence.guild.id !== guildId) return;
  const { activityName, activityType } = extractActivity(newPresence.activities);
  void pushPresence(userId, status, activityName, activityType);
});

// ── New-member welcome → activity feed ──────────────────────────────────────
// Record a "member.joined" event when someone joins the guild. Identity is
// carried in the payload because the new member won't have a web account yet.
client.on(Events.GuildMemberAdd, (member) => {
  if (member.guild?.id && member.guild.id !== guildId) return;
  if (member.user?.bot) return;
  const displayName =
    member.displayName ?? member.user?.globalName ?? member.user?.username ?? "New islander";
  const avatarUrl = member.user?.displayAvatarURL?.({ size: 128 }) ?? null;
  void internalApi("POST", "/internal/events/member-joined", {
    discordUserId: member.id,
    displayName,
    avatarUrl
  });
});

// ── Milestone announcer (outbox poller) ─────────────────────────────────────
//
// Polls /internal/bot/announcements/pending every 30s. For each
// 'milestone.reached' row: posts to the configured channel + assigns the
// new tier role + removes lower tier roles. Marks each row processed
// regardless of post/role outcome to avoid loop-on-failure.

const settingsCache = new Map<string, { value: string; cachedAt: number }>();
const SETTINGS_TTL_MS = 60_000;

async function getCachedSetting(key: string): Promise<string> {
  const cached = settingsCache.get(key);
  if (cached && Date.now() - cached.cachedAt < SETTINGS_TTL_MS) {
    return cached.value;
  }
  const { ok, data } = await internalApi("GET", `/internal/settings/${encodeURIComponent(key)}`);
  const value = ok && data && typeof data === "object" && "value" in data ? String((data as { value: string }).value ?? "") : "";
  settingsCache.set(key, { value, cachedAt: Date.now() });
  return value;
}

// Ordinal scheme — keys decoupled from tier display names so renames don't
// touch this list. Index aligned with MILESTONE_TIERS in apps/api.
const TIER_ROLE_KEYS_IN_LADDER_ORDER = [
  "milestone_role_rank_01",
  "milestone_role_rank_02",
  "milestone_role_rank_03",
  "milestone_role_rank_04",
  "milestone_role_rank_05",
  "milestone_role_rank_06",
  "milestone_role_rank_07",
  "milestone_role_rank_08",
];

// Ladder-ordered badge slug + accent color (mirrors the web rankTiers.ts).
// Drives the rank card art + role-icon sync. Index-aligned with
// TIER_ROLE_KEYS_IN_LADDER_ORDER above.
const RANK_ART_VERSION = "badge-v2";
const TIER_LADDER: Array<{ slug: string; accent: string }> = [
  { slug: "vault-dweller", accent: "#94a3b8" },
  { slug: "silver", accent: "#cbd5e1" },
  { slug: "regular", accent: "#d97706" },
  { slug: "divine", accent: "#c9a86a" },
  { slug: "got-gud", accent: "#f59e0b" },
  { slug: "king-of-the-hill", accent: "#818cf8" },
  { slug: "big-boss", accent: "#8a9a52" },
  { slug: "kappa", accent: "#f97316" },
];

type MilestonePayload = {
  discordUserId: string;
  label: string;
  threshold: number;
  emblem: string;
  bonus: number;
  roleSettingKey: string;
  // Optional (added by API for the rank card's progress bar); card degrades
  // gracefully when absent.
  lifetimeEarned?: number;
  nextThreshold?: number | null;
  nextLabel?: string | null;
};

type AchievementUnlockedPayload = {
  discordUserId: string;
  key: string;
  name: string;
  emoji: string;
};

type TideWeeklyPayload = {
  summary: string;
  channelId?: string;
};

type OfficialAnnouncementPayload = {
  threadId: number;
  title: string;
  bodyPreview: string;
  authorName: string;
  threadUrl: string;
};

type OfficialAnnouncementUpdatedPayload = OfficialAnnouncementPayload & {
  messageId: string;
  channelId: string;
};

type GamePatchPayload = {
  appId: number;
  gameName: string;
  gid: string;
  title: string;
  url: string;
  bodyPreview: string | null;
  sourceLabel: string | null;
  roleIds: string[];
};

function buildOfficialAnnouncementEmbed(payload: Pick<OfficialAnnouncementPayload, "title" | "bodyPreview" | "authorName" | "threadUrl">) {
  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle(payload.title)
    .setURL(payload.threadUrl)
    .setDescription(payload.bodyPreview.slice(0, 1000))
    .setFooter({ text: payload.authorName });
}

async function processOfficialAnnouncement(payload: OfficialAnnouncementPayload): Promise<void> {
  const enabled = await getCachedSetting("official_announcements_enabled");
  if (enabled !== "true") return;
  const channelId = await getCachedSetting("official_announcements_channel_id");
  if (!channelId) return;

  const pingEveryone = (await getCachedSetting("official_announcements_ping_everyone")) === "true";
  const embed = buildOfficialAnnouncementEmbed(payload);

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isSendable()) return;

    const message = await channel.send({
      content: pingEveryone ? "@everyone" : undefined,
      embeds: [embed],
      allowedMentions: pingEveryone ? { parse: ["everyone"] } : { parse: [] },
    });

    await internalApi("POST", "/internal/bot/official-announcements/ack", {
      threadId: payload.threadId,
      messageId: message.id,
      channelId: channel.id,
    });
  } catch (err) {
    console.error(`[forum] official announcement post failed for thread ${payload.threadId}`, err);
  }
}

async function processOfficialAnnouncementUpdated(payload: OfficialAnnouncementUpdatedPayload): Promise<void> {
  const enabled = await getCachedSetting("official_announcements_enabled");
  if (enabled !== "true") return;

  const pingEveryone = (await getCachedSetting("official_announcements_ping_everyone")) === "true";
  const embed = buildOfficialAnnouncementEmbed(payload);

  try {
    const channel = await client.channels.fetch(payload.channelId);
    if (!channel?.isSendable()) return;

    const message = await channel.messages.fetch(payload.messageId).catch(() => null);
    if (!message) {
      console.error(`[forum] official announcement message not found ${payload.channelId}/${payload.messageId}`);
      return;
    }

    await message.edit({
      content: pingEveryone ? "@everyone" : undefined,
      embeds: [embed],
      allowedMentions: pingEveryone ? { parse: ["everyone"] } : { parse: [] },
    });
  } catch (err) {
    console.error(`[forum] official announcement edit failed for thread ${payload.threadId}`, err);
  }
}

async function processGamePatch(payload: GamePatchPayload): Promise<void> {
  const enabled = await getCachedSetting("patch_alerts_enabled");
  if (enabled !== "true") return;
  const channelId = await getCachedSetting("patch_notes_channel_id");
  if (!channelId) return;

  const roleIds = payload.roleIds ?? [];
  const embed = new EmbedBuilder()
    .setAuthor({ name: payload.gameName })
    .setTitle(payload.title)
    .setURL(payload.url)
    .setDescription((payload.bodyPreview ?? "").slice(0, 1000));
  if (payload.sourceLabel) {
    embed.setFooter({ text: payload.sourceLabel });
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isSendable()) return;

    await channel.send({
      content: roleIds.length > 0 ? roleIds.map((id) => `<@&${id}>`).join(" ") : undefined,
      embeds: [embed],
      allowedMentions: roleIds.length > 0 ? { roles: roleIds } : { parse: [] },
    });
  } catch (err) {
    console.error(`[patches] channel post failed for ${payload.appId}/${payload.gid}`, err);
  }
}

async function processTideWeekly(payload: TideWeeklyPayload): Promise<void> {
  // The API already built the markdown summary; post it verbatim to the
  // milestone channel (reuse milestone_channel_id like achievement/milestone
  // announcements, allowing payload.channelId to override).
  const channelId = payload.channelId ?? (await getCachedSetting("milestone_channel_id"));
  if (!channelId) return;
  if (!payload.summary) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.isSendable()) {
      await channel.send(payload.summary);
    }
  } catch (err) {
    console.error("[tide] channel post failed", err);
  }
}

async function processAchievementUnlocked(payload: AchievementUnlockedPayload): Promise<void> {
  const enabled = await getCachedSetting("achievement_announcements_enabled");
  if (enabled !== "true") return;
  // Reuse the milestone channel for small unlocks until/unless a separate
  // channel setting is introduced. Achievements are smaller-stakes than
  // milestones but live in the same celebration stream.
  const channelId = await getCachedSetting("milestone_channel_id");
  if (!channelId) return;

  const { ok, data } = await internalApi("GET", `/internal/achievement-variants/${encodeURIComponent(payload.key)}`);
  let text: string;
  if (ok && data && typeof data === "object" && "text" in data) {
    text = String((data as { text: string }).text);
  } else {
    // Fallback for keys without seeded variants — keeps the channel alive
    // even if a new achievement is added without variant data yet.
    text = `{{user}} unlocked ${payload.emoji} ${payload.name}`;
  }
  const rendered = text.replace(/\{\{user\}\}/g, `<@${payload.discordUserId}>`);

  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.isSendable()) {
      await channel.send({
        content: rendered,
        allowedMentions: { users: [payload.discordUserId] },
      });
    }
  } catch (err) {
    console.error(`[achievements] channel post failed for ${payload.discordUserId}@${payload.key}`, err);
  }
}

async function processMilestoneAnnouncement(payload: MilestonePayload): Promise<void> {
  const enabled = await getCachedSetting("milestone_announcements_enabled");
  const channelId = await getCachedSetting("milestone_channel_id");

  // 1. Public channel announcement (if enabled + configured)
  if (enabled === "true" && channelId) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel && channel.isSendable()) {
        const idx = TIER_ROLE_KEYS_IN_LADDER_ORDER.indexOf(payload.roleSettingKey);
        const tier = idx >= 0 ? TIER_LADDER[idx] : undefined;
        let posted = false;

        // Preferred: rich rank-up card embed. Falls back to the text line if the
        // member, art, or render fails — never blocks the role grant below.
        if (tier && guildId) {
          try {
            const guild = await client.guilds.fetch(guildId).catch(() => null);
            const member = guild
              ? await guild.members.fetch(payload.discordUserId).catch(() => null)
              : null;
            if (member) {
              const card = await renderRankCard({
                displayName: member.displayName,
                avatarUrl: member.displayAvatarURL({ extension: "png", size: 128 }),
                tierLabel: payload.label,
                coinUrl: `${webOrigin}/art/milestones/${tier.slug}.png?v=${RANK_ART_VERSION}`,
                accent: tier.accent,
                bonus: payload.bonus,
                currentThreshold: payload.threshold,
                lifetimeEarned: payload.lifetimeEarned,
                nextThreshold: payload.nextThreshold ?? undefined,
                nextLabel: payload.nextLabel ?? undefined,
              });
              const embed = new EmbedBuilder()
                .setColor(parseInt(tier.accent.slice(1), 16))
                .setImage("attachment://rank.png");
              await channel.send({
                content: `🎉 <@${payload.discordUserId}> reached **${payload.label}** — +${payload.bonus.toLocaleString()} Nuggies!`,
                embeds: [embed],
                files: [new AttachmentBuilder(card, { name: "rank.png" })],
                allowedMentions: { users: [payload.discordUserId] },
              });
              posted = true;
            }
          } catch (err) {
            console.error(`[milestones] card post failed for ${payload.discordUserId}@${payload.label}`, err);
          }
        }

        if (!posted) {
          await channel.send(
            `🌊 <@${payload.discordUserId}> reached **${payload.label}** ${payload.emblem} — ₦${payload.bonus.toLocaleString()} bonus paid!`
          );
        }
      }
    } catch (err) {
      console.error(`[milestones] channel post failed for ${payload.discordUserId}@${payload.label}`, err);
    }
  }

  // 2. Role assignment + lower-tier role cleanup
  if (!guildId) return;
  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    const member = await guild.members.fetch(payload.discordUserId).catch(() => null);
    if (!member) return;

    const newRoleId = await getCachedSetting(payload.roleSettingKey);
    if (newRoleId) {
      await member.roles.add(newRoleId).catch((err) => {
        console.error(`[milestones] roles.add ${newRoleId} failed for ${payload.discordUserId}`, err);
      });
    }

    // Remove every tier role BELOW this one (so a member only has their highest).
    const reachedIdx = TIER_ROLE_KEYS_IN_LADDER_ORDER.indexOf(payload.roleSettingKey);
    if (reachedIdx > 0) {
      for (let i = 0; i < reachedIdx; i++) {
        const lowerKey = TIER_ROLE_KEYS_IN_LADDER_ORDER[i];
        const lowerRoleId = await getCachedSetting(lowerKey);
        if (lowerRoleId && member.roles.cache.has(lowerRoleId)) {
          await member.roles.remove(lowerRoleId).catch((err) => {
            console.error(`[milestones] roles.remove ${lowerRoleId} failed for ${payload.discordUserId}`, err);
          });
        }
      }
    }
  } catch (err) {
    console.error(`[milestones] role sync failed for ${payload.discordUserId}@${payload.label}`, err);
  }
}

let processInFlight = false;

async function processPendingAnnouncements(): Promise<void> {
  if (processInFlight) return;
  if (!botApiSharedSecret) return;
  processInFlight = true;
  try {
    const { ok, data } = await internalApi("GET", "/internal/bot/announcements/pending");
    if (!ok || !data || typeof data !== "object" || !("announcements" in data)) return;
    const rows = (data as { announcements: Array<{ id: number; kind: string; payload: Record<string, unknown> }> }).announcements ?? [];
    for (const row of rows) {
      try {
        if (row.kind === "milestone.reached") {
          await processMilestoneAnnouncement(row.payload as MilestonePayload);
        } else if (row.kind === "achievement.unlocked") {
          await processAchievementUnlocked(row.payload as AchievementUnlockedPayload);
        } else if (row.kind === "tide.weekly") {
          await processTideWeekly(row.payload as TideWeeklyPayload);
        } else if (row.kind === "forum.official_announcement") {
          await processOfficialAnnouncement(row.payload as OfficialAnnouncementPayload);
        } else if (row.kind === "forum.official_announcement.updated") {
          await processOfficialAnnouncementUpdated(row.payload as OfficialAnnouncementUpdatedPayload);
        } else if (row.kind === "game.patch") {
          await processGamePatch(row.payload as GamePatchPayload);
        }
      } catch (err) {
        console.error(`[announcements] handler failed for row ${row.id}`, err);
      } finally {
        // Always mark processed so a misconfigured row can't loop forever.
        await internalApi("POST", `/internal/bot/announcements/${row.id}/processed`);
      }
    }
  } catch (err) {
    console.error("[announcements] poll failed", err);
  } finally {
    processInFlight = false;
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot ready as ${readyClient.user.tag}`);
  try {
    await registerCommands();
  } catch (error) {
    console.error("Command registration failed", error);
  }

  // Kick off the announcement poll loop. First run immediate, then every 30s.
  void processPendingAnnouncements();
  setInterval(() => void processPendingAnnouncements(), 30_000);

  // Initial presence sweep — push current cached status for every guild
  // member. Without this, members not in the bot's gateway PRESENCE_UPDATE
  // backlog (e.g. permanently offline users) would stay null in the DB.
  if (guildId) {
    try {
      const guild = await readyClient.guilds.fetch(guildId).catch(() => null);
      if (guild) {
        const members = await guild.members.fetch().catch(() => null);
        if (members) {
          let pushed = 0;
          for (const [, member] of members) {
            const status = member.presence?.status ?? "offline";
            const { activityName, activityType } = extractActivity(member.presence?.activities);
            void pushPresence(member.id, status, activityName, activityType);
            pushed += 1;
          }
          console.log(`[presence] initial sweep queued ${pushed} member(s)`);
        }
      }
    } catch (error) {
      console.error("Initial presence sweep failed", error);
    }
  }
});

// ── Interaction Handler ───────────────────────────────────────────────────────

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    try {
      const focused = interaction.options.getFocused(true);
      const sub = interaction.options.getSubcommand(false);
      const choices = await fetchAutocomplete(
        interaction.commandName,
        sub,
        focused.name,
        String(focused.value ?? ""),
        interaction.user.id
      );
      await interaction.respond(choices.slice(0, 25));
    } catch (err) {
      console.error("[autocomplete] error", err);
      try { await interaction.respond([]); } catch { /* ignore */ }
    }
    return;
  }

  if (interaction.isButton()) {
    const id = interaction.customId;
    if (id === "loan_wizard_confirm" || id === "loan_wizard_cancel") {
      const pending = loanWizardPending.get(interaction.user.id);
      if (!pending || pending.userId !== interaction.user.id) {
        await interaction.reply({ content: "That confirmation expired. Run the wizard again.", flags: MessageFlags.Ephemeral });
        return;
      }
      loanWizardPending.delete(interaction.user.id);
      if (id === "loan_wizard_cancel") {
        await interaction.update({ content: "Cancelled.", components: [] });
        return;
      }
      await interaction.deferUpdate();
      if (pending.kind === "offer") {
        const { ok, data } = await api("POST", "/nuggies/loan/offer", pending.userId, {
          toDiscordUserId: pending.toDiscordUserId,
          amount: pending.amount,
          durationDays: pending.durationDays,
          interestPct: pending.interestPct,
          collateral: pending.collateral,
        });
        const d = data as { loanId?: number; amountDue?: number; dueAt?: string; error?: string } | null;
        if (!ok) {
          await interaction.editReply({ content: `❌ ${d?.error ?? "Failed"}`, components: [] });
          return;
        }
        await interaction.editReply({
          content:
            `✅ Loan offer sent · ID \`${d?.loanId}\` · due ${nuggie(d?.amountDue ?? 0)}\n` +
            `${loanWebLink(d?.loanId ?? 0)}`,
          components: [],
        });
        return;
      }
      const { ok, data } = await api("POST", `/nuggies/loan/${pending.loanId}/repay`, pending.userId);
      const d = data as { amountPaid?: number; collateralReturned?: number; error?: string } | null;
      if (!ok) {
        await interaction.editReply({ content: `❌ ${d?.error ?? "Failed"}`, components: [] });
        return;
      }
      await interaction.editReply({
        content:
          `✅ Repaid loan \`${pending.loanId}\` — ${nuggie(d?.amountPaid ?? 0)} paid` +
          (d?.collateralReturned ? ` + ${nuggie(d.collateralReturned)} collateral returned` : "") +
          `\n${loanWebLink(pending.loanId)}`,
        components: [],
      });
      return;
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const userId = interaction.user.id;
  const username = interaction.user.username;

  try {
    switch (interaction.commandName) {

      // ── Admin: sync milestone role icons to coin art ──────────────────────
      case "sync-rank-icons": {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!guildId) {
          await interaction.editReply("No guild configured.");
          return;
        }
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          await interaction.editReply("Guild fetch failed.");
          return;
        }
        let ok = 0;
        let failed = 0;
        for (let i = 0; i < TIER_ROLE_KEYS_IN_LADDER_ORDER.length; i++) {
          const roleId = await getCachedSetting(TIER_ROLE_KEYS_IN_LADDER_ORDER[i]);
          const slug = TIER_LADDER[i]?.slug;
          if (!roleId || !slug) continue;
          try {
            const res = await fetch(`${webOrigin}/art/milestones/${slug}.png?v=${RANK_ART_VERSION}`);
            if (!res.ok) throw new Error(`art fetch ${res.status}`);
            const buf = Buffer.from(await res.arrayBuffer());
            await guild.roles.edit(roleId, { icon: buf });
            ok++;
          } catch (err) {
            console.error(`[rank-icons] ${slug} failed`, err);
            failed++;
          }
        }
        await interaction.editReply(`Rank icons synced — ${ok} ok, ${failed} failed.`);
        return;
      }

      // ── Existing recommendation commands ──────────────────────────────────

      case "whatcanweplay": {
        await interaction.deferReply();
        if (!botApiSharedSecret) {
          await interaction.editReply("BOT_API_SHARED_SECRET missing.");
          return;
        }
        const memberIds = interaction.options.getString("memberids", true)
          .split(",").map((id) => id.trim()).filter(Boolean);
        const res = await fetch(`${apiBase}/recommendations/what-can-we-play`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-island-bot-secret": botApiSharedSecret },
          body: JSON.stringify({ memberIds, sessionLength: "any", maxGroupSize: memberIds.length })
        });
        const data = await res.json().catch(() => null) as { recommendations?: Array<{ name: string; reason: string; score: number }>; error?: string } | null;
        if (!res.ok) { await interaction.editReply(`Error: ${data?.error ?? res.status}`); return; }
        const lines = (data?.recommendations ?? []).slice(0, 5).map((r, i) => `${i + 1}. **${r.name}** — ${r.reason}`);
        await interaction.editReply(lines.join("\n") || "No matches right now.");
        break;
      }

      case "nightrecommend": {
        await interaction.deferReply();
        const nightId = interaction.options.getInteger("nightid", true);
        const overrideIds = interaction.options.getString("memberids", false)?.split(",").map((id) => id.trim()).filter(Boolean) ?? [];
        const res = await fetch(`${apiBase}/game-nights/${nightId}/recommendations`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-island-bot-secret": botApiSharedSecret },
          body: JSON.stringify({ memberIds: overrideIds.length ? overrideIds : undefined, sessionLength: "any" })
        });
        const data = await res.json().catch(() => null) as { recommendations?: Array<{ name: string; reason: string; score: number }>; memberIds?: string[]; error?: string } | null;
        if (!res.ok) { await interaction.editReply(`Error: ${data?.error ?? res.status}`); return; }
        const lines = (data?.recommendations ?? []).slice(0, 5).map((r, i) => `${i + 1}. **${r.name}** — ${r.reason}`);
        await interaction.editReply(lines.join("\n") || "No matches.");
        break;
      }

      // ── /daily ────────────────────────────────────────────────────────────

      case "daily": {
        await interaction.deferReply();
        const { ok, status, data } = await api("POST", "/nuggies/daily", userId);
        const d = data as { newBalance?: number; amount?: number; error?: string } | null;
        if (!ok) {
          if (status === 409) {
            await interaction.editReply("⏰ Already claimed today. Resets at 11pm ET.");
          } else if (status === 403) {
            await interaction.editReply("You're opted out of Nuggies. Use `/nuggies-opt-in` to rejoin.");
          } else {
            await interaction.editReply(`Error: ${d?.error ?? "unknown"}`);
          }
          return;
        }
        await interaction.editReply(`🍗 **${username}** claimed ${nuggie(d?.amount ?? 0)}! New balance: ${nuggie(d?.newBalance ?? 0)}`);
        break;
      }

      // ── /balance ──────────────────────────────────────────────────────────

      case "balance": {
        const targetUser = interaction.options.getUser("user");
        const targetId = targetUser?.id ?? userId;
        const targetName = targetUser?.username ?? username;
        const isOthers = targetUser && targetUser.id !== userId;

        await interaction.deferReply({ flags: isOthers ? undefined : MessageFlags.Ephemeral });

        const { ok, data } = await api("GET", `/nuggies/user/${targetId}`, userId);
        const d = data as { balance?: number; equippedItems?: Array<{ name: string; itemType: string; itemData: { emoji?: string; label?: string } }> } | null;

        if (!ok || d?.balance === undefined) {
          await interaction.editReply("Couldn't fetch balance.");
          return;
        }

        const title = d.equippedItems?.find((i) => i.itemType === "title");
        const flair = d.equippedItems?.find((i) => i.itemType === "flair");
        const badge = d.equippedItems?.find((i) => i.itemType === "badge");

        const titleStr = title ? ` · **${title.itemData.emoji ?? ""} ${title.itemData.label ?? title.name}**` : "";
        const flairStr = flair ? ` ${flair.itemData.emoji ?? ""}` : "";
        const badgeStr = badge ? ` ${badge.itemData.emoji ?? ""}` : "";

        await interaction.editReply(
          `${badgeStr}**${targetName}**${titleStr}${flairStr}\nBalance: ${nuggie(d.balance)}`
        );
        break;
      }

      // ── /give ─────────────────────────────────────────────────────────────

      case "give": {
        await interaction.deferReply();
        const target = interaction.options.getUser("user", true);
        const amount = interaction.options.getInteger("amount", true);

        if (target.id === userId) {
          await interaction.editReply("Can't send Nuggies to yourself.");
          return;
        }

        const { ok, data } = await api("POST", "/nuggies/trade", userId, { toDiscordUserId: target.id, amount });
        const d = data as { sent?: number; received?: number; fee?: number; error?: string } | null;

        if (!ok) {
          await interaction.editReply(`❌ ${d?.error ?? "Trade failed"}`);
          return;
        }

        await interaction.editReply(
          `💸 **${username}** sent ${nuggie(d?.sent ?? amount)} to **${target.username}** — they received ${nuggie(d?.received ?? 0)} (${d?.fee ?? 0} 🍗 fee)`
        );
        break;
      }

      // ── /shop ─────────────────────────────────────────────────────────────

      case "shop": {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { ok, data } = await api("GET", "/nuggies/shop", userId);
        const d = data as { items?: Array<{ id: number; name: string; description: string; price: number; itemType: string; itemData: { emoji?: string }; owned: boolean }> } | null;
        if (!ok || !d?.items) { await interaction.editReply("Shop unavailable."); return; }

        const groupBy = (key: string) => d.items!.filter((i) => i.itemType === key);
        const formatItems = (items: typeof d.items) =>
          (items ?? []).map((i) => `${i.itemData.emoji ?? ""} **${i.name}** — ${i.price.toLocaleString()} 🍗 ${i.owned ? "✓" : ""}`).join("\n");

        const embed = new EmbedBuilder()
          .setTitle("🛒 Nuggies Shop")
          .setColor(0xf59e0b)
          .addFields(
            { name: "🏷️ Titles", value: formatItems(groupBy("title")) || "None", inline: false },
            { name: "✨ Flairs", value: formatItems(groupBy("flair")) || "None", inline: false },
            { name: "🏅 Badges", value: formatItems(groupBy("badge")) || "None", inline: false }
          )
          .setFooter({ text: "Use /buy <item name> to purchase" });

        await interaction.editReply({ embeds: [embed] });
        break;
      }

      // ── /buy ──────────────────────────────────────────────────────────────

      case "buy": {
        await interaction.deferReply();
        const itemName = interaction.options.getString("item", true).trim().toLowerCase();

        const shopRes = await api("GET", "/nuggies/shop", userId);
        const shopData = shopRes.data as { items?: Array<{ id: number; name: string; price: number; itemData: { emoji?: string }; owned: boolean }> } | null;
        const item = shopData?.items?.find((i) => i.name.toLowerCase() === itemName);
        if (!item) { await interaction.editReply("Item not found. Check the `/shop` for exact names."); return; }
        if (item.owned) { await interaction.editReply("Already own that item."); return; }

        const { ok, data } = await api("POST", `/nuggies/shop/${item.id}/buy`, userId);
        const d = data as { newBalance?: number; item?: { name: string }; error?: string } | null;

        if (!ok) {
          await interaction.editReply(`❌ ${d?.error ?? "Purchase failed"}`);
          return;
        }
        await interaction.editReply(`🎉 **${username}** bought **${item.itemData.emoji ?? ""} ${item.name}** for ${item.price.toLocaleString()} 🍗! Balance: ${nuggie(d?.newBalance ?? 0)}`);
        break;
      }

      // ── /equip ────────────────────────────────────────────────────────────

      case "equip": {
        await interaction.deferReply();
        const itemName = interaction.options.getString("item", true).trim().toLowerCase();

        const invRes = await api("GET", "/nuggies/inventory", userId);
        const invData = invRes.data as { inventory?: Array<{ itemId: number; name: string; equipped: boolean; itemData: { emoji?: string; label?: string } }> } | null;
        const item = invData?.inventory?.find((i) => i.name.toLowerCase() === itemName);
        if (!item) { await interaction.editReply("Item not in your inventory. Check `/shop` to buy it."); return; }

        const { ok, data } = await api("POST", `/nuggies/inventory/${item.itemId}/equip`, userId);
        const d = data as { equipped?: boolean; error?: string } | null;

        if (!ok) { await interaction.editReply(`❌ ${d?.error ?? "Failed"}`); return; }

        const action = d?.equipped ? "equipped" : "unequipped";
        await interaction.editReply(`✅ **${username}** ${action} **${item.itemData.emoji ?? ""} ${item.name}**`);
        break;
      }

      // ── /coinflip ─────────────────────────────────────────────────────────

      case "coinflip": {
        await interaction.deferReply();
        const bet = interaction.options.getInteger("bet", true);
        const call = interaction.options.getString("call", true) as "heads" | "tails";

        const idempotencyKey = `bot-cf-${interaction.id}-${randomUUID()}`;
        const gameRes = await api(
          "POST",
          "/nuggies/games/coinflip/start",
          userId,
          { bet, input: { call } },
          idempotencyKey
        );

        if (!gameRes.ok) {
          await interaction.editReply(gameErrorMessage(gameRes.status, gameRes.data as { error?: string; secondsLeft?: number; code?: string } | null));
          return;
        }

        const state = gameRes.data as GameStateResponse;
        if (state.result?.type !== "coinflip") {
          await interaction.editReply("❌ Unexpected response from game server.");
          return;
        }
        const r = state.result;
        const emoji = r.outcome === "heads" ? "🪙" : "🥏";
        const outcome = r.won
          ? `✅ **${r.call.toUpperCase()}** — you win ${nuggie(state.payout ?? 0)}! (net +${(state.payout ?? 0) - bet})`
          : `❌ **${r.outcome.toUpperCase()}** — you lose ${nuggie(bet)}`;
        await interaction.editReply(
          `${emoji} **${username}** flipped **${r.outcome}** (called ${r.call})\n${outcome}\nBalance: ${nuggie(state.newBalance ?? 0)}`
        );
        break;
      }

      // ── /blackjack ────────────────────────────────────────────────────────

      case "blackjack": {
        const bet = interaction.options.getInteger("bet", true);

        await interaction.deferReply();

        const startKey = `bot-bj-start-${interaction.id}-${randomUUID()}`;
        const startRes = await api(
          "POST",
          "/nuggies/games/blackjack/start",
          userId,
          { bet, input: {} },
          startKey
        );

        if (!startRes.ok) {
          await interaction.editReply(gameErrorMessage(startRes.status, startRes.data as { error?: string; secondsLeft?: number; code?: string } | null));
          return;
        }

        let state = startRes.data as GameStateResponse;

        // Auto-resolved on start (natural blackjack)?
        if (state.status === "resolved" && state.result?.type === "blackjack") {
          const r = state.result;
          await interaction.editReply(
            `🃏✨ **BLACKJACK!** **${username}** hits 21!\n` +
            `Your hand: ${formatHand(r.playerHand)}\n` +
            `Payout: ${nuggie(state.payout ?? 0)} | Balance: ${nuggie(state.newBalance ?? 0)}`
          );
          return;
        }

        const sessionId = state.sessionId;

        const renderActive = (s: GameStateResponse): string =>
          `🃏 **${username}**'s Blackjack — Bet: ${nuggie(bet)}\n` +
          `Your hand: ${formatHand(s.data.playerHand ?? [])} (${s.data.playerTotal ?? 0})\n` +
          `Dealer: ${formatHandWithHidden(s.data.dealerHand ?? [], s.data.dealerHidden ?? 0)}\n\n` +
          `Hit or Stand?`;

        const buttons = () =>
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`bj_hit_${userId}`).setLabel("Hit").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`bj_stand_${userId}`).setLabel("Stand").setStyle(ButtonStyle.Danger)
          );

        const msg = await interaction.editReply({
          content: renderActive(state),
          components: [buttons()],
        });

        const collector = msg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          filter: (i) => i.user.id === userId && (i.customId === `bj_hit_${userId}` || i.customId === `bj_stand_${userId}`),
          time: 60_000,
        });

        collector.on("collect", async (btnInteraction) => {
          const action = btnInteraction.customId === `bj_hit_${userId}` ? "hit" : "stand";
          const stepKey = `bot-bj-step-${interaction.id}-${btnInteraction.id}-${randomUUID()}`;
          const stepRes = await api(
            "POST",
            `/nuggies/games/${sessionId}/step`,
            userId,
            { action },
            stepKey
          );

          if (!stepRes.ok) {
            collector.stop("error");
            await btnInteraction.update({
              content: gameErrorMessage(stepRes.status, stepRes.data as { error?: string; secondsLeft?: number; code?: string } | null),
              components: [],
            });
            return;
          }

          state = stepRes.data as GameStateResponse;

          if (state.status === "resolved" && state.result?.type === "blackjack") {
            collector.stop("resolved");
            const r = state.result;
            const playerTotal = state.data.playerTotal ?? 0;
            const dealerTotal = state.data.dealerTotal ?? 0;
            await btnInteraction.update({
              content:
                `🃏 **${username}**'s Blackjack — ${blackjackResultText(r.result)}\n` +
                `Your hand: ${formatHand(r.playerHand)} (**${playerTotal}**)\n` +
                `Dealer: ${formatHand(r.dealerHand)} (**${dealerTotal}**)\n` +
                `Payout: ${nuggie(state.payout ?? 0)} | Balance: ${nuggie(state.newBalance ?? 0)}`,
              components: [],
            });
            return;
          }

          // Still active — update the message with new hand state
          await btnInteraction.update({
            content: renderActive(state),
            components: [buttons()],
          });
        });

        collector.on("end", async (_, reason) => {
          if (reason === "resolved" || reason === "error") return;
          // Timeout — server will auto-stand on its own. Force a stand call to
          // surface the result to the user.
          const standKey = `bot-bj-timeout-${interaction.id}-${randomUUID()}`;
          const standRes = await api(
            "POST",
            `/nuggies/games/${sessionId}/step`,
            userId,
            { action: "stand" },
            standKey
          );
          if (standRes.ok) {
            const finalState = standRes.data as GameStateResponse;
            if (finalState.result?.type === "blackjack") {
              const r = finalState.result;
              await interaction.editReply({
                content:
                  `🃏 **${username}**'s Blackjack — ⏰ auto-stand · ${blackjackResultText(r.result)}\n` +
                  `Your hand: ${formatHand(r.playerHand)} (**${finalState.data.playerTotal ?? 0}**)\n` +
                  `Dealer: ${formatHand(r.dealerHand)} (**${finalState.data.dealerTotal ?? 0}**)\n` +
                  `Payout: ${nuggie(finalState.payout ?? 0)} | Balance: ${nuggie(finalState.newBalance ?? 0)}`,
                components: [],
              }).catch(() => {});
            }
          }
        });

        break;
      }

      // ── /guessnumber ──────────────────────────────────────────────────────

      case "guessnumber": {
        const bet = interaction.options.getInteger("bet", true);
        await interaction.deferReply();

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`guess_${userId}`)
          .setPlaceholder("Pick a number 1–10")
          .addOptions(
            Array.from({ length: 10 }, (_, i) =>
              new StringSelectMenuOptionBuilder().setLabel(String(i + 1)).setValue(String(i + 1))
            )
          );

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        const msg = await interaction.editReply({
          content: `🎯 **${username}** is guessing a number (1–10) — Bet: ${nuggie(bet)}\n*Correct = 8× payout!*`,
          components: [row],
        });

        const collector = msg.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          filter: (i) => i.user.id === userId && i.customId === `guess_${userId}`,
          time: 30_000,
          max: 1,
        });

        collector.on("collect", async (selectInteraction) => {
          const guess = parseInt(selectInteraction.values[0], 10);
          const idempotencyKey = `bot-gn-${interaction.id}-${randomUUID()}`;
          const gameRes = await api(
            "POST",
            "/nuggies/games/guessnumber/start",
            userId,
            { bet, input: { guess } },
            idempotencyKey
          );

          if (!gameRes.ok) {
            await selectInteraction.update({
              content: gameErrorMessage(gameRes.status, gameRes.data as { error?: string; secondsLeft?: number; code?: string } | null),
              components: [],
            });
            return;
          }

          const state = gameRes.data as GameStateResponse;
          if (state.result?.type !== "guessnumber") {
            await selectInteraction.update({ content: "❌ Unexpected response.", components: [] });
            return;
          }
          const r = state.result;
          const outcomeText = r.won
            ? `✅ **CORRECT!** It was ${r.secret}! Payout: ${nuggie(state.payout ?? 0)}`
            : `❌ **WRONG!** It was **${r.secret}**. Lost ${nuggie(bet)}`;

          await selectInteraction.update({
            content:
              `🎯 **${username}** guessed **${r.guess}**\n` +
              `${outcomeText}\nBalance: ${nuggie(state.newBalance ?? 0)}`,
            components: [],
          });
        });

        collector.on("end", async (collected) => {
          if (collected.size === 0) {
            await interaction.editReply({ content: "⏰ Timed out — no guess made, bet not placed.", components: [] }).catch(() => {});
          }
        });

        break;
      }

      // ── /loan ─────────────────────────────────────────────────────────────

      case "loan": {
        const sub = interaction.options.getSubcommand();

        if (sub === "guide") {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const embed = new EmbedBuilder()
            .setTitle("How Nuggie Loans Work")
            .setDescription("Peer-to-peer lending between crew members. Same rules on web and Discord.")
            .addFields(loanGuideEmbedFields().slice(0, 25))
            .setURL(webUrl("/nuggies/loans"));
          await interaction.editReply({ embeds: [embed] });
          break;
        }

        if (sub === "calc") {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const principal = interaction.options.getInteger("principal", true);
          const interest = interaction.options.getInteger("interest", false);
          const days = interaction.options.getInteger("days", false);
          const qs = new URLSearchParams({ principal: String(principal) });
          if (interest != null) qs.set("interestPct", String(interest));
          if (days != null) qs.set("days", String(days));
          const { ok, data } = await api("GET", `/nuggies/loan/preview?${qs.toString()}`, userId);
          const d = data as { amountDue?: number; interestPortion?: number; dueAt?: string; days?: number; interestPct?: number; error?: string } | null;
          if (!ok) {
            await interaction.editReply(`❌ ${d?.error ?? "Preview failed"}`);
            return;
          }
          await interaction.editReply(
            `Principal ${nuggie(principal)} @ ${d?.interestPct ?? "?"}% · ${d?.days ?? "?"} days\n` +
            `Amount due: ${nuggie(d?.amountDue ?? 0)} (${nuggie(d?.interestPortion ?? 0)} interest)\n` +
            `Due: <t:${Math.floor(new Date(d?.dueAt ?? Date.now()).getTime() / 1000)}:F>`
          );
          break;
        }

        if (sub === "info") {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const loanId = interaction.options.getInteger("id", true);
          const { ok, data } = await api("GET", `/nuggies/loan/${loanId}`, userId);
          const d = data as {
            loan?: {
              id: number; status: string; principal: number; amountDue: number; collateral: number;
              dueAt: string; isLender: boolean; interestRatePct?: number;
              counterparty?: { displayName: string };
            };
            error?: string;
          } | null;
          if (!ok || !d?.loan) {
            await interaction.editReply(`❌ ${d?.error ?? "Loan not found"}`);
            return;
          }
          const l = d.loan;
          await interaction.editReply(
            `Loan \`${l.id}\` · **${l.status}**\n` +
            `${l.isLender ? "Lent" : "Borrowed"} ${nuggie(l.principal)} → due ${nuggie(l.amountDue)}` +
            (l.interestRatePct != null ? ` @ ${l.interestRatePct}%` : "") +
            (l.collateral ? ` · collateral ${nuggie(l.collateral)}` : "") +
            `\nWith: **${l.counterparty?.displayName ?? "crew"}** · Due <t:${Math.floor(new Date(l.dueAt).getTime() / 1000)}:R>\n` +
            loanWebLink(l.id)
          );
          break;
        }

        if (sub === "wizard") {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const action = interaction.options.getString("action", true);
          if (action === "offer") {
            const borrower = interaction.options.getUser("borrower", false);
            const amount = interaction.options.getInteger("amount", false);
            if (!borrower || !amount) {
              await interaction.editReply("Offer wizard needs **borrower** and **amount**. Example: `/loan wizard action:Offer borrower:@crew amount:100`");
              return;
            }
            loanWizardPending.set(userId, {
              kind: "offer",
              userId,
              toDiscordUserId: borrower.id,
              amount,
              durationDays: interaction.options.getInteger("days", false) ?? undefined,
              interestPct: interaction.options.getInteger("interest", false) ?? undefined,
              collateral: interaction.options.getInteger("collateral", false) ?? 0,
            });
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder().setCustomId("loan_wizard_confirm").setLabel("Confirm offer").setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId("loan_wizard_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
            );
            await interaction.editReply({
              content: `Confirm loan offer to **${borrower.username}** for ${nuggie(amount)}?`,
              components: [row],
            });
            break;
          }
          const loanId = interaction.options.getInteger("id", false);
          if (!loanId) {
            await interaction.editReply("Repay wizard needs **id** (pick an active borrowed loan).");
            return;
          }
          loanWizardPending.set(userId, { kind: "repay", userId, loanId });
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("loan_wizard_confirm").setLabel("Confirm repay").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("loan_wizard_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
          );
          await interaction.editReply({
            content: `Confirm repay for loan \`${loanId}\`?`,
            components: [row],
          });
          break;
        }

        if (sub === "offer") {
          await interaction.deferReply();
          const borrower = interaction.options.getUser("borrower", true);
          const amount = interaction.options.getInteger("amount", true);
          const days = interaction.options.getInteger("days", false) ?? undefined;
          const interest = interaction.options.getInteger("interest", false) ?? undefined;
          const collateral = interaction.options.getInteger("collateral", false) ?? 0;

          const { ok, data } = await api("POST", "/nuggies/loan/offer", userId, {
            toDiscordUserId: borrower.id, amount, durationDays: days, interestPct: interest, collateral,
          });
          const d = data as { loanId?: number; amountDue?: number; dueAt?: string; collateral?: number; error?: string } | null;

          if (!ok) { await interaction.editReply(`❌ ${d?.error ?? "Failed"}`); return; }

          await interaction.editReply(
            `🤝 **${username}** offered a loan to **${borrower.username}**\n` +
            `Principal: ${nuggie(amount)} | Due back: ${nuggie(d?.amountDue ?? 0)}` +
            (d?.collateral ? ` | Collateral required: ${nuggie(d.collateral)}` : "") +
            `\nLoan ID: \`${d?.loanId}\` · Due: <t:${Math.floor(new Date(d?.dueAt ?? Date.now()).getTime() / 1000)}:R>\n` +
            `**${borrower.username}**: use \`/loan accept ${d?.loanId}\` to accept.\n` +
            loanWebLink(d?.loanId ?? 0)
          );
          break;
        }

        if (sub === "accept") {
          await interaction.deferReply();
          const loanId = interaction.options.getInteger("id", true);
          const { ok, data } = await api("POST", `/nuggies/loan/${loanId}/accept`, userId);
          const d = data as { principal?: number; dueAt?: string; error?: string } | null;
          if (!ok) { await interaction.editReply(`❌ ${d?.error ?? "Failed"}`); return; }
          await interaction.editReply(
            `✅ **${username}** accepted loan \`${loanId}\`. Received ${nuggie(d?.principal ?? 0)} · Due <t:${Math.floor(new Date(d?.dueAt ?? Date.now()).getTime() / 1000)}:R>\n` +
            loanWebLink(loanId)
          );
          break;
        }

        if (sub === "repay") {
          await interaction.deferReply();
          const loanId = interaction.options.getInteger("id", true);
          const { ok, data } = await api("POST", `/nuggies/loan/${loanId}/repay`, userId);
          const d = data as { amountPaid?: number; collateralReturned?: number; error?: string } | null;
          if (!ok) { await interaction.editReply(`❌ ${d?.error ?? "Failed"}`); return; }
          await interaction.editReply(
            `✅ **${username}** repaid loan \`${loanId}\` — ${nuggie(d?.amountPaid ?? 0)} paid` +
            (d?.collateralReturned ? ` + ${nuggie(d.collateralReturned)} collateral returned` : "") +
            `\n${loanWebLink(loanId)}`
          );
          break;
        }

        if (sub === "cancel") {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const loanId = interaction.options.getInteger("id", true);
          const { ok, data } = await api("POST", `/nuggies/loan/${loanId}/cancel`, userId);
          const d = data as { error?: string } | null;
          if (!ok) { await interaction.editReply(`❌ ${d?.error ?? "Failed"}`); return; }
          await interaction.editReply(`✅ Loan \`${loanId}\` cancelled.`);
          break;
        }

        if (sub === "list") {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const statusFilter = interaction.options.getString("status") ?? "all";
          const { ok, data } = await api("GET", "/nuggies/loans", userId);
          const d = data as { loans?: Array<{ id: number; status: string; principal: number; amountDue: number; dueAt: string; isLender: boolean; collateral: number }> } | null;
          if (!ok || !d?.loans?.length) {
            await interaction.editReply(`No loans on the books.\n${webUrl("/nuggies/loans")}`);
            return;
          }

          const filtered = d.loans.filter((l) => {
            if (statusFilter === "all") return true;
            if (statusFilter === "pending") return l.status === "pending";
            if (statusFilter === "active") return l.status === "active";
            return l.status === "repaid" || l.status === "defaulted" || l.status === "cancelled";
          });

          if (!filtered.length) {
            await interaction.editReply(`No loans match that filter.\n${webUrl("/nuggies/loans")}`);
            return;
          }

          const lines = filtered.slice(0, 20).map((l) =>
            `\`${l.id}\` ${l.isLender ? "📤 Lent" : "📥 Borrowed"} ${nuggie(l.principal)} · Due ${nuggie(l.amountDue)} · <t:${Math.floor(new Date(l.dueAt).getTime() / 1000)}:R> · ${l.status}`
          );
          await interaction.editReply(`${lines.join("\n")}\n\nFull hub: ${webUrl("/nuggies/loans")}`);
          break;
        }
        break;
      }

      // ── /market ───────────────────────────────────────────────────────────

      case "market": {
        const sub = interaction.options.getSubcommand();

        if (sub === "browse") {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const { ok, data } = await api("GET", "/nuggies/market", userId);
          const d = data as { listings?: Array<{ id: number; price: number; item: { name: string; itemData: { emoji?: string } }; seller: { username: string } }> } | null;
          if (!ok || !d?.listings?.length) { await interaction.editReply("Marketplace is empty right now."); return; }
          const lines = d.listings.slice(0, 15).map((l) =>
            `\`${l.id}\` ${l.item.itemData.emoji ?? ""} **${l.item.name}** — ${l.price.toLocaleString()} 🍗 · by ${l.seller.username}`
          );
          await interaction.editReply(lines.join("\n") + "\n\nUse `/market buy <id>` to purchase.");
          break;
        }

        if (sub === "list") {
          await interaction.deferReply();
          const itemName = interaction.options.getString("item", true).trim().toLowerCase();
          const price = interaction.options.getInteger("price", true);

          const invRes = await api("GET", "/nuggies/inventory", userId);
          const invData = invRes.data as { inventory?: Array<{ itemId: number; name: string }> } | null;
          const item = invData?.inventory?.find((i) => i.name.toLowerCase() === itemName);
          if (!item) { await interaction.editReply("Item not in your inventory."); return; }

          const { ok, data } = await api("POST", "/nuggies/market/list", userId, { itemId: item.itemId, price });
          const d = data as { listingId?: number; error?: string } | null;
          if (!ok) { await interaction.editReply(`❌ ${d?.error ?? "Failed"}`); return; }
          await interaction.editReply(`📦 **${username}** listed **${item.name}** for ${price.toLocaleString()} 🍗 (listing ID: \`${d?.listingId}\`)`);
          break;
        }

        if (sub === "buy") {
          await interaction.deferReply();
          const listingId = interaction.options.getInteger("id", true);
          const { ok, data } = await api("POST", `/nuggies/market/${listingId}/buy`, userId);
          const d = data as { price?: number; sellerReceives?: number; fee?: number; error?: string } | null;
          if (!ok) { await interaction.editReply(`❌ ${d?.error ?? "Failed"}`); return; }
          await interaction.editReply(`🛒 **${username}** bought listing \`${listingId}\` for ${nuggie(d?.price ?? 0)}!`);
          break;
        }

        if (sub === "cancel") {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const listingId = interaction.options.getInteger("id", true);
          const { ok, data } = await api("DELETE", `/nuggies/market/${listingId}`, userId);
          const d = data as { error?: string } | null;
          if (!ok) { await interaction.editReply(`❌ ${d?.error ?? "Failed"}`); return; }
          await interaction.editReply(`✅ Listing \`${listingId}\` cancelled.`);
          break;
        }
        break;
      }

      // ── /leaderboard ──────────────────────────────────────────────────────

      case "leaderboard": {
        await interaction.deferReply();
        const { ok, data } = await api("GET", "/nuggies/leaderboard", userId);
        const d = data as {
          leaderboard?: Array<{
            rank: number;
            discordUserId: string;
            username: string;
            balance: number;
            equippedTitle?: { name: string; itemData?: { emoji?: string } } | null;
          }>;
        } | null;
        const entries = d?.leaderboard ?? [];
        if (!ok || entries.length === 0) {
          await interaction.editReply("No leaderboard data right now.");
          return;
        }
        const top = entries.slice(0, 10);
        const myRank = entries.find((e) => e.discordUserId === userId);
        const lines = top.map((e) => {
          const medal = e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : `\`#${String(e.rank).padStart(2, " ")}\``;
          const title = e.equippedTitle?.name ? ` _${e.equippedTitle.itemData?.emoji ?? ""} ${e.equippedTitle.name}_` : "";
          return `${medal} **${e.username}**${title} — ₦${e.balance.toLocaleString()}`;
        });
        const embed = new EmbedBuilder()
          .setTitle("🏆 Nuggies · Ladder")
          .setDescription(lines.join("\n"))
          .setColor(0xfbbf24);
        if (myRank && myRank.rank > 10) {
          embed.setFooter({
            text: `Your rank: #${myRank.rank} · ₦${myRank.balance.toLocaleString()}`,
          });
        } else if (myRank) {
          embed.setFooter({ text: `Your balance: ₦${myRank.balance.toLocaleString()}` });
        }
        await interaction.editReply({ embeds: [embed] });
        break;
      }

      // ── /profile ──────────────────────────────────────────────────────────

      case "profile": {
        await interaction.deferReply();
        const targetUser = interaction.options.getUser("user");
        const targetId = targetUser?.id ?? userId;
        const targetName = targetUser?.username ?? username;
        const avatarUrl = (targetUser ?? interaction.user).displayAvatarURL({ size: 128 });

        const { ok, data } = await api("GET", `/nuggies/user/${targetId}`, userId);
        const d = data as {
          balance?: number;
          lifetimeEarned?: number;
          equippedItems?: Array<{ name: string; itemType: string; itemData: { emoji?: string; label?: string } }>;
        } | null;
        if (!ok || d?.balance === undefined) {
          await interaction.editReply("Couldn't load that profile.");
          return;
        }

        const balance = d.balance;
        const lifetimeEarned = d.lifetimeEarned ?? balance;
        const equipped = d.equippedItems ?? [];
        const nextMilestone = MILESTONES.find((m) => lifetimeEarned < m);
        const equippedLines = equipped.length
          ? equipped.map((it) => `• ${it.itemData?.emoji ?? "✨"} **${it.name}** _(${it.itemType})_`).join("\n")
          : "_None equipped_";

        const embed = new EmbedBuilder()
          .setTitle(`${targetName}'s Profile`)
          .setThumbnail(avatarUrl)
          .setColor(0xfbbf24)
          .addFields(
            { name: "Balance", value: `₦${balance.toLocaleString()}`, inline: true },
            { name: "Lifetime earned", value: `₦${lifetimeEarned.toLocaleString()}`, inline: true },
            {
              name: "Next milestone",
              value: nextMilestone
                ? `₦${nextMilestone.toLocaleString()} · ${Math.round((lifetimeEarned / nextMilestone) * 100)}%`
                : "Apex tier 🦑",
              inline: true,
            },
            { name: "Equipped", value: equippedLines, inline: false }
          );
        await interaction.editReply({ embeds: [embed] });
        break;
      }

      // ── /inventory ────────────────────────────────────────────────────────

      case "inventory": {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const filter = interaction.options.getString("type") ?? "all";
        const { ok, data } = await api("GET", "/nuggies/me", userId);
        const d = data as {
          inventory?: Array<{
            itemId: number;
            name: string;
            itemType: string;
            itemData: { emoji?: string; label?: string };
            equipped: boolean;
          }>;
        } | null;
        if (!ok) {
          await interaction.editReply("Couldn't load inventory.");
          return;
        }
        let items = d?.inventory ?? [];
        if (filter !== "all") items = items.filter((i) => i.itemType === filter);
        if (items.length === 0) {
          await interaction.editReply(
            filter === "all"
              ? "Your locker's empty. Try `/shop` to spend some Nuggies."
              : `No ${filter}s in your locker yet.`
          );
          return;
        }
        const grouped = new Map<string, typeof items>();
        for (const it of items) {
          const list = grouped.get(it.itemType) ?? [];
          list.push(it);
          grouped.set(it.itemType, list);
        }
        const embed = new EmbedBuilder()
          .setTitle(`${username}'s Inventory`)
          .setColor(0x22d3ee);
        for (const [type, list] of grouped) {
          const lines = list
            .map((it) => `${it.itemData?.emoji ?? "✨"} **${it.name}**${it.equipped ? " · *equipped*" : ""}`)
            .join("\n");
          embed.addFields({
            name: `${type.charAt(0).toUpperCase()}${type.slice(1)}s · ${list.length}`,
            value: lines,
            inline: false,
          });
        }
        await interaction.editReply({ embeds: [embed] });
        break;
      }

      // ── /milestones ───────────────────────────────────────────────────────

      case "milestones": {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { ok, data } = await api("GET", "/nuggies/me", userId);
        const d = data as { balance?: number; lifetimeEarned?: number } | null;
        if (!ok || d?.balance === undefined) {
          await interaction.editReply("Couldn't load milestones.");
          return;
        }
        const balance = d.balance;
        const lifetimeEarned = d.lifetimeEarned ?? balance;
        const nextMilestone = MILESTONES.find((m) => lifetimeEarned < m);
        const ladder = MILESTONES.map((m, i) => {
          const reached = lifetimeEarned >= m;
          const isNext = !reached && (i === 0 || lifetimeEarned >= MILESTONES[i - 1]);
          const marker = reached ? "⭐" : isNext ? "◎" : "○";
          return `${marker} **${MILESTONE_LABELS[i]}** ${reached ? "_reached_" : ""}`;
        }).join("\n");
        const embed = new EmbedBuilder()
          .setTitle("🏝️ Rank · Progress")
          .setDescription(ladder)
          .setColor(0xfbbf24)
          .addFields(
            {
              name: nextMilestone ? `Next: ₦${nextMilestone.toLocaleString()}` : "All milestones reached",
              value: nextMilestone
                ? `\`${progressBar(lifetimeEarned, nextMilestone)}\` ${Math.round((lifetimeEarned / nextMilestone) * 100)}%\n₦${lifetimeEarned.toLocaleString()} / ₦${nextMilestone.toLocaleString()}`
                : `Lifetime earned: ₦${lifetimeEarned.toLocaleString()}`,
              inline: false,
            },
            {
              name: "Stats",
              value: `Lifetime ₦${lifetimeEarned.toLocaleString()} · Balance ₦${balance.toLocaleString()}`,
              inline: false,
            }
          );
        await interaction.editReply({ embeds: [embed] });
        break;
      }

      // ── /activity ─────────────────────────────────────────────────────────

      case "activity": {
        await interaction.deferReply();
        const scope = interaction.options.getString("scope") ?? "all";
        const { ok, data } = await api("GET", "/activity?limit=25", userId);
        const d = data as { events?: ActivityEvent[] } | null;
        if (!ok) {
          await interaction.editReply("Couldn't load activity feed.");
          return;
        }
        let events = d?.events ?? [];
        if (scope !== "all") events = events.filter((e) => e.category === scope);
        events = events.slice(0, 10);
        if (events.length === 0) {
          await interaction.editReply(
            scope === "all"
              ? "No island activity yet — schedule a game night or sync your library to get the dock buzzing."
              : `Nothing in **${scope}** right now.`
          );
          return;
        }
        const embed = new EmbedBuilder()
          .setTitle(scope === "all" ? "🌴 Island Activity" : `🌴 Activity · ${scope}`)
          .setDescription(events.map(describeActivity).join("\n"))
          .setColor(0x22d3ee);
        await interaction.editReply({ embeds: [embed] });
        break;
      }

      // ── /nuggies-opt-out / opt-in ─────────────────────────────────────────

      case "nuggies-opt-out": {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { ok } = await api("POST", "/nuggies/opt-out", userId);
        await interaction.editReply(ok ? "✅ Opted out of Nuggies. Your balance is preserved." : "❌ Failed.");
        break;
      }

      case "nuggies-opt-in": {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { ok } = await api("POST", "/nuggies/opt-in", userId);
        await interaction.editReply(ok ? "✅ Welcome back to Nuggies 🍗!" : "❌ Failed.");
        break;
      }

      // ── /nuggie ask <question> ───────────────────────────────────────────
      case "nuggie": {
        const sub = interaction.options.getSubcommand(false);
        if (sub !== "ask") {
          await interaction.reply({ content: "Unknown subcommand.", flags: MessageFlags.Ephemeral });
          break;
        }
        await interaction.deferReply();
        const question = interaction.options.getString("question", true);
        const displayName =
          (interaction.member && "displayName" in interaction.member
            ? (interaction.member as { displayName?: string }).displayName
            : null) ?? username;

        const { ok, status, data } = await internalApi("POST", "/internal/bot/nuggie-chat", {
          question,
          discordUserId: userId,
          discordDisplayName: displayName,
        });

        if (!ok) {
          const err = data && typeof data === "object" && "error" in data ? String((data as { error: string }).error) : `HTTP ${status}`;
          await interaction.editReply(`🍗 ${err}`);
          break;
        }
        const text = data && typeof data === "object" && "text" in data
          ? String((data as { text: string }).text)
          : "(no response)";
        // Discord 2000-char hard limit on message content. Persona prompt caps
        // at ~280 chars so this only trips on a misconfigured maxTokens.
        await interaction.editReply(text.slice(0, 1900));
        break;
      }
    }
  } catch (error) {
    console.error(`${interaction.commandName} failed:`, error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: "Something went wrong. Please try again." }).catch(() => {});
    }
  }
});

if (token) {
  client.login(token);
} else {
  console.log("DISCORD_BOT_TOKEN missing — bot not started.");
}
