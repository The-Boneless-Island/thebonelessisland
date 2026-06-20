import dns from "node:dns/promises";
import net from "node:net";
import ogs from "open-graph-scraper";

// Resolve a large cover image for an article by scraping its Open Graph /
// Twitter card metadata. Used when the RSS/Reddit feed item ships no image.
// Fail-open: any error returns null and the caller keeps whatever the feed gave.
//
// SSRF: article URLs come from admin-curated feeds (news_source_registry), but a
// compromised or hijacked feed could still point at an internal address, so we
// resolve the host and reject private / loopback / link-local / cloud-metadata
// targets before fetching. (Residual redirect-time DNS-rebinding is accepted for
// this trusted-source model; connect-time IP pinning is a possible future
// hardening if sources ever become user-supplied.)

const block = new net.BlockList();
for (const [ip, n] of [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local incl. 169.254.169.254 cloud metadata
  ["100.64.0.0", 10] // CGNAT
] as const) {
  block.addSubnet(ip, n, "ipv4");
}
block.addAddress("0.0.0.0", "ipv4");
block.addSubnet("::1", 128, "ipv6");
block.addSubnet("fc00::", 7, "ipv6"); // unique-local
block.addSubnet("fe80::", 10, "ipv6"); // link-local
block.addSubnet("::ffff:0:0", 96, "ipv6"); // IPv4-mapped IPv6 bypass guard

/** Resolve a hostname and reject if any of its addresses is in a blocked range. */
async function isSafeHost(hostname: string): Promise<boolean> {
  try {
    const addrs = await dns.lookup(hostname, { all: true, verbatim: true });
    if (addrs.length === 0) return false;
    for (const a of addrs) {
      if (block.check(a.address, a.family === 6 ? "ipv6" : "ipv4")) return false;
    }
    return true;
  } catch {
    return false;
  }
}

const USER_AGENT =
  "BonelessIslandBot/1.0 (+https://bonelessisland.com; gaming-news image fetch)";

export type ResolvedImage = {
  url: string;
  source: "og" | "twitter";
  width: number | null;
  height: number | null;
};

function toDim(v: unknown): number | null {
  const n = typeof v === "string" ? parseInt(v, 10) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Scrape the best available large image for an article URL.
 * Prefers og:image, then twitter:image. Returns null on any failure (fail-open).
 */
export async function resolveHeroImage(articleUrl: string): Promise<ResolvedImage | null> {
  let u: URL;
  try {
    u = new URL(articleUrl);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!(await isSafeHost(u.hostname))) return null;

  try {
    const { error, result } = await ogs({
      url: u.toString(),
      timeout: 8000,
      fetchOptions: {
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml"
        }
      }
    });
    if (error || !result) return null;

    const og = result.ogImage?.[0];
    const tw = result.twitterImage?.[0];
    const pick = og ?? tw;
    if (!pick?.url) return null;

    return {
      url: new URL(pick.url, u).toString(),
      source: og ? "og" : "twitter",
      width: toDim((pick as { width?: unknown }).width),
      height: toDim((pick as { height?: unknown }).height)
    };
  } catch {
    return null; // fail-open — keep the feed image (or none)
  }
}
