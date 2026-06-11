import React, { useState } from "react";

// Steam serves several art formats derivable from the appid alone — no API call,
// no DB column. Not every app has every asset (older titles often lack
// library_600x900 / logo / hero), so anything rendered from these MUST carry a
// fallback chain ending in a local placeholder.
const CDN = "https://steamcdn-a.akamaihd.net/steam/apps";

export const steamArt = {
  /** 460x215 store header — the most reliably-present asset. */
  header: (appId: number) => `${CDN}/${appId}/header.jpg`,
  /** 616x353 wide capsule — good for featured / hero-ish cards. */
  capsule: (appId: number) => `${CDN}/${appId}/capsule_616x368.jpg`,
  /** 600x900 tall library capsule — grid / poster layouts. */
  libraryTall: (appId: number) => `${CDN}/${appId}/library_600x900.jpg`,
  /** Wide cinematic library hero — drawer backdrops. */
  hero: (appId: number) => `${CDN}/${appId}/library_hero.jpg`,
  /** Transparent title logo — overlay on hero/capsule. */
  logo: (appId: number) => `${CDN}/${appId}/logo.png`
};

/**
 * Best available cover URL: prefer the DB-stored image, else the derivable
 * Steam header. Returns null only when there's neither a stored URL nor an
 * appId (caller renders its own placeholder).
 */
export function coverUrl(
  appId: number | null | undefined,
  storedUrl: string | null | undefined
): string | null {
  if (storedUrl) return storedUrl;
  if (appId && appId > 0) return steamArt.header(appId);
  return null;
}

type GameCoverProps = {
  appId: number | null | undefined;
  storedUrl?: string | null;
  /** Which derivable format to try first when there's no stored URL. */
  variant?: "header" | "capsule" | "libraryTall" | "hero";
  alt: string;
  style?: React.CSSProperties;
  className?: string;
};

/**
 * <img> that walks a fallback chain on error: requested variant → header →
 * placeholder mascot art. Use where you want real 404 handling (derivable CDN
 * URLs can miss); for null-only fallback a CSS background with coverUrl() is
 * lighter.
 */
export function GameCover({
  appId,
  storedUrl,
  variant = "header",
  alt,
  style,
  className
}: GameCoverProps) {
  const chain: string[] = [];
  if (storedUrl) chain.push(storedUrl);
  if (appId && appId > 0) {
    chain.push(steamArt[variant](appId));
    if (variant !== "header") chain.push(steamArt.header(appId));
  }
  const [idx, setIdx] = useState(0);

  if (chain.length === 0 || idx >= chain.length) {
    return (
      <div
        className={className}
        style={{
          display: "grid",
          placeItems: "center",
          fontSize: 28,
          background: "rgba(255,255,255,0.04)",
          ...style
        }}
        aria-label={alt}
        role="img"
      >
        🎮
      </div>
    );
  }

  return (
    <img
      className={className}
      src={chain[idx]}
      alt={alt}
      loading="lazy"
      onError={() => setIdx((i) => i + 1)}
      style={{ objectFit: "cover", ...style }}
    />
  );
}
