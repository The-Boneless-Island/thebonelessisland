const VERIFY_TIMEOUT_MS = 5000;
const MIN_IMAGE_BYTES = 800;

/** Lightweight reachability check — HEAD with GET fallback (some CDNs block HEAD). */
export async function verifyImageUrl(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return url.startsWith("/");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const head = await fetch(parsed.toString(), {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { accept: "image/*,*/*;q=0.8" }
    }).catch(() => null);

    if (head?.ok) {
      const len = parseInt(head.headers.get("content-length") ?? "0", 10);
      const type = head.headers.get("content-type") ?? "";
      if (type.startsWith("image/") || type.includes("octet-stream") || len >= MIN_IMAGE_BYTES) {
        return true;
      }
    }

    const get = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { accept: "image/*,*/*;q=0.8", range: "bytes=0-1023" }
    }).catch(() => null);

    if (!get?.ok) return false;
    const type = get.headers.get("content-type") ?? "";
    return type.startsWith("image/") || type.includes("octet-stream");
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
