import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { IslandButton, IslandCard, IslandEmptyState, IslandTag, islandInputStyle } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import type { CrewOwnedGame, GuildMember, PageId } from "../types.js";
import GameDetailDrawer from "../components/GameDetailDrawer.js";
import {
  PosterCard,
  PosterWall,
  categoryFor,
  hasGenericMultiplayerTag,
  type LibCategory
} from "../components/PosterCard.js";
import { formatCents } from "../gameModes.js";

type LibraryPageProps = {
  crewGames: CrewOwnedGame[];
  guildMembers: GuildMember[];
  currentDiscordUserId: string | null;
  onNavigate: (page: PageId) => void;
  onPlan: (appId: number) => void;
};

type LibFilter = "all" | "mine" | LibCategory;
type SortMode = "owned" | "title" | "tonight";

const LIB_FILTERS: LibFilter[] = ["all", "mine", "co-op", "horror", "puzzle", "party", "solo"];

function LibraryPageImpl({ crewGames, guildMembers, currentDiscordUserId, onNavigate, onPlan }: LibraryPageProps) {
  // Filter/sort/search live in the URL query string so refreshes and shared
  // links land on the same view (/library?f=co-op&s=title&q=…).
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [filter, setFilter] = useState<LibFilter>(() => {
    const f = searchParams.get("f") as LibFilter | null;
    return f && LIB_FILTERS.includes(f) ? f : "all";
  });
  const [sort, setSort] = useState<SortMode>(() => {
    const s = searchParams.get("s");
    return s === "title" || s === "tonight" ? s : "owned";
  });
  // The game-detail drawer is URL-driven (/library?game=<appId>) so activity-feed
  // rows and shared links can deep-link straight into a game.
  const openAppId = useMemo(() => {
    const g = Number(searchParams.get("game"));
    return Number.isInteger(g) && g > 0 ? g : null;
  }, [searchParams]);
  const setOpenAppId = useCallback(
    (id: number | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set("game", String(id));
          else next.delete("game");
          return next;
        },
        { replace: true, preventScrollReset: true }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    // Functional update preserves the `game` param so filtering doesn't close
    // an open drawer.
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (filter !== "all") params.set("f", filter);
        else params.delete("f");
        if (sort !== "owned") params.set("s", sort);
        else params.delete("s");
        if (search.trim()) params.set("q", search.trim());
        else params.delete("q");
        return params;
      },
      // replace + preventScrollReset: filtering shouldn't spam history or jump scroll.
      { replace: true, preventScrollReset: true }
    );
  }, [filter, sort, search, setSearchParams]);

  // Crew members reachable right now — online-ish presence or in voice.
  const onlineIds = useMemo(
    () =>
      new Set(
        guildMembers
          .filter(
            (m) =>
              m.inVoice ||
              m.presenceStatus === "online" ||
              m.presenceStatus === "idle" ||
              m.presenceStatus === "dnd"
          )
          .map((m) => m.discordUserId)
      ),
    [guildMembers]
  );

  const enriched = useMemo(
    () =>
      crewGames.map((game) => {
        const category = categoryFor(game);
        const mine = currentDiscordUserId
          ? game.owners.some((owner) => owner.discordUserId === currentDiscordUserId)
          : false;
        const onlineOwners = game.owners.filter((o) => onlineIds.has(o.discordUserId)).length;
        const coopCapable =
          game.isOnlineCoop || game.isLanCoop || game.isSharedSplitCoop || game.isMmo ||
          hasGenericMultiplayerTag(game);
        // "Tonight" rank: a session needs ≥2 reachable owners AND a way to
        // play together; score by how many of the crew could actually join.
        const tonightScore = coopCapable && onlineOwners >= 2 ? onlineOwners : 0;
        return { game, category, mine, onlineOwners, tonightScore };
      }),
    [crewGames, currentDiscordUserId, onlineIds]
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
    } else if (sort === "tonight") {
      out.sort(
        (a, b) =>
          b.tonightScore - a.tonightScore ||
          b.onlineOwners - a.onlineOwners ||
          b.game.ownerCount - a.game.ownerCount ||
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
          <option value="tonight">Playable tonight</option>
        </select>
        <span
          className="island-mono"
          style={{ fontSize: 12, color: islandTheme.color.textMuted, whiteSpace: "nowrap" }}
        >
          {visible.length} of {totalGames} game{totalGames === 1 ? "" : "s"}
          {filter === "mine" ? ` · ${mineCount} yours` : ""}
        </span>
      </IslandCard>

      {empty ? (
        <IslandCard>
          <IslandEmptyState
            pose="snooze"
            title="The shelf is bare"
            body="Crew library is empty so far. Sync a Steam account from Profile, then this shelf lights up."
            action={
              <IslandButton variant="primary" onClick={() => onNavigate("profile")}>
                Link Steam →
              </IslandButton>
            }
          />
        </IslandCard>
      ) : visible.length ? (
        <PosterWall>
          {visible.map((entry) => (
            <LibraryPoster
              key={entry.game.appId}
              game={entry.game}
              category={entry.category}
              mine={entry.mine}
              onlineOwners={entry.onlineOwners}
              onPlan={onPlan}
              onDetails={setOpenAppId}
            />
          ))}
        </PosterWall>
      ) : (
        <IslandCard>
          <IslandEmptyState compact pose="shrug" title="No games match your filter" />
        </IslandCard>
      )}

      <GameDetailDrawer appId={openAppId} onClose={() => setOpenAppId(null)} />
    </div>
  );
}

export const LibraryPage = memo(LibraryPageImpl);

function LibraryPoster({
  game,
  category,
  mine,
  onlineOwners,
  onPlan,
  onDetails
}: {
  game: CrewOwnedGame;
  category: LibCategory;
  mine: boolean;
  onlineOwners: number;
  onPlan: (appId: number) => void;
  onDetails: (appId: number) => void;
}) {
  const onSale = typeof game.priceDiscountPct === "number" && game.priceDiscountPct > 0;
  const priceLine = game.isFree
    ? "Free"
    : typeof game.priceFinalCents === "number"
      ? formatCents(game.priceFinalCents)
      : null;

  return (
    <PosterCard
      appId={game.appId}
      name={game.name}
      category={category}
      capabilities={game}
      owners={game.owners}
      onDetails={onDetails}
      caption={
        <>
          {game.ownerCount} own
          {onlineOwners >= 2 ? (
            <span style={{ color: islandTheme.color.successAccent }}> · {onlineOwners} online</span>
          ) : null}
          {priceLine ? ` · ${priceLine}` : ""}
        </>
      }
      badges={
        <>
          {mine ? <IslandTag tone="primary">★ MINE</IslandTag> : null}
          {game.releaseComingSoon ? <IslandTag color="#a78bfa">SOON</IslandTag> : null}
          {onSale ? <IslandTag tone="success">-{game.priceDiscountPct}%</IslandTag> : null}
        </>
      }
      action={
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPlan(game.appId);
          }}
          className="island-btn island-mono"
          style={{
            background: islandTheme.color.primary,
            border: `1px solid ${islandTheme.color.primary}`,
            color: islandTheme.color.primaryText,
            padding: "5px 12px",
            borderRadius: 999,
            fontSize: islandTheme.text.sm,
            fontWeight: 800,
            cursor: "pointer",
            font: "inherit",
            flexShrink: 0
          }}
        >
          PLAN
        </button>
      }
    />
  );
}
