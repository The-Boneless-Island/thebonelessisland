import { useMemo, useState, type ReactNode } from "react";
import { IslandCard, IslandTag, islandInputStyle } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import type { CrewOwnedGame, CrewOwner, PageId } from "../types.js";

type LibraryPageProps = {
  crewGames: CrewOwnedGame[];
  currentDiscordUserId: string | null;
  onNavigate: (page: PageId) => void;
};

type LibCategory = "co-op" | "horror" | "puzzle" | "party" | "solo";
type LibFilter = "all" | "mine" | LibCategory;
type SortMode = "owned" | "title" | "session";

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
  const palette = ["#fbbf77", "#22d3ee", "#a855f7", "#4ade80", "#ef8354", "#86efac", "#facc15", "#f472b6"];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function ownerInitials(name: string): string {
  return (name || "??").trim().slice(0, 2).toUpperCase();
}

function playerCountLabel(maxPlayers: number): string {
  if (maxPlayers <= 1) return "1p";
  if (maxPlayers >= 8) return "8p+";
  return `1-${maxPlayers}p`;
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

export function LibraryPage({ crewGames, currentDiscordUserId, onNavigate }: LibraryPageProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LibFilter>("all");
  const [sort, setSort] = useState<SortMode>("owned");

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
    } else if (sort === "session") {
      out.sort(
        (a, b) =>
          (a.game.medianSessionMinutes || 0) - (b.game.medianSessionMinutes || 0) ||
          a.game.name.localeCompare(b.game.name)
      );
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
            fontSize: 11,
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
          style={{ ...islandInputStyle, fontSize: 12 }}
        >
          <option value="owned">Most owned</option>
          <option value="title">Alphabetical</option>
          <option value="session">Shortest session</option>
        </select>
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
              onPlan={() => onNavigate("games")}
            />
          ))
        ) : (
          <div style={{ padding: 22, fontSize: 13, color: islandTheme.color.textMuted, textAlign: "center" }}>
            No games match your filter.
          </div>
        )}
      </IslandCard>
    </div>
  );
}

const COLUMNS = "60px 1.4fr 1fr 80px 80px auto";

function HeaderRow() {
  return (
    <div
      className="island-mono"
      style={{
        display: "grid",
        gridTemplateColumns: COLUMNS,
        gap: 14,
        padding: "10px 16px",
        fontSize: 10,
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
      <Cell>Players</Cell>
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
  onPlan
}: {
  game: CrewOwnedGame;
  category: LibCategory;
  mine: boolean;
  onPlan: () => void;
}) {
  const cover = game.headerImageUrl
    ? { backgroundImage: `url("${game.headerImageUrl}")`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: pickCoverFor(category) };
  const art = game.headerImageUrl ? "" : pickArtFor(category);

  return (
    <div
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
        </div>
        <div style={{ fontSize: 11, color: islandTheme.color.textMuted, marginTop: 2 }}>
          {tagLabel(game, category)}
        </div>
      </div>
      <OwnerStack owners={game.owners} />
      <span className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted }}>
        {game.ownerCount} own
      </span>
      <span className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted }}>
        {playerCountLabel(game.maxPlayers)}
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={onPlan}
          className="island-btn island-mono"
          style={{
            background: islandTheme.color.primary,
            border: `1px solid ${islandTheme.color.primary}`,
            color: islandTheme.color.primaryText,
            padding: "5px 10px",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 800,
            cursor: "pointer",
            font: "inherit"
          }}
        >
          PLAN
        </button>
        <button
          type="button"
          className="island-btn island-mono"
          style={{
            background: "transparent",
            border: `1px solid ${islandTheme.color.cardBorder}`,
            color: islandTheme.color.textSubtle,
            padding: "5px 10px",
            borderRadius: 999,
            fontSize: 10,
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
            fontSize: 10,
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
        fontSize: 9
      }}
    >
      {ownerInitials(owner.displayName)}
    </span>
  );
}
