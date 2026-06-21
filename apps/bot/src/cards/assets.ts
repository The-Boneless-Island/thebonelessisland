// Image loading for cards. Remote images (coin art on the web origin, Discord
// avatars) are fetched and decoded into canvas Images. Coins are cached (small,
// fixed set); avatars are not (per-user, change over time).

import { loadImage, type Image } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";

const cache = new Map<string, Promise<Image>>();

async function load(src: string): Promise<Image> {
  if (/^https?:/i.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`asset fetch ${res.status} for ${src}`);
    return loadImage(Buffer.from(await res.arrayBuffer()));
  }
  return loadImage(await readFile(src));
}

export function loadImageCached(src: string, cacheIt = true): Promise<Image> {
  if (!cacheIt) return load(src);
  let p = cache.get(src);
  if (!p) {
    p = load(src).catch((err) => {
      cache.delete(src); // don't pin a failed fetch forever
      throw err;
    });
    cache.set(src, p);
  }
  return p;
}
