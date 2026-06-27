import { env } from "../../config.js";

const WIKI_USER_AGENT = "BonelessIslandBot/1.0 (+https://bonelessisland.com; news entity logos)";

/** Map story-fingerprint entity slugs to Wikipedia/IGDB search names. */
const FINGERPRINT_ENTITY_NAMES: Record<string, string[]> = {
  obsidian: ["Obsidian Entertainment"],
  sony: ["Sony Interactive Entertainment", "Sony"],
  playstation: ["PlayStation", "Sony Interactive Entertainment"],
  microsoft: ["Microsoft Gaming", "Xbox Game Studios"],
  xbox: ["Xbox Game Studios", "Microsoft Gaming"],
  nintendo: ["Nintendo"],
  ea: ["Electronic Arts"],
  epic: ["Epic Games"],
  ubisoft: ["Ubisoft"],
  bethesda: ["Bethesda Softworks"],
  blizzard: ["Blizzard Entertainment"],
  activision: ["Activision"],
  "square-enix": ["Square Enix"],
  square: ["Square Enix"],
  larian: ["Larian Studios"],
  bungie: ["Bungie"],
  valve: ["Valve Corporation"],
  rockstar: ["Rockstar Games"],
  cdpr: ["CD Projekt"],
  "cd-projekt": ["CD Projekt Red"],
  fromsoftware: ["FromSoftware"],
  capcom: ["Capcom"],
  sega: ["Sega"],
  bandai: ["Bandai Namco Entertainment"],
  namco: ["Bandai Namco Entertainment"],
  embrace: ["Embracer Group"],
  embracer: ["Embracer Group"],
  "take-two": ["Take-Two Interactive"],
  riot: ["Riot Games"],
  mojang: ["Mojang Studios"],
  insomniac: ["Insomniac Games"],
  naughty: ["Naughty Dog"],
  bioware: ["BioWare"],
  dice: ["DICE"],
  respawn: ["Respawn Entertainment"],
  arkane: ["Arkane Studios"],
  id: ["id Software"]
};

/** Single-word fingerprint slugs that collide with non-gaming Wikipedia topics. */
const AMBIGUOUS_ENTITY_SLUGS = new Set([
  "obsidian",
  "apple",
  "valve",
  "epic",
  "riot",
  "square",
  "id",
  "dice",
  "embrace",
  "embracer",
  "bandai",
  "namco",
  "capcom",
  "sega",
  "sony",
  "nintendo",
  "ea"
]);

const WIKI_REJECT_SNIPPET =
  /\b(volcanic glass|igneous rock|mineral|metamorphic rock|sedimentary|gemstone|crystalline|geolog|magma|lava\b|silicate glass)\b/i;

const WIKI_GAMING_SNIPPET =
  /\b(video game|game developer|game studio|game publisher|software company|interactive entertainment|xbox game studios|playstation|nintendo|steam\b|esports|mmorpg|rpg studio)\b/i;

const STUDIO_NAME_SUFFIX = /\b(Entertainment|Interactive|Games|Studios|Software|Corporation|Inc\.|Ltd\.)\b/i;

let igdbAccessTokenCache: { token: string; expiresAtMs: number } | null = null;

async function getIgdbAccessToken(): Promise<string | null> {
  if (!env.IGDB_IMAGE_FALLBACK_ENABLED || !env.IGDB_CLIENT_ID || !env.IGDB_CLIENT_SECRET) {
    return null;
  }
  const now = Date.now();
  if (igdbAccessTokenCache && igdbAccessTokenCache.expiresAtMs > now + 15_000) {
    return igdbAccessTokenCache.token;
  }
  const body = new URLSearchParams({
    client_id: env.IGDB_CLIENT_ID,
    client_secret: env.IGDB_CLIENT_SECRET,
    grant_type: "client_credentials"
  });
  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  }).catch(() => null);
  if (!response?.ok) return null;
  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
  } | null;
  const accessToken = payload?.access_token?.trim();
  const expiresIn = payload?.expires_in ?? 0;
  if (!accessToken || expiresIn <= 0) return null;
  igdbAccessTokenCache = { token: accessToken, expiresAtMs: now + expiresIn * 1000 };
  return accessToken;
}

async function resolveIgdbCompanyLogo(name: string): Promise<string | null> {
  const accessToken = await getIgdbAccessToken();
  if (!accessToken) return null;

  const escaped = name.replaceAll('"', '\\"');
  const searchQuery = [`search "${escaped}";`, "fields name, logo;", "limit 8;"].join(" ");
  const companiesResponse = await fetch("https://api.igdb.com/v4/companies", {
    method: "POST",
    headers: {
      "Client-ID": env.IGDB_CLIENT_ID,
      Authorization: `Bearer ${accessToken}`,
      "content-type": "text/plain"
    },
    body: searchQuery
  }).catch(() => null);
  if (!companiesResponse?.ok) return null;

  const companies = (await companiesResponse.json().catch(() => [])) as Array<{
    name?: string;
    logo?: number;
  }>;

  const query = name.toLowerCase();
  let best: { logo: number; score: number } | null = null;
  for (const company of companies) {
    if (!company.logo || !company.name) continue;
    const cn = company.name.toLowerCase();
    let score = 0;
    if (cn === query) score = 100;
    else if (cn.includes(query) || query.includes(cn)) score = 85;
    else if (query.includes(" ") && cn.startsWith(query.split(" ")[0] ?? "")) score = 55;
    else continue;

    // Bare single-word company names are too ambiguous (e.g. "Obsidian" the mineral context).
    if (!query.includes(" ") && !STUDIO_NAME_SUFFIX.test(company.name) && score < 100) continue;

    if (!best || score > best.score) best = { logo: company.logo, score };
  }
  if (!best || best.score < 55) return null;

  const logoQuery = [`where id = ${best.logo};`, "fields image_id;", "limit 1;"].join(" ");
  const logosResponse = await fetch("https://api.igdb.com/v4/company_logos", {
    method: "POST",
    headers: {
      "Client-ID": env.IGDB_CLIENT_ID,
      Authorization: `Bearer ${accessToken}`,
      "content-type": "text/plain"
    },
    body: logoQuery
  }).catch(() => null);
  if (!logosResponse?.ok) return null;

  const logos = (await logosResponse.json().catch(() => [])) as Array<{ image_id?: string }>;
  const imageId = logos[0]?.image_id?.trim();
  if (!imageId) return null;
  return `https://images.igdb.com/igdb/image/upload/t_logo_med/${imageId}.png`;
}

type WikiSummary = {
  title?: string;
  description?: string;
  extract?: string;
  thumbnail?: { source?: string; width?: number; height?: number };
};

function isGamingEntityWikiPage(summary: WikiSummary, searchTerm: string): boolean {
  const title = summary.title ?? "";
  const text = `${title} ${summary.description ?? ""} ${summary.extract ?? ""}`;
  if (WIKI_REJECT_SNIPPET.test(text)) return false;

  if (STUDIO_NAME_SUFFIX.test(title)) return true;
  if (WIKI_GAMING_SNIPPET.test(text)) return true;

  const queryWords = searchTerm.trim().split(/\s+/);
  if (queryWords.length === 1) {
    // Never accept a single-word page unless it clearly describes a gaming org.
    return false;
  }

  const firstQuery = queryWords[0]?.toLowerCase() ?? "";
  return title.toLowerCase().includes(firstQuery);
}

function wikiThumbnailOk(summary: WikiSummary): string | null {
  const source = summary.thumbnail?.source?.trim();
  if (!source) return null;
  const w = summary.thumbnail?.width ?? 0;
  const h = summary.thumbnail?.height ?? 0;
  if (w > 0 && w < 64) return null;
  // Wide landscape photos are rarely company logos — reject unless title is clearly a studio.
  if (w > 0 && h > 0 && w / h > 1.75 && !STUDIO_NAME_SUFFIX.test(summary.title ?? "")) {
    return null;
  }
  return source;
}

async function fetchWikipediaSummary(titleSlug: string): Promise<WikiSummary | null> {
  const response = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titleSlug)}`,
    {
      headers: { "user-agent": WIKI_USER_AGENT, accept: "application/json" }
    }
  ).catch(() => null);
  if (!response?.ok) return null;
  return (await response.json().catch(() => null)) as WikiSummary | null;
}

async function searchWikipediaTitle(query: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: `${query} video game company`,
    srlimit: "5",
    format: "json",
    origin: "*"
  });
  const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { "user-agent": WIKI_USER_AGENT, accept: "application/json" }
  }).catch(() => null);
  if (!response?.ok) return null;
  const data = (await response.json().catch(() => null)) as {
    query?: { search?: Array<{ title?: string }> };
  } | null;
  return data?.query?.search?.[0]?.title ?? null;
}

async function resolveWikipediaLogo(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (trimmed.length < 2) return null;

  const candidates: string[] = [trimmed.replace(/\s+/g, "_")];
  if (trimmed.includes(" ")) {
    const searched = await searchWikipediaTitle(trimmed);
    if (searched) candidates.unshift(searched.replace(/\s+/g, "_"));
  }

  for (const slug of candidates) {
    const summary = await fetchWikipediaSummary(slug);
    if (!summary || !isGamingEntityWikiPage(summary, trimmed)) continue;
    const thumb = wikiThumbnailOk(summary);
    if (thumb) return thumb;
  }

  return null;
}

function titleCaseFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Build ordered, deduped search terms for publisher/studio logo lookup. */
export function buildEntityLogoSearchTerms(input: {
  title: string;
  aiTitle?: string | null;
  aiGameTitle?: string | null;
  aiTags?: string[];
  storyFingerprint?: string | null;
}): string[] {
  const seen = new Set<string>();
  const add = (term: string | null | undefined) => {
    const t = (term ?? "").trim();
    if (t.length < 2) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    terms.push(t);
  };

  const terms: string[] = [];
  const headline = (input.aiTitle ?? input.title).trim();

  if (input.storyFingerprint?.includes(":")) {
    const entity = input.storyFingerprint.split(":")[0]?.trim().toLowerCase();
    if (entity) {
      for (const mapped of FINGERPRINT_ENTITY_NAMES[entity] ?? []) add(mapped);
      if (!AMBIGUOUS_ENTITY_SLUGS.has(entity)) {
        add(titleCaseFromSlug(entity));
      }
    }
  }

  const studioSuffix =
    headline.match(
      /^([A-Z0-9][A-Za-z0-9&.'\s-]{1,48}?)\s+(Entertainment|Interactive|Games|Studios|Software|Corporation)\b/
    );
  if (studioSuffix) add(`${studioSuffix[1]} ${studioSuffix[2]}`.trim());

  const platformLead = headline.match(/^(Sony|Microsoft|Nintendo|Valve|Epic Games|Ubisoft)\b/i);
  if (platformLead) add(platformLead[1]);

  add(input.aiGameTitle);

  for (const tag of input.aiTags ?? []) {
    if (/^(news|patch notes|announcement|review|preview|opinion|interview|feature|rumor)$/i.test(tag)) {
      continue;
    }
    if (/^(pc|playstation|xbox|nintendo|mobile|vr|fps|rpg|strategy|horror)$/i.test(tag)) continue;
    add(tag);
  }

  const firstWords = headline.match(/^([A-Z][A-Za-z0-9&.'-]{2,28})\b/);
  if (firstWords && !AMBIGUOUS_ENTITY_SLUGS.has(firstWords[1].toLowerCase())) {
    add(firstWords[1]);
  }

  return terms;
}

export async function resolveEntityLogoUrl(input: {
  title: string;
  aiTitle?: string | null;
  aiGameTitle?: string | null;
  aiTags?: string[];
  storyFingerprint?: string | null;
}): Promise<{ url: string; source: "entity_igdb" | "wikipedia" } | null> {
  const terms = buildEntityLogoSearchTerms(input);
  if (terms.length === 0) return null;

  for (const term of terms) {
    const igdb = await resolveIgdbCompanyLogo(term);
    if (igdb) return { url: igdb, source: "entity_igdb" };
  }

  for (const term of terms) {
    const wiki = await resolveWikipediaLogo(term);
    if (wiki) return { url: wiki, source: "wikipedia" };
  }

  return null;
}
