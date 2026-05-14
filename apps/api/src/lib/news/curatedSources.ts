import { db } from "../../db/client.js";

// Curated seed list for the news source registry. The boot seeder upserts
// these rows ON CONFLICT (kind, slug) DO NOTHING so admin edits to name /
// identifier / enabled persist across restarts, while newly added presets
// (e.g. when this list grows in a future deploy) appear automatically.

export type SeedSource = {
  kind: "rss" | "reddit" | "youtube" | "gnews";
  slug: string;
  name: string;
  /** RSS URL, subreddit name, or YouTube channel ID. */
  identifier: string;
  /** Default enablement when seeding. YouTube sources default OFF — they
   *  need an API key to function. */
  enabledByDefault?: boolean;
};

export const CURATED_SOURCES: SeedSource[] = [
  // ── RSS: major gaming outlets ──────────────────────────────────────────────
  { kind: "rss", slug: "pcgamer",          name: "PC Gamer",            identifier: "https://www.pcgamer.com/rss/" },
  { kind: "rss", slug: "rockpapershotgun", name: "Rock Paper Shotgun",  identifier: "https://www.rockpapershotgun.com/feed" },
  { kind: "rss", slug: "eurogamer",        name: "Eurogamer",           identifier: "https://www.eurogamer.net/?format=rss" },
  { kind: "rss", slug: "kotaku",           name: "Kotaku",              identifier: "https://kotaku.com/rss" },
  { kind: "rss", slug: "ign",              name: "IGN",                 identifier: "https://feeds.feedburner.com/ign/games-all" },
  { kind: "rss", slug: "polygon",          name: "Polygon",             identifier: "https://www.polygon.com/rss/index.xml" },
  { kind: "rss", slug: "vg247",            name: "VG247",               identifier: "https://www.vg247.com/feed" },
  { kind: "rss", slug: "pcgamesn",         name: "PCGamesN",            identifier: "https://www.pcgamesn.com/mainrss.xml" },
  { kind: "rss", slug: "theverge",         name: "The Verge",           identifier: "https://www.theverge.com/rss/gaming/index.xml" },
  { kind: "rss", slug: "gamesradar",       name: "GamesRadar",          identifier: "https://www.gamesradar.com/rss/" },
  { kind: "rss", slug: "gamespot",         name: "GameSpot",            identifier: "https://www.gamespot.com/feeds/news/" },
  { kind: "rss", slug: "destructoid",      name: "Destructoid",         identifier: "https://www.destructoid.com/feed/" },
  { kind: "rss", slug: "arstechnica-gaming", name: "Ars Technica Gaming", identifier: "https://feeds.arstechnica.com/arstechnica/gaming" },
  { kind: "rss", slug: "engadget-gaming",  name: "Engadget Gaming",     identifier: "https://www.engadget.com/rss.xml" },
  { kind: "rss", slug: "gamedeveloper",    name: "Game Developer",      identifier: "https://www.gamedeveloper.com/rss.xml" },
  { kind: "rss", slug: "gamesindustry",    name: "GamesIndustry.biz",   identifier: "https://www.gamesindustry.biz/feed" },
  { kind: "rss", slug: "wccftech-gaming",  name: "Wccftech Gaming",     identifier: "https://wccftech.com/category/gaming/feed/" },
  { kind: "rss", slug: "dsogaming",        name: "DSOGaming",           identifier: "https://www.dsogaming.com/feed/" },
  { kind: "rss", slug: "80lv",             name: "80 Level",            identifier: "https://80.lv/feed/" },
  { kind: "rss", slug: "nichegamer",       name: "Niche Gamer",         identifier: "https://nichegamer.com/feed/" },
  { kind: "rss", slug: "gamerant",         name: "Game Rant",           identifier: "https://gamerant.com/feed/" },

  // ── RSS: platform-specific outlets ─────────────────────────────────────────
  { kind: "rss", slug: "pushsquare",       name: "Push Square (PS)",    identifier: "https://www.pushsquare.com/feeds/news" },
  { kind: "rss", slug: "purexbox",         name: "Pure Xbox",           identifier: "https://www.purexbox.com/feeds/news" },
  { kind: "rss", slug: "nintendolife",     name: "Nintendo Life",       identifier: "https://www.nintendolife.com/feeds/latest" },
  { kind: "rss", slug: "gematsu",          name: "Gematsu",             identifier: "https://www.gematsu.com/feed" },

  // ── Reddit: gaming subreddits (public RSS, no key required) ────────────────
  { kind: "reddit", slug: "reddit-games",          name: "r/Games",          identifier: "Games" },
  { kind: "reddit", slug: "reddit-gaming",         name: "r/gaming",         identifier: "gaming" },
  { kind: "reddit", slug: "reddit-pcgaming",       name: "r/pcgaming",       identifier: "pcgaming" },
  { kind: "reddit", slug: "reddit-ps5",            name: "r/PS5",            identifier: "PS5" },
  { kind: "reddit", slug: "reddit-xboxseriesx",    name: "r/XboxSeriesX",    identifier: "XboxSeriesX" },
  { kind: "reddit", slug: "reddit-nintendoswitch", name: "r/NintendoSwitch", identifier: "NintendoSwitch" },

  // ── YouTube: gaming creator channels (requires youtube_api_key) ────────────
  // Disabled by default — admin enables individually once a key is configured.
  // Channel IDs verified at time of writing; refresh if a channel is renamed.
  { kind: "youtube", slug: "yt-skillup",   name: "Skill Up",    identifier: "UCZ7AeeVbyslLM_8-nVy2B8Q", enabledByDefault: false },
  { kind: "youtube", slug: "yt-acg",       name: "ACG",         identifier: "UCK9_x1DImhU-eolIay5rb2Q", enabledByDefault: false },
  { kind: "youtube", slug: "yt-gamespot",  name: "GameSpot",    identifier: "UCbu2SsF-Or3Rsn3NxqODImw", enabledByDefault: false },
  { kind: "youtube", slug: "yt-eurogamer", name: "Eurogamer",   identifier: "UCciKycgzURdymx-GRSY2_dA", enabledByDefault: false },

  // ── GNews API (singleton — one row drives the existing GNews fetch) ────────
  // Identifier holds the search query. Provider reads the API key from
  // server_settings.newsapi_key — readinessGate returns a blocker when unset.
  { kind: "gnews", slug: "gnews-gaming", name: "GNews · Gaming Search", identifier: "video games gaming" },
];

/**
 * Upserts every curated source into news_source_registry. Run on every boot
 * after migrations. Idempotent: ON CONFLICT DO NOTHING preserves admin edits
 * to name/identifier/enabled. New entries added to CURATED_SOURCES in future
 * deploys appear automatically.
 */
export async function seedCuratedSources(): Promise<void> {
  let inserted = 0;
  for (const s of CURATED_SOURCES) {
    const r = await db.query(
      `INSERT INTO news_source_registry (kind, slug, name, identifier, enabled, is_preset)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       ON CONFLICT (kind, slug) DO NOTHING
       RETURNING id`,
      [s.kind, s.slug, s.name, s.identifier, s.enabledByDefault ?? true]
    );
    if (r.rowCount && r.rowCount > 0) inserted++;
  }
  if (inserted > 0) {
    console.log(`[news-sources] seeded ${inserted} curated source(s) into news_source_registry`);
  }
}
