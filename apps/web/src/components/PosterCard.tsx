// Shared poster-wall game card. Used by the Steam library and the group
// wishlist so both render the identical tall-capsule poster treatment.

import type { ReactNode } from "react";
import { IslandTag, SpecStrip, memberColor, type SpecItem } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import { GameCover } from "../steamArt.js";
import type { CrewOwner } from "../types.js";

export type LibCategory = "co-op" | "horror" | "puzzle" | "party" | "solo";

const CATEGORY_TAG_HINTS: Array<{ category: LibCategory; tokens: string[] }> = [
  { category: "co-op", tokens: ["co-op", "coop", "co op", "online co-op", "multiplayer"] },
  { category: "horror", tokens: ["horror"] },
  { category: "puzzle", tokens: ["puzzle"] },
  { category: "party", tokens: ["party"] }
];

export function categoryFor(game: { tags: string[]; developers: string[] }): LibCategory {
  const haystack = [...game.tags, ...game.developers].map((value) => value.toLowerCase());
  for (const hint of CATEGORY_TAG_HINTS) {
    if (haystack.some((tag) => hint.tokens.some((token) => tag.includes(token)))) {
      return hint.category;
    }
  }
  return "solo";
}

// Shelf-edge accent per category (theme-static identity colors, like avatars).
const CATEGORY_ACCENTS: Record<LibCategory, string> = {
  "co-op": "#60a5fa",
  horror: "#a855f7",
  puzzle: "#4ade80",
  party: "#fbbf77",
  solo: "#94a3b8"
};

const GENERIC_MULTIPLAYER_TOKENS = ["multi-player", "multiplayer", "co-op", "coop", "co op"];

export function hasGenericMultiplayerTag(game: { tags: string[] }): boolean {
  return game.tags.some((tag) => {
    const lower = tag.toLowerCase();
    return GENERIC_MULTIPLAYER_TOKENS.some((token) => lower.includes(token));
  });
}

/** Capability flags shared by owned + wishlisted crew games. */
export type GameCapabilities = {
  isSinglePlayer: boolean;
  isOnlineCoop: boolean;
  isLanCoop: boolean;
  isSharedSplitCoop: boolean;
  isOnlinePvp: boolean;
  isMmo: boolean;
  mpMaxPlayersApprox: number | null;
  tags: string[];
};

function capabilitySpecItems(game: GameCapabilities): SpecItem[] {
  const items: SpecItem[] = [];
  if (game.isSinglePlayer) items.push({ icon: "single", label: "Single-player", color: "#2dd4bf" });
  if (game.isOnlineCoop) items.push({ icon: "coop", label: "Online co-op", color: "#a3e635" });
  if (game.isLanCoop) items.push({ icon: "coop", label: "LAN co-op", color: "#a3e635" });
  if (game.isSharedSplitCoop) items.push({ icon: "split", label: "Split-screen", color: "#ffd166" });
  if (game.isOnlinePvp) items.push({ icon: "pvp", label: "PvP", color: "#ff7a59" });
  if (game.isMmo) items.push({ icon: "players", label: "MMO", color: "#f472b6" });

  const hasSpecificMultiplayer =
    game.isOnlineCoop || game.isLanCoop || game.isSharedSplitCoop || game.isOnlinePvp || game.isMmo;
  if (!hasSpecificMultiplayer && hasGenericMultiplayerTag(game)) {
    items.push({ icon: "players", label: "Multiplayer", color: "#a78bfa" });
  }

  if (typeof game.mpMaxPlayersApprox === "number" && game.mpMaxPlayersApprox > 1) {
    items.push({ icon: "players", label: `Up to ${game.mpMaxPlayersApprox}`, color: "#a78bfa" });
  }
  return items;
}

const POSTER_WALL_CSS = `
  .bi-poster-wall {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: ${islandTheme.space[4]}px;
  }
  @media (max-width: 540px) {
    .bi-poster-wall {
      grid-template-columns: repeat(auto-fill, minmax(124px, 1fr));
      gap: ${islandTheme.space[3]}px;
    }
  }
  .bi-poster {
    position: relative;
    border-radius: ${islandTheme.radius.card}px;
    overflow: hidden;
    background: ${islandTheme.gradient.gameArtFallback};
    box-shadow: ${islandTheme.shadow.cardIdle};
    transition: transform ${islandTheme.motion.dur.fast} ${islandTheme.motion.ease.out},
                box-shadow ${islandTheme.motion.dur.fast} ${islandTheme.motion.ease.out};
  }
  .bi-poster:hover, .bi-poster:focus-within {
    transform: translateY(-3px);
    box-shadow: ${islandTheme.shadow.cardHover};
  }
  @media (prefers-reduced-motion: reduce) {
    .bi-poster, .bi-poster:hover, .bi-poster:focus-within { transform: none; }
  }
  .bi-poster-overlay {
    opacity: 0;
    pointer-events: none;
    transition: opacity ${islandTheme.motion.dur.fast} ease;
  }
  .bi-poster:hover .bi-poster-overlay, .bi-poster:focus-within .bi-poster-overlay {
    opacity: 1;
    pointer-events: auto;
  }
  @media (hover: none) {
    .bi-poster-overlay {
      opacity: 1;
      pointer-events: auto;
      background: linear-gradient(180deg, transparent 40%, rgba(2, 6, 23, 0.82) 100%);
    }
  }
`;

/** Responsive poster grid + its shared CSS. Wrap PosterCard children in this. */
export function PosterWall({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="bi-poster-wall">{children}</div>
      <style>{POSTER_WALL_CSS}</style>
    </>
  );
}

type PosterCardProps = {
  appId: number;
  name: string;
  category: LibCategory;
  capabilities: GameCapabilities;
  owners: CrewOwner[];
  /** Caption strip below the title (e.g. "5 own · 2 online" or "3 want"). */
  caption: ReactNode;
  /** Top-corner badges (MINE / SOON / sale). */
  badges?: ReactNode;
  /** Action shown in the hover overlay (e.g. a PLAN button). */
  action?: ReactNode;
  /** Opens the detail drawer on click. Omit to render a non-interactive cover. */
  onDetails?: (appId: number) => void;
};

export function PosterCard({
  appId,
  name,
  category,
  capabilities,
  owners,
  caption,
  badges,
  action,
  onDetails
}: PosterCardProps) {
  const accent = CATEGORY_ACCENTS[category];

  // No storedUrl: it's wide 460x215 header art that would preempt the tall
  // capsule and crop badly. Chain = libraryTall → header → 🎮.
  const cover = (
    <GameCover
      appId={appId}
      variant="libraryTall"
      alt={name}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
  );

  return (
    <div className="bi-poster" style={{ borderBottom: `3px solid ${accent}` }}>
      {/* Whole poster opens the detail drawer; the action floats in the hover overlay. */}
      {onDetails ? (
        <button
          type="button"
          onClick={() => onDetails(appId)}
          aria-label={`${name} — details`}
          style={{
            display: "block",
            width: "100%",
            aspectRatio: "2 / 3",
            padding: 0,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            font: "inherit"
          }}
        >
          {cover}
        </button>
      ) : (
        <div style={{ width: "100%", aspectRatio: "2 / 3" }}>{cover}</div>
      )}

      {/* Always-on caption strip: makes art-less games legible + search results scannable. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: `${islandTheme.space[5]}px ${islandTheme.space[2]}px ${islandTheme.space[2]}px`,
          background: "linear-gradient(180deg, transparent, rgba(2,6,23,0.88))",
          pointerEvents: "none"
        }}
      >
        <div
          style={{
            fontSize: islandTheme.text.base,
            fontWeight: 700,
            color: "#f8fafc",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textShadow: "0 1px 3px rgba(0,0,0,0.6)"
          }}
        >
          {name}
        </div>
        <div className="island-mono" style={{ fontSize: islandTheme.text.sm, color: "#cbd5e1", marginTop: 1 }}>
          {caption}
        </div>
      </div>

      {/* Corner badges */}
      {badges ? (
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 6,
            right: 6,
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            pointerEvents: "none"
          }}
        >
          {badges}
        </div>
      ) : null}

      {/* Hover/focus overlay: modes + owners + action */}
      <div
        className="bi-poster-overlay"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: islandTheme.space[2],
          padding: islandTheme.space[3],
          paddingBottom: 54,
          background: "linear-gradient(180deg, rgba(2,6,23,0.25), rgba(2,6,23,0.78) 70%)"
        }}
      >
        <CapabilityPills game={capabilities} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: islandTheme.space[2] }}>
          <OwnerStack owners={owners} />
          {action}
        </div>
      </div>
    </div>
  );
}

function CapabilityPills({ game }: { game: GameCapabilities }) {
  const items = capabilitySpecItems(game);
  if (items.length === 0) {
    return (
      <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
        —
      </span>
    );
  }
  return <SpecStrip items={items} style={{ flexWrap: "wrap" }} />;
}

export function OwnerStack({ owners }: { owners: CrewOwner[] }) {
  return (
    <div style={{ display: "inline-flex", paddingLeft: 6 }}>
      {owners.slice(0, 5).map((owner) => (
        <OwnerBadge key={owner.discordUserId} owner={owner} />
      ))}
      {owners.length > 5 ? (
        <span
          className="island-mono"
          style={{
            marginLeft: 4,
            fontSize: 12,
            color: islandTheme.color.textMuted,
            alignSelf: "center"
          }}
        >
          +{owners.length - 5}
        </span>
      ) : null}
    </div>
  );
}

function OwnerBadge({ owner }: { owner: CrewOwner }) {
  const ringStyle: React.CSSProperties = {
    width: 22,
    height: 22,
    borderRadius: 999,
    border: `2px solid ${islandTheme.color.panelMutedBg}`,
    marginLeft: -6
  };
  if (owner.avatarUrl) {
    return (
      <img
        src={owner.avatarUrl}
        alt={owner.displayName}
        title={owner.displayName}
        style={{ ...ringStyle, objectFit: "cover" }}
      />
    );
  }
  return (
    <span
      title={owner.displayName}
      style={{
        ...ringStyle,
        background: memberColor(owner.discordUserId || owner.displayName),
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        color: islandTheme.color.textDark,
        fontSize: 12
      }}
    >
      {ownerInitials(owner.displayName)}
    </span>
  );
}

function ownerInitials(name: string): string {
  return (name || "??").trim().slice(0, 2).toUpperCase();
}
