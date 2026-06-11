import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { IslandCard, IslandTag, islandInputStyle } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import type { CrewOwnedGame, CrewOwner, PageId } from "../types.js";
import GameDetailDrawer from "../components/GameDetailDrawer.js";
import { coverUrl } from "../steamArt.js";
import { formatCents } from "../gameModes.js";

type LibraryPageProps = {
  crewGames: CrewOwnedGame[];
  currentDiscordUserId: string | null;
  onNavigate: (page: PageId) => void;
  onPlan: (appId: number) => void;
};

type LibCategory = "co-op" | "horror" | "puzzle" | "party" | "solo";
type LibFilter = "all" | "mine" | LibCategory;
type SortMode = "owned" | "title";

const CATEGORY_TAG_HINTS: Array<{ category: LibCategory; tokens: string[] }> = [
  { category: "co-op", tokens: ["co-op", "coop", "co op", "online co-op", "multiplayer"] },
  { category: "horror", tokens: ["horror"] },
  { category: "puzzle", tokens: ["puzzle"] },
  { category: "party", tokens: ["party"] }
];

function categoryFor(game: CrewOwnedGame): LibCategory {
  const haystack = [...game.tags, ...game.developers].map((value) => value.toLowerCase());
  for (const hint of CATEGORY_TAG_HINTS) {
    if (haystack.some((tag) => hint.tokens.some((token) => tag.includes(token)))) {
      return hint.category;
    }
  }
  return "solo";
}

function pickArtFor(category: LibCategory): string {
  switch (category) {
    case "co-op":
      return "🎯";
    case "horror":
      return "👻";
    case "puzzle":
      return "🧩";
    case "party":
      return "🎉";
    default:
      return "🎮";
  }
}

function pickCoverFor(category: LibCategory): string {
  switch (category) {
    case "co-op":
      return "linear-gradient(135deg,#1e3a8a,#0c4a6e)";
    case "horror":
      return "linear-gradient(135deg,#0f172a,#020617)";
    case "puzzle":
      return "linear-gradient(135deg,#365314,#1a2e05)";
    case "party":
      return "linear-gradient(135deg,#7c2d12,#1c1917)";
    default:
      return "linear-gradient(135deg,#312e81,#1e1b4b)";
  }
}

function ownerColor(seed: string): string {
  const palette = islandTheme.categorical.avatars;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function ownerInitials(name: string): string {
  return (name || "??").trim().slice(0, 2).toUpperCase();
}

const GENERIC_MULTIPLAYER_TOKENS = ["multi-player", "multiplayer", "co-op", "coop", "co op"];

function hasGenericMultiplayerTag(game: CrewOwnedGame): boolean {
  return game.tags.some((tag) => {
    const lower = tag.toLowerCase();
    return GENERIC_MULTIPLAYER_TOKENS.some((token) => lower.includes(token));
  });
}

function capabilityPills(game: CrewOwnedGame): string[] {
  const pills: string[] = [];
  if (game.isSinglePlayer) pills.push("Single-player");
  if (game.isOnlineCoop) pills.push("Online co-op");
  if (game.isLanCoop) pills.push("LAN co-op");
  if (game.isSharedSplitCoop) pills.push("Split-screen");
  if (game.isOnlinePvp) pills.push("PvP");
  if (game.isMmo) pills.push("MMO");

  const hasSpecificMultiplayer =
    game.isOnlineCoop || game.isLanCoop || game.isSharedSplitCoop || game.isOnlinePvp || game.isMmo;
  if (!hasSpecificMultiplayer && hasGenericMultiplayerTag(game)) {
    pills.push("Multiplayer");
  }

  if (typeof game.mpMaxPlayersApprox === "number" && game.mpMaxPlayersApprox > 1) {
    pills.push(`Up to ${game.mpMaxPlayersApprox}`);
  }
  return pills;
}

function tagLabel(game: CrewOwnedGame, category: LibCategory): string {
  const firstTag = game.tags.find((tag) => tag.trim().length > 0);
  if (firstTag) return firstTag.toLowerCase();
  switch (category) {
    case "co-op":
      return "co-op";
    case "horror":
      return "horror co-op";
    case "puzzle":
      return "puzzle";
    case "party":
      return "party";
    default:
      return "solo";
  }
}

const LIB_HASH_PREFIX = "#/library";

function readLibHashParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  const hash = window.location.hash;
  if (!hash.startsWith(LIB_HASH_PREFIX)) return new URLSearchParams();
  const qIndex = hash.indexOf("?");
  return new URLSearchParams(qIndex >= 0 ? hash.slice(qIndex + 1) : "");
}

const LIB_FILTERS: LibFilter[] = ["all", "mine", "co-op", "horror", "puzzle", "party", "solo"];

function LibraryPageImpl({ crewGames, currentDiscordUserId, onNavigate, onPlan }: LibraryPageProps) {
  // Filter/sort/search live in the URL hash so refreshes and shared links
  // land on the same view (#/library?f=co-op&s=title&q=…).
  const initialParams = readLibHashParams();
  const [search, setSearch] = useState(() => initialParams.get("q") ?? "");
  const [filter, setFilter] = useState<LibFilter>(() => {
    const f = initialParams.get("f") as LibFilter | null;
    return f && LIB_FILTERS.includes(f) ? f : "all";
  });
  const [sort, setSort] = useState<SortMode>(() => (initialParams.get("s") === "title" ? "title" : "owned"));
  const [openAppId, setOpenAppId] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("f", filter);
    if (sort !== "owned") params.set("s", sort);
    if (search.trim()) params.set("q", search.trim());
    const qs = params.toString();
    window.history.replaceState(null, "", `${LIB_HASH_PREFIX}${qs ? `?${qs}` : ""}`);
  }, [filter, sort, search]);

  // Leaving the library: drop the hash so refreshing elsewhere doesn't bounce back here.
  useEffect(() => () => {
    if (window.location.hash.startsWith(LIB_HASH_PREFIX)) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  const enriched = useMemo(
    () =>
      crewGames.map((game) => {
        const category = categoryFor(game);
        const mine = currentDiscordUserId
          ? game.owners.some((owner) => owner.discordUserId === currentDiscordUserId)
          : false;
        return { game, category, mine };
      }),
    [crewGames, currentDiscordUserId]
  );

  const mineCount = useMemo(() => enriched.filter((entry) => entry.mine).length, [enriched]);

  const filters: Array<{ id: LibFilter; label: string; count?: number }> = [
    { id: "all", label: "ALL", count: enriched.length },
    { id: "mine", label: "MINE", count: mineCount },
    { id: "co-op", label: "CO-OP" },
    { id: "horror", label: "HORROR" },
    { id: "puzzle", label: "PUZZLE" },
    { id: "party", label: "PARTY" },
    { id: "solo", label: "SOLO" }
  ];

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    let out = enriched.slice();
    if (filter === "mine") out = out.filter((entry) => entry.mine);
    else if (filter !== "all") out = out.filter((entry) => entry.category === filter);
    if (query) {
      out = out.filter(
        (entry) =>
          entry.game.name.toLowerCase().includes(query) ||
          entry.game.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }
    if (sort === "owned") {
      out.sort((a, b) => b.game.ownerCount - a.game.ownerCount || a.game.name.localeCompare(b.game.name));
    } else if (sort === "title") {
      out.sort((a, b) => a.game.name.localeCompare(b.game.name));
    }
    return out;
  }, [enriched, search, filter, sort]);

  const totalGames = crewGames.length;
  const empty = totalGames === 0;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          className="island-mono"
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: islandTheme.color.textMuted
          }}
        >
          ★ Games · Library
        </span>
        <h1 className="island-display" style={{ margin: 0, fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 800 }}>
          Steam library
        </h1>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: islandTheme.color.textSubtle, maxWidth: 640 }}>
          {empty
            ? "No crew Steam libraries synced yet. Link your Steam account from Profile to populate the shore."
            : `All ${totalGames} games shared across the crew. Filter, search, jump straight into planning a session.`}
        </p>
        <button
          type="button"
          className="island-btn"
          onClick={() => onNavigate("games")}
          style={{
            marginTop: 6,
            alignSelf: "flex-start",
            background: "transparent",
            border: "none",
            color: islandTheme.color.primaryGlow,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            padding: 0,
            font: "inherit"
          }}
        >
          ← Back to Games
        </button>
      </header>

      <IslandCard style={{ padding: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${totalGames || 0} games…`}
          style={{
            ...islandInputStyle,
            flex: "1 1 280px",
            minWidth: 280,
            fontFamily: islandTheme.font.mono,
            fontSize: 12
          }}
        />
        {filters.map((f) => (
          <IslandTag
            key={f.id}
            tone="primary"
            active={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            {typeof f.count === "number" ? ` · ${f.count}` : ""}
          </IslandTag>
        ))}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          aria-label="Sort library"
          style={{ ...islandInputStyle, fontSize: 12 }}
        >
          <option value="owned">Most owned</option>
          <option value="title">Alphabetical</option>
        </select>
        <span
          className="island-mono"
          style={{ fontSize: 12, color: islandTheme.color.textMuted, whiteSpace: "nowrap" }}
        >
          {visible.length} of {totalGames} game{totalGames === 1 ? "" : "s"}
          {filter === "mine" ? ` · ${mineCount} yours` : ""}
        </span>
      </IslandCard>

      <IslandCard style={{ padding: 0, overflow: "hidden" }}>
        <HeaderRow />
        {empty ? (
          <div style={{ padding: 22, fontSize: 13, color: islandTheme.color.textMuted, textAlign: "center" }}>
            Crew library is empty so far. Sync a Steam account from Profile, then this list lights up.
          </div>
        ) : visible.length ? (
          visible.map((entry) => (
            <LibRow
              key={entry.game.appId}
              game={entry.game}
              category={entry.category}
              mine={entry.mine}
              onPlan={onPlan}
              onDetails={setOpenAppId}
            />
          ))
        ) : (
          <div style={{ padding: 22, fontSize: 13, color: islandTheme.color.textMuted, textAlign: "center" }}>
            No games match your filter.
          </div>
        )}
      </IslandCard>

      <GameDetailDrawer appId={openAppId} onClose={() => setOpenAppId(null)} />
    </div>
  );
}

export const LibraryPage = memo(LibraryPageImpl);

const COLUMNS = "60px 1.4fr 1fr 80px minmax(140px, 1.1fr) auto";

function HeaderRow() {
  return (
    <div
      className="island-mono bi-lib-head"
      style={{
        display: "grid",
        gridTemplateColumns: COLUMNS,
        gap: 14,
        padding: "10px 16px",
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: islandTheme.color.textMuted,
        borderBottom: `1px solid ${islandTheme.color.cardBorder}`,
        background: islandTheme.color.panelMutedBg
      }}
    >
      <Cell />
      <Cell>Title</Cell>
      <Cell>Owners</Cell>
      <Cell>Count</Cell>
      <Cell>Modes</Cell>
      <Cell />
    </div>
  );
}

function Cell({ children }: { children?: ReactNode }) {
  return <div>{children}</div>;
}

function LibRow({
  game,
  category,
  mine,
  onPlan,
  onDetails
}: {
  game: CrewOwnedGame;
  category: LibCategory;
  mine: boolean;
  onPlan: (appId: number) => void;
  onDetails: (appId: number) => void;
}) {
  const coverSrc = coverUrl(game.appId, game.headerImageUrl);
  const cover = coverSrc
    ? { backgroundImage: `url("${coverSrc}")`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: pickCoverFor(category) };
  const art = coverSrc ? "" : pickArtFor(category);
  const onSale = typeof game.priceDiscountPct === "number" && game.priceDiscountPct > 0;

  return (
    <div
      className="bi-lib-row"
      style={{
        display: "grid",
        gridTemplateColumns: COLUMNS,
        gap: 14,
        padding: "12px 16px",
        alignItems: "center",
        borderBottom: `1px solid ${islandTheme.color.cardBorder}`
      }}
    >
      <div
        style={{
          width: 60,
          height: 48,
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          color: islandTheme.color.textInverted,
          ...cover
        }}
      >
        {art}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          {game.name}
          {mine ? <IslandTag tone="primary" style={{ marginLeft: 6 }}>★ MINE</IslandTag> : null}
          {game.releaseComingSoon ? (
            <IslandTag color="#a78bfa" style={{ marginLeft: 6 }}>SOON</IslandTag>
          ) : null}
          {onSale ? (
            <IslandTag tone="success" style={{ marginLeft: 6 }}>-{game.priceDiscountPct}%</IslandTag>
          ) : null}
        </div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>
          {tagLabel(game, category)}
          {game.releaseDateText ? (
            <span style={{ color: islandTheme.color.textMuted }}> · {game.releaseDateText}</span>
          ) : null}
          {!game.isFree && typeof game.priceFinalCents === "number" ? (
            <span style={{ color: islandTheme.color.textSubtle }}> · {formatCents(game.priceFinalCents)}</span>
          ) : null}
          {game.isFree ? <span style={{ color: islandTheme.color.primaryGlow }}> · Free</span> : null}
        </div>
      </div>
      <OwnerStack owners={game.owners} />
      <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
        {game.ownerCount} own
      </span>
      <CapabilityPills game={game} />
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={() => onPlan(game.appId)}
          className="island-btn island-mono"
          style={{
            background: islandTheme.color.primary,
            border: `1px solid ${islandTheme.color.primary}`,
            color: islandTheme.color.primaryText,
            padding: "5px 10px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
            font: "inherit"
          }}
        >
          PLAN
        </button>
        <button
          type="button"
          onClick={() => onDetails(game.appId)}
          className="island-btn island-mono"
          style={{
            background: "transparent",
            border: `1px solid ${islandTheme.color.cardBorder}`,
            color: islandTheme.color.textSubtle,
            padding: "5px 10px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            font: "inherit"
          }}
        >
          DETAILS
        </button>
      </div>
    </div>
  );
}

function CapabilityPills({ game }: { game: CrewOwnedGame }) {
  const pills = capabilityPills(game);
  if (pills.length === 0) {
    return (
      <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
        —
      </span>
    );
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {pills.map((pill) => (
        <span
          key={pill}
          className="island-mono"
          style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            padding: "2px 6px",
            borderRadius: 999,
            border: `1px solid ${islandTheme.color.cardBorder}`,
            color: islandTheme.color.textSubtle,
            background: islandTheme.color.panelMutedBg,
            whiteSpace: "nowrap"
          }}
        >
          {pill}
        </span>
      ))}
    </div>
  );
}

function OwnerStack({ owners }: { owners: CrewOwner[] }) {
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
        background: ownerColor(owner.discordUserId || owner.displayName),
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        color: islandTheme.color.textDark,
        fontSize: 12
      }}
    >
      {ownerInitials(owner.displayName)}
    </span>
  );
}
