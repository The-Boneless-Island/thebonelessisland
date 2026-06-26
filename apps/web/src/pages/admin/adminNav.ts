// Admin information architecture: sidebar groups, page registry, and the
// unified search index (settings + pages + sections). Every admin concern has
// exactly one page; every setting key maps to exactly one page + anchor.

import { ALL_SETTINGS, searchSettings } from "./settingMeta.js";
import type { SettingMeta } from "./settingMeta.js";

export type AdminPageId =
  | "dashboard"
  | "members"
  | "forums"
  | "library"
  | "game-nights"
  | "recommender"
  | "news"
  | "patch-sources"
  | "drift-log"
  | "economy"
  | "shop"
  | "economy-rules"
  | "ai"
  | "persona"
  | "guild"
  | "bridge"
  | "sync"
  | "audit";

export type AdminSection = {
  anchor: string;
  label: string;
  keywords: string[];
};

export type AdminPageMeta = {
  id: AdminPageId;
  label: string;
  icon: string;
  accent: string;
  blurb: string;
  keywords: string[];
  sections: AdminSection[];
};

export type AdminNavGroup = {
  label: string;
  accent: string;
  pages: AdminPageId[];
};

const PEOPLE = "#a78bfa";
const GAMES = "#34d399";
const NEWS = "#0ea5e9";
const ECONOMY = "#f59e0b";
const AI = "#8b5cf6";
const DISCORD = "#7dd3fc";
const SYSTEM = "#6366f1";

export const ADMIN_PAGES: Record<AdminPageId, AdminPageMeta> = {
  dashboard: {
    id: "dashboard",
    label: "Dashboard",
    icon: "🏝️",
    accent: "#60a5fa",
    blurb: "Health at a glance plus quick actions.",
    keywords: ["overview", "home", "health", "quick", "actions", "status"],
    sections: []
  },
  members: {
    id: "members",
    label: "Members & Roles",
    icon: "👥",
    accent: PEOPLE,
    blurb: "Guild roster, presence, and role mapping.",
    keywords: ["members", "roster", "roles", "presence", "onboarding", "people", "users"],
    sections: [
      { anchor: "members-roster", label: "Roster", keywords: ["roster", "list", "presence", "online"] },
      { anchor: "members-roles", label: "Role mapping", keywords: ["roles", "mapping", "discord", "promote"] },
      { anchor: "members-onboarding", label: "Onboarding", keywords: ["onboarding", "tour", "washed ashore", "reset", "re-show"] }
    ]
  },
  forums: {
    id: "forums",
    label: "Forum Moderation",
    icon: "💬",
    accent: PEOPLE,
    blurb: "Reports, categories, bans, and the mod log.",
    keywords: ["forums", "moderation", "reports", "categories", "bans", "mod", "log", "threads"],
    sections: [
      { anchor: "forums-reports", label: "Open reports", keywords: ["reports", "triage", "flag"] },
      { anchor: "forums-categories", label: "Categories", keywords: ["categories", "slug", "lock"] },
      { anchor: "forums-bans", label: "Bans", keywords: ["ban", "unban", "block"] },
      { anchor: "forums-log", label: "Mod log", keywords: ["log", "actions", "history"] }
    ]
  },
  library: {
    id: "library",
    label: "Game Library",
    icon: "🗂",
    accent: GAMES,
    blurb: "Featured pick and tag overrides.",
    keywords: ["library", "games", "featured", "pick", "tags", "overrides", "month"],
    sections: [
      { anchor: "library-featured", label: "Featured pick", keywords: ["featured", "game of the month", "blurb"] },
      { anchor: "library-tags", label: "Tag overrides", keywords: ["tags", "override", "genre"] }
    ]
  },
  "game-nights": {
    id: "game-nights",
    label: "Game Nights",
    icon: "🎮",
    accent: GAMES,
    blurb: "Defaults and live session controls.",
    keywords: ["game nights", "events", "sessions", "voice", "rsvp", "defaults"],
    sections: [
      { anchor: "nights-defaults", label: "Defaults", keywords: ["voice channel", "auto-pick", "rules", "rsvp"] }
    ]
  },
  recommender: {
    id: "recommender",
    label: "Recommendation Engine",
    icon: "🧭",
    accent: GAMES,
    blurb: "Weights and a what-can-we-play test run.",
    keywords: ["recommendation", "recommender", "weights", "what can we play", "engine", "tuning"],
    sections: [
      { anchor: "rec-weights", label: "Scoring weights", keywords: ["weights", "overlap", "novelty", "party"] },
      { anchor: "rec-results", label: "Test results", keywords: ["results", "ranked", "test"] }
    ]
  },
  news: {
    id: "news",
    label: "Gaming News",
    icon: "📰",
    accent: NEWS,
    blurb: "External feeds, AI curation, and validation health.",
    keywords: ["news", "feed", "rss", "gnews", "youtube", "reddit", "curation", "ingest", "external"],
    sections: [
      { anchor: "news-status", label: "Feed on/off", keywords: ["enable", "disable", "toggle", "feed"] },
      { anchor: "news-sources", label: "Source registry", keywords: ["sources", "rss", "reddit", "youtube", "gnews", "preset"] },
      { anchor: "news-keys", label: "API keys (GNews / YouTube / alerts)", keywords: ["gnews", "youtube", "api", "key", "webhook", "alert"] },
      { anchor: "news-dev-cap", label: "Developer diversity cap", keywords: ["developer", "diversity", "cap", "valve"] },
      {
        anchor: "news-retention",
        label: "Archive & feed tuning",
        keywords: ["retention", "archive", "hot", "warm", "prune", "freshness", "stale", "ingest", "storage", "search"]
      },
      { anchor: "news-triggers", label: "Manual triggers", keywords: ["ingest", "curate", "recurate", "regenerate", "embed", "backfill", "fetch"] },
      { anchor: "news-validation", label: "AI validation failures", keywords: ["validation", "failures", "failed", "retry", "hidden"] }
    ]
  },
  "patch-sources": {
    id: "patch-sources",
    label: "Patch Sources",
    icon: "🔗",
    accent: NEWS,
    blurb: "Per-game RSS escape hatch for non-Steam titles.",
    keywords: ["patch", "sources", "rss", "atom", "feeds", "league", "diablo", "battle.net"],
    sections: []
  },
  "drift-log": {
    id: "drift-log",
    label: "Drift Log",
    icon: "🌊",
    accent: NEWS,
    blurb: "Hand-authored cards pinned on the home page.",
    keywords: ["drift", "log", "cards", "manual", "post", "announcement", "home"],
    sections: []
  },
  economy: {
    id: "economy",
    label: "Economy Operations",
    icon: "🍗",
    accent: ECONOMY,
    blurb: "Grant or deduct Nuggies, award attendance.",
    keywords: ["economy", "nuggies", "grant", "deduct", "attendance", "award", "balance", "holders"],
    sections: [
      { anchor: "economy-grant", label: "Grant / deduct", keywords: ["grant", "deduct", "award", "balance"] },
      { anchor: "economy-attendance", label: "Attendance awards", keywords: ["attendance", "game night", "award"] },
      { anchor: "economy-holders", label: "Top holders", keywords: ["holders", "leaderboard", "supply"] }
    ]
  },
  shop: {
    id: "shop",
    label: "Shop Items",
    icon: "🛍️",
    accent: ECONOMY,
    blurb: "Titles, flairs, and badges for sale.",
    keywords: ["shop", "items", "title", "flair", "badge", "price", "store"],
    sections: []
  },
  "economy-rules": {
    id: "economy-rules",
    label: "Economy Rules",
    icon: "⚖️",
    accent: ECONOMY,
    blurb: "Earn rates, caps, fees, and the master switch.",
    keywords: ["economy", "rules", "settings", "daily", "cap", "fees", "loan", "bet", "give", "freeze"],
    sections: []
  },
  ai: {
    id: "ai",
    label: "AI Provider",
    icon: "🤖",
    accent: AI,
    blurb: "Provider, model, keys, cost, and connection test.",
    keywords: ["ai", "provider", "model", "anthropic", "openai", "gemini", "bedrock", "claude", "gpt", "key", "cost", "test"],
    sections: [
      { anchor: "ai-status", label: "Status & master switch", keywords: ["enabled", "toggle", "status", "spend", "cost", "today"] },
      { anchor: "ai-provider-model", label: "Provider & model", keywords: ["provider", "model", "switch", "claude", "gpt", "gemini", "bedrock", "nova"] },
      { anchor: "ai-keys", label: "API keys", keywords: ["key", "secret", "anthropic", "openai", "gemini", "rotate"] },
      { anchor: "ai-test", label: "Test connection", keywords: ["test", "ping", "connection", "verify"] }
    ]
  },
  persona: {
    id: "persona",
    label: "Nuggie Persona",
    icon: "🐔",
    accent: AI,
    blurb: "System prompt, tone rules, emoji, announcements.",
    keywords: ["nuggie", "persona", "prompt", "tone", "voice", "emoji", "mascot", "announcements"],
    sections: []
  },
  guild: {
    id: "guild",
    label: "Guild Identity",
    icon: "🪪",
    accent: DISCORD,
    blurb: "Which Discord server runs the island, and who's admin.",
    keywords: ["guild", "server", "discord", "id", "admin", "role", "parent", "identity", "oauth"],
    sections: []
  },
  bridge: {
    id: "bridge",
    label: "Discord Bridge",
    icon: "🌉",
    accent: DISCORD,
    blurb: "Milestone announcements, official forum posts, patch alerts, and tier role bindings.",
    keywords: ["bridge", "discord", "milestone", "announcements", "official", "patch", "channel", "tier", "roles", "rank"],
    sections: [
      { anchor: "bridge-channel", label: "Milestone channel", keywords: ["milestone", "channel", "id", "post", "tier"] },
      { anchor: "bridge-roles", label: "Tier roles", keywords: ["roles", "tier", "rank", "assign"] },
      { anchor: "bridge-official", label: "Official announcements", keywords: ["official", "announcements", "forum", "everyone", "ping"] },
      { anchor: "bridge-patches", label: "Patch alerts", keywords: ["patch", "alerts", "notes", "game", "updates"] }
    ]
  },
  sync: {
    id: "sync",
    label: "Data Sync",
    icon: "🔄",
    accent: SYSTEM,
    blurb: "Connector cadences and Steam context health.",
    keywords: ["sync", "data", "connectors", "steam", "discord", "cadence", "health", "telemetry"],
    sections: [
      { anchor: "sync-connectors", label: "Connectors", keywords: ["connectors", "cadence", "schedule"] },
      { anchor: "sync-steam-context", label: "Steam profile context", keywords: ["steam", "groups", "achievements", "context", "curator"] }
    ]
  },
  audit: {
    id: "audit",
    label: "Audit Log",
    icon: "📜",
    accent: SYSTEM,
    blurb: "Recent categorized activity events.",
    keywords: ["audit", "log", "events", "activity", "history", "debug"],
    sections: []
  }
};

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  { label: "People", accent: PEOPLE, pages: ["members", "forums"] },
  { label: "Games", accent: GAMES, pages: ["library", "game-nights", "recommender"] },
  { label: "News", accent: NEWS, pages: ["news", "patch-sources", "drift-log"] },
  { label: "Economy", accent: ECONOMY, pages: ["economy", "shop", "economy-rules"] },
  { label: "Nuggie AI", accent: AI, pages: ["ai", "persona"] },
  { label: "Discord", accent: DISCORD, pages: ["guild", "bridge"] },
  { label: "System", accent: SYSTEM, pages: ["sync", "audit"] }
];

// ── Setting key → page placement ─────────────────────────────────────────────
// Default anchor is `setting-<key>` (an inline SettingCard). Keys whose control
// is a bespoke widget point at that widget's section anchor instead.

const SETTING_PAGE_OVERRIDES: Record<string, { page: AdminPageId; anchor: string }> = {
  ai_enabled: { page: "ai", anchor: "ai-status" },
  ai_api_key: { page: "ai", anchor: "ai-keys" },
  anthropic_api_key: { page: "ai", anchor: "ai-keys" },
  openai_api_key: { page: "ai", anchor: "ai-keys" },
  gemini_api_key: { page: "ai", anchor: "ai-keys" },
  news_general_enabled: { page: "news", anchor: "news-status" },
  newsapi_key: { page: "news", anchor: "news-keys" },
  news_curation_alert_webhook_url: { page: "news", anchor: "news-keys" },
  news_dev_cap: { page: "news", anchor: "news-dev-cap" },
  news_retention_hot_days: { page: "news", anchor: "news-retention" },
  news_retention_warm_days: { page: "news", anchor: "news-retention" },
  news_retention_prune_validation_days: { page: "news", anchor: "news-retention" },
  news_retention_prune_uncurated_days: { page: "news", anchor: "news-retention" },
  news_feed_freshness_days: { page: "news", anchor: "news-retention" },
  news_stale_ingest_hours: { page: "news", anchor: "news-retention" },
  news_ingest_on_page_load: { page: "news", anchor: "news-retention" },
  official_announcements_enabled: { page: "bridge", anchor: "bridge-official" },
  official_announcements_channel_id: { page: "bridge", anchor: "bridge-official" },
  official_announcements_ping_everyone: { page: "bridge", anchor: "bridge-official" },
  patch_alerts_enabled: { page: "bridge", anchor: "bridge-patches" },
  patch_notes_channel_id: { page: "bridge", anchor: "bridge-patches" }
};

const DOMAIN_DEFAULT_PAGE: Record<SettingMeta["domain"], AdminPageId> = {
  people: "guild",
  content: "news",
  engagement: "economy-rules",
  system: "ai"
};

export function settingPlacement(meta: SettingMeta): { page: AdminPageId; anchor: string } {
  const override = SETTING_PAGE_OVERRIDES[meta.key];
  if (override) return override;
  if (meta.key.startsWith("nuggie_") || meta.key === "achievement_announcements_enabled") {
    return { page: "persona", anchor: `setting-${meta.key}` };
  }
  if (meta.key.startsWith("nuggies_")) {
    return { page: "economy-rules", anchor: `setting-${meta.key}` };
  }
  if (meta.domain === "people") {
    return { page: "guild", anchor: `setting-${meta.key}` };
  }
  return { page: DOMAIN_DEFAULT_PAGE[meta.domain], anchor: `setting-${meta.key}` };
}

/** Setting keys rendered as inline SettingCards on a given page. */
export function inlineSettingKeysFor(page: AdminPageId): string[] {
  return ALL_SETTINGS
    .filter((m) => {
      const placement = settingPlacement(m);
      return placement.page === page && placement.anchor === `setting-${m.key}`;
    })
    .map((m) => m.key);
}

/** Gaming News → Archive tab: what members see on the dock. */
export const NEWS_FEED_TUNING_KEYS = [
  "news_feed_freshness_days",
  "news_stale_ingest_hours",
  "news_ingest_on_page_load"
] as const;

/** Gaming News → Archive tab: hot/warm tier boundaries. */
export const NEWS_STORAGE_TIER_KEYS = [
  "news_retention_hot_days",
  "news_retention_warm_days"
] as const;

/** Gaming News → Archive tab: nightly prune thresholds. */
export const NEWS_PRUNE_KEYS = [
  "news_retention_prune_validation_days",
  "news_retention_prune_uncurated_days"
] as const;

export const NEWS_RETENTION_SETTING_KEYS = [
  ...NEWS_FEED_TUNING_KEYS,
  ...NEWS_STORAGE_TIER_KEYS,
  ...NEWS_PRUNE_KEYS
] as const;

// ── Unified admin search ─────────────────────────────────────────────────────

export type AdminSearchResult = {
  type: "setting" | "page" | "section";
  page: AdminPageId;
  anchor?: string;
  label: string;
  description: string;
  accent: string;
};

export function searchAdmin(query: string): AdminSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: AdminSearchResult[] = [];

  for (const page of Object.values(ADMIN_PAGES)) {
    if (page.id === "dashboard") continue;
    const pageHaystack = [page.label, page.blurb, ...page.keywords].join(" ").toLowerCase();
    if (pageHaystack.includes(q)) {
      results.push({
        type: "page",
        page: page.id,
        label: page.label,
        description: page.blurb,
        accent: page.accent
      });
    }
    for (const section of page.sections) {
      const sectionHaystack = [section.label, ...section.keywords].join(" ").toLowerCase();
      if (sectionHaystack.includes(q)) {
        results.push({
          type: "section",
          page: page.id,
          anchor: section.anchor,
          label: section.label,
          description: `${page.label} · ${page.blurb}`,
          accent: page.accent
        });
      }
    }
  }

  for (const meta of searchSettings(query)) {
    const placement = settingPlacement(meta);
    results.push({
      type: "setting",
      page: placement.page,
      anchor: placement.anchor,
      label: meta.label,
      description: meta.description,
      accent: ADMIN_PAGES[placement.page].accent
    });
  }

  // Pages first, then sections, then settings — each bucket keeps its own order.
  const rank = { page: 0, section: 1, setting: 2 } as const;
  return results.sort((a, b) => rank[a.type] - rank[b.type]);
}
