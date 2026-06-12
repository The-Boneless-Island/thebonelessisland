// Server-side link unfurler for forum resource/recommendation threads.
//
// SECURITY: this fetches an arbitrary user-supplied URL, so it is an SSRF
// surface. Guards:
//   * http/https only.
//   * DNS-resolve the host and reject private/reserved IP ranges — re-checked
//     on every redirect hop (manual redirect handling, max 3 hops).
//   * 5s total timeout, read at most 512 KB, only parse text/html.
//   * Failures are cached as status='failed' and not retried more than once
//     per day per URL.

import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { db } from "../db/client.js";

const MAX_HOPS = 3;
const TIMEOUT_MS = 5000;
const MAX_BYTES = 512 * 1024;
const FAILED_RETRY_MS = 24 * 60 * 60 * 1000;

export type LinkPreview = {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
};

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = (n << 8) | o;
  }
  return n >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable → treat as blocked
  const inRange = (base: string, bits: number) => {
    const b = ipv4ToInt(base)!;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (b & mask);
  };
  return (
    inRange("0.0.0.0", 8) ||
    inRange("10.0.0.0", 8) ||
    inRange("100.64.0.0", 10) ||
    inRange("127.0.0.0", 8) ||
    inRange("169.254.0.0", 16) ||
    inRange("172.16.0.0", 12) ||
    inRange("192.0.0.0", 24) ||
    inRange("192.0.2.0", 24) ||
    inRange("192.168.0.0", 16) ||
    inRange("198.18.0.0", 15) ||
    inRange("198.51.100.0", 24) ||
    inRange("203.0.113.0", 24) ||
    inRange("224.0.0.0", 4) ||
    inRange("240.0.0.0", 4)
  );
}

function isBlockedIpv6(ip: string): boolean {
  const a = ip.toLowerCase();
  if (a === "::" || a === "::1") return true;
  // IPv4-mapped (::ffff:1.2.3.4) → validate the embedded v4.
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);
  // Unique-local fc00::/7 and link-local fe80::/10.
  if (/^f[cd]/.test(a)) return true;
  if (/^fe[89ab]/.test(a)) return true;
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isBlockedIpv4(ip);
  if (v === 6) return isBlockedIpv6(ip);
  return true;
}

/** Resolve a hostname and throw if it (or any resolved address) is private. */
async function assertHostResolvesPublic(hostname: string): Promise<void> {
  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new Error("blocked address");
    return;
  }
  const addrs = await dns.lookup(hostname, { all: true });
  if (addrs.length === 0) throw new Error("no address");
  for (const a of addrs) {
    if (isBlockedIp(a.address)) throw new Error("blocked address");
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ");
}

function metaContent(html: string, attr: "property" | "name", key: string): string | null {
  // Match <meta property="og:title" content="...">  in either attribute order.
  const re1 = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${key}["']`, "i");
  const m = html.match(re1) ?? html.match(re2);
  return m ? decodeEntities(m[1]).trim() || null : null;
}

function parsePreview(finalUrl: string, html: string): LinkPreview {
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title =
    metaContent(html, "property", "og:title") ??
    (titleTag ? decodeEntities(titleTag[1]).trim() : null);
  const description =
    metaContent(html, "property", "og:description") ?? metaContent(html, "name", "description");
  const imageUrl = metaContent(html, "property", "og:image");
  const siteName = metaContent(html, "property", "og:site_name") ?? new URL(finalUrl).hostname;
  return {
    url: finalUrl,
    title: title ? title.slice(0, 300) : null,
    description: description ? description.slice(0, 500) : null,
    imageUrl: imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl.slice(0, 1000) : null,
    siteName: siteName ? siteName.slice(0, 120) : null
  };
}

/** Fetch + parse with manual redirect validation. Throws on any failure. */
async function fetchPreview(rawUrl: string): Promise<LinkPreview> {
  let current = rawUrl;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      const u = new URL(current);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad scheme");
      await assertHostResolvesPublic(u.hostname);

      const res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "BonelessIsland-LinkPreview/1.0", accept: "text/html" }
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) throw new Error("redirect without location");
        current = new URL(loc, current).toString();
        continue;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);

      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("text/html")) throw new Error("not html");

      // Read at most MAX_BYTES.
      const reader = res.body?.getReader();
      if (!reader) throw new Error("no body");
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          total += value.length;
          if (total >= MAX_BYTES) {
            void reader.cancel();
            break;
          }
        }
      }
      const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).subarray(0, MAX_BYTES).toString("utf8");
      return parsePreview(current, html);
    }
    throw new Error("too many redirects");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Public entry. Returns a cached or freshly-fetched preview, or null.
 * Never throws. Persists 'ok'/'failed' rows in forum_link_previews.
 */
export async function getOrFetchLinkPreview(rawUrl: string): Promise<LinkPreview | null> {
  let normalized: string;
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    normalized = u.toString();
  } catch {
    return null;
  }

  const cached = await db.query<{
    title: string | null; description: string | null; image_url: string | null;
    site_name: string | null; status: string; fetched_at: string;
  }>(
    "SELECT title, description, image_url, site_name, status, fetched_at FROM forum_link_previews WHERE url = $1",
    [normalized]
  ).catch(() => null);

  const row = cached?.rows[0];
  if (row) {
    if (row.status === "ok") {
      return { url: normalized, title: row.title, description: row.description, imageUrl: row.image_url, siteName: row.site_name };
    }
    // failed: don't retry within the cooldown
    if (Date.now() - new Date(row.fetched_at).getTime() < FAILED_RETRY_MS) return null;
  }

  try {
    const preview = await fetchPreview(normalized);
    await db.query(
      `INSERT INTO forum_link_previews (url, title, description, image_url, site_name, status, fetched_at)
       VALUES ($1, $2, $3, $4, $5, 'ok', NOW())
       ON CONFLICT (url) DO UPDATE SET
         title = EXCLUDED.title, description = EXCLUDED.description,
         image_url = EXCLUDED.image_url, site_name = EXCLUDED.site_name,
         status = 'ok', fetched_at = NOW()`,
      [normalized, preview.title, preview.description, preview.imageUrl, preview.siteName]
    );
    return preview;
  } catch {
    await db.query(
      `INSERT INTO forum_link_previews (url, status, fetched_at)
       VALUES ($1, 'failed', NOW())
       ON CONFLICT (url) DO UPDATE SET status = 'failed', fetched_at = NOW()`,
      [normalized]
    ).catch(() => undefined);
    return null;
  }
}
