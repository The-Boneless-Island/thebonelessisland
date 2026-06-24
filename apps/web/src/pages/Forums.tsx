import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { apiFetch } from "../api/client.js";
import { putClientState } from "../api/clientState.js";
import { IslandButton, IslandCard, IslandEmptyState, islandInputStyle } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import type {
  CrewOwnedGame,
  ForumCategory,
  ForumFeedSort,
  ForumFeedThread,
  ForumResourceItem,
  ForumSearchResult,
  ForumStats,
  ForumThreadListItem,
  ForumThreadType,
  MeProfile
} from "../types.js";
import {
  chipStyle,
  domainOf,
  FEED_PAGE_SIZE,
  formatRelative,
  forumPath,
  listRowStyle,
  parseForumView,
  POST_TYPES,
  renderSnippet,
  type ForumView,
  typePill
} from "./forums/forumShared.js";
import {
  BackLink,
  FeedLinkLine,
  GameChip,
  LockGlyph,
  PinGlyph,
  TypeChip
} from "./forums/forumUi.js";

const ForumThreadPanel = lazy(() =>
  import("./forums/ForumThreadPanel.js").then((m) => ({ default: m.ForumThreadPanel }))
);
const ForumComposePanel = lazy(() =>
  import("./forums/ForumComposePanel.js").then((m) => ({ default: m.ForumComposePanel }))
);

function forumSuspenseFallback() {
  return (
    <IslandCard>
      <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textSubtle }}>Loading…</p>
    </IslandCard>
  );
}

type ForumsPageProps = {
  profile: MeProfile | null;
  isAdmin: boolean;
  crewGames: CrewOwnedGame[];
};

export function ForumsPage({ profile, isAdmin, crewGames }: ForumsPageProps) {
  const location = useLocation();
  const routerNavigate = useNavigate();
  // The URL is the source of truth — the view is derived from the path, so
  // browser back/forward and notification deep-links re-drive it automatically.
  const view = useMemo(() => parseForumView(location.pathname), [location.pathname]);

  const navigate = useCallback(
    (next: ForumView) => {
      routerNavigate(forumPath(next));
    },
    [routerNavigate]
  );

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <ForumHeader />
      {view.mode === "home" ? (
        <ForumHome
          profile={profile}
          onSelectCategory={(slug) => navigate({ mode: "category", slug })}
          onSelectThread={(threadId) => navigate({ mode: "thread", threadId })}
          onCompose={(slug, type) => navigate({ mode: "compose", categorySlug: slug, type })}
        />
      ) : null}
      {view.mode === "category" ? (
        <CategoryView
          slug={view.slug}
          isAdmin={isAdmin}
          onBack={() => navigate({ mode: "home" })}
          onSelectThread={(threadId) => navigate({ mode: "thread", threadId })}
          onCompose={() => navigate({ mode: "compose", categorySlug: view.slug })}
        />
      ) : null}
      {view.mode === "thread" ? (
        <Suspense fallback={forumSuspenseFallback()}>
          <ForumThreadPanel
            threadId={view.threadId}
            targetPostId={view.postId}
            profile={profile}
            isAdmin={isAdmin}
            onBack={() => navigate({ mode: "home" })}
            onCategory={(slug) => navigate({ mode: "category", slug })}
            onSelectThread={(id) => navigate({ mode: "thread", threadId: id })}
          />
        </Suspense>
      ) : null}
      {view.mode === "compose" ? (
        <Suspense fallback={forumSuspenseFallback()}>
          <ForumComposePanel
            categorySlug={view.categorySlug}
            initialType={view.type}
            crewGames={crewGames}
            isAdmin={isAdmin}
            onCancel={() => navigate({ mode: "category", slug: view.categorySlug })}
            onCreated={(threadId) => navigate({ mode: "thread", threadId })}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

function ForumHeader() {
  return (
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
        💬 Community · Forums
      </span>
      <h1 className="island-display" style={{ margin: 0, fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 700 }}>
        Forums
      </h1>
      <p
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.5,
          color: islandTheme.color.textSubtle,
          maxWidth: 640
        }}
      >
        Long-form crew talk. Threads earn ₦5 each, replies earn ₦1. Be cool — moderation is on.
      </p>
    </header>
  );
}

// ── Forum Home ──────────────────────────────────────────────────────────────

function ForumHome({
  profile,
  onSelectCategory,
  onSelectThread,
  onCompose
}: {
  profile: MeProfile | null;
  onSelectCategory: (slug: string) => void;
  onSelectThread: (threadId: number) => void;
  onCompose: (slug: string, type?: ForumThreadType) => void;
}) {
  const [categories, setCategories] = useState<ForumCategory[] | null>(null);
  const [shellError, setShellError] = useState<string | null>(null);
  const [stats, setStats] = useState<ForumStats | null>(null);
  const [feed, setFeed] = useState<ForumFeedThread[] | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [sort, setSort] = useState<ForumFeedSort>("latest");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<ForumThreadType | null>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ForumSearchResult[] | null>(null);
  const [memoryWall, setMemoryWall] = useState<ForumFeedThread[]>([]);
  const [resourceShelf, setResourceShelf] = useState<ForumResourceItem[]>([]);

  const loadShell = useCallback(async () => {
    setShellError(null);
    const [catsRes, statsRes] = await Promise.all([
      apiFetch("/forums/categories").catch(() => null),
      apiFetch("/forums/stats").catch(() => null)
    ]);
    let cats: { categories?: ForumCategory[] } | null = null;
    if (catsRes && catsRes.ok) {
      cats = await catsRes.json().catch(() => null);
    } else {
      // A failed categories fetch is NOT "no categories yet" — surface it so a
      // backend error doesn't masquerade as an empty forum.
      const data = catsRes ? await catsRes.json().catch(() => null) : null;
      setShellError(data?.error ?? (catsRes ? `Categories failed to load (${catsRes.status})` : "Categories failed to load (network)"));
    }
    let st: ForumStats | null = null;
    if (statsRes && statsRes.ok) {
      const data = await statsRes.json().catch(() => null);
      if (data && typeof data === "object") {
        st = {
          threadsTotal: data.threadsTotal ?? 0,
          postsTotal: data.postsTotal ?? 0,
          categoriesTotal: data.categoriesTotal ?? 0,
          postsToday: data.postsToday ?? 0,
          topAuthors: Array.isArray(data.topAuthors) ? data.topAuthors : [],
          mine: {
            threadCount: data.mine?.threadCount ?? 0,
            postCount: data.mine?.postCount ?? 0,
            reactionsGiven: data.mine?.reactionsGiven ?? 0,
          },
          typeCounts: data.typeCounts ?? {},
        };
      }
    }
    setCategories(cats?.categories ?? []);
    setStats(st);

    // Discovery rails: recent memories (photo-first) + resource/recommendation shelf.
    const [memRes, resRes] = await Promise.all([
      apiFetch("/forums/threads?type=memory&limit=6").catch(() => null),
      apiFetch("/forums/resources?limit=6").catch(() => null)
    ]);
    if (memRes && memRes.ok) {
      const d = await memRes.json().catch(() => null);
      setMemoryWall(Array.isArray(d?.threads) ? d.threads : []);
    }
    if (resRes && resRes.ok) {
      const d = await resRes.json().catch(() => null);
      setResourceShelf(Array.isArray(d?.resources) ? d.resources : []);
    }
  }, []);

  const [feedHasMore, setFeedHasMore] = useState(false);

  const loadFeed = useCallback(async (offset = 0) => {
    setFeedLoading(true);
    setFeedError(null);
    try {
      const params = new URLSearchParams();
      params.set("sort", sort);
      params.set("limit", String(FEED_PAGE_SIZE));
      params.set("offset", String(offset));
      if (categoryFilter) params.set("category", categoryFilter);
      if (typeFilter) params.set("type", typeFilter);
      const r = await apiFetch(`/forums/threads?${params.toString()}`);
      if (!r.ok) {
        const data = await r.json().catch(() => null);
        throw new Error(data?.error ?? `Feed load failed (${r.status})`);
      }
      const data = await r.json();
      const batch: ForumFeedThread[] = data.threads ?? [];
      setFeed((cur) => (offset === 0 ? batch : [...(cur ?? []), ...batch]));
      setFeedHasMore(batch.length === FEED_PAGE_SIZE);
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : "Feed load failed");
      if (offset === 0) setFeed([]);
    } finally {
      setFeedLoading(false);
    }
  }, [sort, categoryFilter, typeFilter]);

  useEffect(() => { void loadShell(); }, [loadShell]);
  useEffect(() => { void loadFeed(); }, [loadFeed]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }
    const handle = window.setTimeout(async () => {
      const r = await apiFetch(`/forums/search?q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => ({ threads: [] }));
      setSearchResults(r.threads ?? []);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  const noCategories = categories !== null && categories.length === 0 && !shellError;
  const wide = useIsWide(880);
  const defaultCat = categories?.find((c) => !c.isLocked)?.slug ?? "general";

  // Getting-started checklist — driven by real stats, except the intro-read
  // tick which is persisted server-side via user_client_state.
  const [introRead, setIntroRead] = useState(
    () => Boolean(profile?.clientState?.forum_intro_seen)
  );
  const markIntroRead = () => {
    setIntroRead(true);
    void putClientState("forum_intro_seen", true);
  };
  const mine = stats?.mine;
  const reacted = (mine?.reactionsGiven ?? 0) > 0;
  const posted = (mine?.threadCount ?? 0) > 0;
  const replied = ((mine?.postCount ?? 0) - (mine?.threadCount ?? 0)) > 0;
  const checklistDone = introRead && reacted && replied && posted;
  const showExpandedHero = Boolean(profile) && stats !== null && !checklistDone && !noCategories && !shellError;

  const rail = (
    <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
      {memoryWall.length > 0 ? <MemoryWallCard memories={memoryWall} onSelect={onSelectThread} /> : null}
      {resourceShelf.length > 0 ? <ResourceShelfCard resources={resourceShelf} onSelect={onSelectThread} /> : null}
      {stats && (stats.topAuthors?.length ?? 0) > 0 ? <TopAuthorsCard stats={stats} /> : null}
      {categories && categories.length > 0 ? <BrowseCategoriesCollapsible categories={categories} onSelect={onSelectCategory} /> : null}
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <ForumHero
        expanded={showExpandedHero}
        stats={stats}
        checklist={{ introRead, reacted, replied, posted }}
        onMarkIntroRead={markIntroRead}
        onShare={() => onCompose(defaultCat)}
        onPickType={(type) => onCompose(defaultCat, type)}
        canCompose={!noCategories}
      />

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search threads & posts…"
        style={{ ...islandInputStyle, width: "100%", padding: "10px 14px", fontSize: 14 }}
      />

      {searchResults ? (
        <IslandCard style={{ padding: 0, overflow: "hidden" }}>
          <SectionHeader>Search results · {searchResults.length}</SectionHeader>
          {searchResults.length === 0 ? (
            <p style={{ margin: 0, padding: 16, fontSize: 13, color: islandTheme.color.textMuted }}>
              No threads matched “{search}”.
            </p>
          ) : (
            searchResults.map((t, i) => (
              <SearchResultRow key={t.id} result={t} firstRow={i === 0} onSelect={() => onSelectThread(t.id)} />
            ))
          )}
        </IslandCard>
      ) : (
        <>
          {shellError ? <ForumsErrorState message={shellError} onRetry={() => void loadShell()} /> : null}
          {noCategories ? <ForumsEmptyState /> : null}

          <div style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0, 1fr) 300px" : "1fr", gap: 16, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
              <TypeRail active={typeFilter} counts={stats?.typeCounts ?? {}} onSelect={setTypeFilter} />

              <SortFilterBar
                sort={sort}
                onSortChange={setSort}
                mineCount={stats?.mine?.threadCount ?? 0}
                isAuthed={Boolean(profile)}
              />

              {categories && categories.length > 0 ? (
                <CategoryChipStrip
                  categories={categories}
                  activeSlug={categoryFilter}
                  onSelect={(slug) => setCategoryFilter(slug)}
                  onJump={onSelectCategory}
                />
              ) : null}

              <FeedList
                threads={feed}
                loading={feedLoading}
                error={feedError}
                sort={sort}
                categoryFilter={categoryFilter}
                hasMore={feedHasMore}
                onLoadMore={() => void loadFeed(feed?.length ?? 0)}
                onSelect={onSelectThread}
                onClearFilter={() => { setCategoryFilter(null); setSort("latest"); setTypeFilter(null); }}
              />
            </div>
            {rail}
          </div>
        </>
      )}
    </div>
  );
}

// Switch between the two-column desktop layout and the stacked mobile layout.
function useIsWide(min: number): boolean {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= min);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(min-width: ${min}px)`);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [min]);
  return wide;
}

// ── Hero / Onboarding ───────────────────────────────────────────────────────

function ForumHero({
  expanded,
  stats,
  checklist,
  onMarkIntroRead,
  onShare,
  onPickType,
  canCompose
}: {
  expanded: boolean;
  stats: ForumStats | null;
  checklist: { introRead: boolean; reacted: boolean; replied: boolean; posted: boolean };
  onMarkIntroRead: () => void;
  onShare: () => void;
  onPickType: (type: ForumThreadType) => void;
  canCompose: boolean;
}) {
  const statsLine = stats
    ? `${stats.threadsTotal} threads · ${stats.postsTotal} posts · ${stats.postsToday} new today`
    : "Loading stats…";

  if (!expanded) {
    return (
      <IslandCard
        style={{
          background: `linear-gradient(135deg, rgba(56,189,248,0.14) 0%, ${islandTheme.color.panelBg} 80%)`,
          padding: 16,
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap"
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="island-display" style={{ fontSize: 17, fontWeight: 700 }}>Share something with the crew</div>
          <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 4 }}>{statsLine}</div>
        </div>
        <IslandButton variant="primary" onClick={onShare} disabled={!canCompose}>+ Share something</IslandButton>
      </IslandCard>
    );
  }

  const useCards = POST_TYPES.filter((t) => t.key !== "discussion");
  const items: { done: boolean; label: string; action?: () => void; actionLabel?: string }[] = [
    { done: checklist.introRead, label: "Read the intro", action: checklist.introRead ? undefined : onMarkIntroRead, actionLabel: "Mark read" },
    { done: checklist.reacted, label: "Leave a reaction on a post" },
    { done: checklist.replied, label: "Reply to a thread" },
    { done: checklist.posted, label: "Post your first thread", action: checklist.posted ? undefined : onShare, actionLabel: "Start" }
  ];

  return (
    <IslandCard
      style={{
        background: `linear-gradient(135deg, rgba(168,85,247,0.12) 0%, rgba(56,189,248,0.08) 45%, ${islandTheme.color.panelBg} 90%)`,
        padding: 18,
        display: "grid",
        gap: 16
      }}
    >
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <img
          src="/mascot/nugget-wave.svg"
          alt=""
          aria-hidden="true"
          width={64}
          height={64}
          style={{ flexShrink: 0 }}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 className="island-display" style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>👋 Welcome to the boards</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: islandTheme.color.textSubtle, lineHeight: 1.5, maxWidth: "60ch" }}>
            This is the crew's living room — post <strong>memories</strong> from our adventures, drop <strong>recommendations</strong>,
            and share <strong>resources</strong> worth knowing about. Pick a lane to get started:
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        {useCards.map((t) => (
          <button
            key={t.key}
            type="button"
            className="island-btn"
            onClick={() => onPickType(t.key)}
            disabled={!canCompose}
            style={{
              textAlign: "left",
              display: "grid",
              gap: 4,
              padding: "12px 14px",
              borderRadius: 12,
              background: `${t.accent}1a`,
              border: `1px solid ${t.accent}55`,
              color: islandTheme.color.textPrimary,
              cursor: canCompose ? "pointer" : "default",
              font: "inherit"
            }}
          >
            <span style={{ fontSize: 22 }} aria-hidden="true">{t.emoji}</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{t.label}</span>
            <span style={{ fontSize: 12, color: islandTheme.color.textMuted, lineHeight: 1.4 }}>{t.blurb}</span>
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <span className="island-mono" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}>
          Getting started
        </span>
        <div style={{ display: "grid", gap: 6 }}>
          {items.map((it) => (
            <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  background: it.done ? islandTheme.color.successAccent : "transparent",
                  color: it.done ? "#06281a" : islandTheme.color.textMuted,
                  border: it.done ? "none" : `1.5px solid ${islandTheme.color.cardBorder}`
                }}
              >
                {it.done ? "✓" : ""}
              </span>
              <span style={{ flex: 1, fontSize: 13, color: it.done ? islandTheme.color.textMuted : islandTheme.color.textPrimary, textDecoration: it.done ? "line-through" : "none" }}>
                {it.label}
              </span>
              {!it.done && it.action ? (
                <button
                  type="button"
                  className="island-btn"
                  onClick={it.action}
                  style={{ background: "transparent", border: "none", color: islandTheme.color.primaryGlow, cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 700 }}
                >
                  {it.actionLabel} →
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </IslandCard>
  );
}

function ForumsErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <IslandCard style={{ borderColor: islandTheme.color.danger }}>
      <IslandEmptyState
        pose="diver"
        title="Forums hit rough surf"
        body={message}
        action={<IslandButton onClick={onRetry}>Try again</IslandButton>}
      />
    </IslandCard>
  );
}

function ForumsEmptyState() {
  return (
    <IslandCard>
      <IslandEmptyState
        pose="shrug"
        title="No categories yet"
        body={
          <>
            Forums backend is wired up but no categories were found.<br />
            Run <code style={{ background: islandTheme.color.panelMutedBg, padding: "2px 6px", borderRadius: 4 }}>npm run db:migrate</code> from <code style={{ background: islandTheme.color.panelMutedBg, padding: "2px 6px", borderRadius: 4 }}>apps/api</code> to create the schema and seed defaults, or have a Parent admin create categories from <strong>Admin → Forum Moderation → Categories</strong>.
          </>
        }
      />
    </IslandCard>
  );
}

// ── Sort + Filter Bar ───────────────────────────────────────────────────────

function SortFilterBar({
  sort,
  onSortChange,
  mineCount,
  isAuthed
}: {
  sort: ForumFeedSort;
  onSortChange: (sort: ForumFeedSort) => void;
  mineCount: number;
  isAuthed: boolean;
}) {
  const tabs: { key: ForumFeedSort; label: string; hint?: string }[] = [
    { key: "latest", label: "Latest" },
    { key: "top", label: "🔥 Top" },
    { key: "unanswered", label: "Unanswered" },
    ...(isAuthed ? [{ key: "mine" as const, label: `My Threads (${mineCount})` }] : [])
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {tabs.map((t) => {
        const active = sort === t.key;
        return (
          <button
            key={t.key}
            type="button"
            className="island-btn"
            onClick={() => onSortChange(t.key)}
            style={{
              background: active ? islandTheme.color.primary : islandTheme.color.panelMutedBg,
              color: active ? islandTheme.color.primaryText : islandTheme.color.textSubtle,
              border: `1px solid ${active ? islandTheme.color.primary : islandTheme.color.cardBorder}`,
              borderRadius: 999,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              font: "inherit"
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Post-type rail + chip ───────────────────────────────────────────────────


function TypeRail({
  active,
  counts,
  onSelect
}: {
  active: ForumThreadType | null;
  counts: Partial<Record<ForumThreadType, number>>;
  onSelect: (t: ForumThreadType | null) => void;
}) {
  const total = POST_TYPES.reduce((n, t) => n + (counts[t.key] ?? 0), 0);
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <button type="button" className="island-btn" onClick={() => onSelect(null)} style={typePill(active === null, islandTheme.color.primaryGlow)}>
        All <span style={{ opacity: 0.7, marginLeft: 2 }}>{total}</span>
      </button>
      {POST_TYPES.map((t) => {
        const on = active === t.key;
        return (
          <button key={t.key} type="button" className="island-btn" onClick={() => onSelect(on ? null : t.key)} style={typePill(on, t.accent)}>
            <span aria-hidden="true">{t.emoji}</span> {t.label}
            <span style={{ opacity: 0.7, marginLeft: 2 }}>{counts[t.key] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Small inline chip showing a thread's post type. */

function CategoryChipStrip({
  categories,
  activeSlug,
  onSelect,
  onJump
}: {
  categories: ForumCategory[];
  activeSlug: string | null;
  onSelect: (slug: string | null) => void;
  onJump: (slug: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <button
        type="button"
        className="island-mono"
        onClick={() => onSelect(null)}
        style={chipStyle(activeSlug === null, islandTheme.color.primary)}
      >
        All
      </button>
      {categories.map((c) => {
        const active = activeSlug === c.slug;
        return (
          <button
            key={c.id}
            type="button"
            className="island-mono"
            onClick={() => onSelect(c.slug)}
            onDoubleClick={() => onJump(c.slug)}
            title={`${c.name} (double-click to open category page)`}
            style={chipStyle(active, c.accentColor)}
          >
            <span style={{ marginRight: 4 }}>{c.icon}</span>
            {c.name}
            <span style={{
              marginLeft: 6,
              opacity: 0.7,
              fontSize: 12,
              fontWeight: 500
            }}>
              {c.threadCount}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Feed list ───────────────────────────────────────────────────────────────

function FeedList({
  threads,
  loading,
  error,
  sort,
  categoryFilter,
  hasMore,
  onLoadMore,
  onSelect,
  onClearFilter
}: {
  threads: ForumFeedThread[] | null;
  loading: boolean;
  error: string | null;
  sort: ForumFeedSort;
  categoryFilter: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onSelect: (id: number) => void;
  onClearFilter: () => void;
}) {
  const headerLabel =
    sort === "top" ? "Top discussions" :
    sort === "unanswered" ? "Unanswered threads" :
    sort === "mine" ? "Your threads" :
    categoryFilter ? `Latest in ${categoryFilter}` : "Latest activity";

  return (
    <IslandCard style={{ padding: 0, overflow: "hidden" }}>
      <SectionHeader>{headerLabel}</SectionHeader>
      {loading && (!threads || threads.length === 0) ? (
        <p style={{ margin: 0, padding: 16, fontSize: 13, color: islandTheme.color.textMuted }}>Loading…</p>
      ) : error ? (
        <p style={{ margin: 0, padding: 16, fontSize: 13, color: islandTheme.color.dangerText }}>{error}</p>
      ) : !threads || threads.length === 0 ? (
        <div style={{ padding: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textMuted }}>
            {sort === "unanswered" ? "Nothing here — every thread has a reply." :
             sort === "mine" ? "You haven't posted yet. Start a discussion above." :
             categoryFilter ? "No threads in this category yet." :
             "No threads anywhere yet. Be first."}
          </p>
          {(categoryFilter || sort !== "latest") ? (
            <button
              type="button"
              className="island-btn"
              onClick={onClearFilter}
              style={{ marginTop: 8, background: "transparent", border: "none", color: islandTheme.color.primaryGlow, fontSize: 13, cursor: "pointer", padding: 0, font: "inherit" }}
            >
              Clear filters →
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {threads.map((t, i) => (
            <FeedRow key={t.id} thread={t} firstRow={i === 0} onSelect={() => onSelect(t.id)} />
          ))}
          {hasMore ? (
            <button
              type="button"
              className="island-btn"
              onClick={onLoadMore}
              disabled={loading}
              style={{
                width: "100%",
                padding: "10px 16px",
                background: "transparent",
                border: "none",
                borderTop: `1px solid ${islandTheme.color.cardBorder}`,
                color: islandTheme.color.primaryGlow,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                font: "inherit"
              }}
            >
              {loading ? "Loading…" : "Load more threads ↓"}
            </button>
          ) : null}
        </>
      )}
    </IslandCard>
  );
}

function FeedRow({
  thread,
  firstRow,
  onSelect
}: {
  thread: ForumFeedThread;
  firstRow: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="island-btn"
      onClick={onSelect}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 12,
        padding: "12px 16px",
        alignItems: "center",
        width: "100%",
        background: "transparent",
        border: "none",
        borderTop: firstRow ? "none" : `1px solid ${islandTheme.color.cardBorder}`,
        // Category accent edge: scan the feed by color without reading labels.
        borderLeft: `3px solid ${thread.categoryAccent}`,
        cursor: "pointer",
        font: "inherit",
        color: islandTheme.color.textPrimary,
        textAlign: "left"
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = islandTheme.color.panelMutedBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
        {thread.author.avatarUrl ? (
          <img
            src={thread.author.avatarUrl}
            alt={thread.author.displayName}
            style={{ width: 32, height: 32, borderRadius: 999, border: `1px solid ${islandTheme.color.border}`, flexShrink: 0 }}
          />
        ) : (
          <div style={{ width: 32, height: 32, borderRadius: 999, background: islandTheme.color.panelMutedBg, flexShrink: 0 }} />
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 700 }}>
            {thread.unread ? (
              <span title="New replies since your last visit" aria-label="unread" style={{ width: 8, height: 8, borderRadius: 999, background: islandTheme.color.primaryGlow, flexShrink: 0 }} />
            ) : null}
            {thread.isPinned ? <PinGlyph /> : null}
            {thread.isLocked ? <LockGlyph /> : null}
            <TypeChip type={thread.threadType} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{thread.title}</span>
          </div>
          <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>
            <span style={{ color: thread.categoryAccent }}>{thread.categoryIcon} {thread.categoryName}</span>
            {" · "}
            by {thread.author.displayName}
            {" · "}
            {thread.replyCount} repl{thread.replyCount === 1 ? "y" : "ies"}
            {" · "}
            {thread.viewCount} view{thread.viewCount === 1 ? "" : "s"}
            {thread.game ? <GameChip game={thread.game} /> : null}
          </div>
          {thread.linkUrl ? <FeedLinkLine linkUrl={thread.linkUrl} preview={thread.linkPreview ?? null} /> : null}
          {thread.coverImage ? (
            <img
              src={thread.coverImage.thumbUrl}
              alt=""
              loading="lazy"
              style={{ marginTop: 8, maxHeight: 130, maxWidth: "100%", borderRadius: 8, border: `1px solid ${islandTheme.color.cardBorder}`, objectFit: "cover", display: "block" }}
            />
          ) : null}
        </div>
      </div>
      <div style={{ fontSize: 12, color: islandTheme.color.textMuted, whiteSpace: "nowrap", textAlign: "right" }}>
        <div>{formatRelative(thread.lastReplyAt ?? thread.createdAt)}</div>
        {thread.lastReplyUser ? (
          <div style={{ marginTop: 2, opacity: 0.85 }}>{thread.lastReplyUser.displayName}</div>
        ) : null}
      </div>
    </button>
  );
}

// ── Browse categories collapsible ───────────────────────────────────────────

function BrowseCategoriesCollapsible({
  categories,
  onSelect
}: {
  categories: ForumCategory[];
  onSelect: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <IslandCard style={{ padding: 0, overflow: "hidden" }}>
      <button
        type="button"
        className="island-btn"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          background: "transparent",
          border: "none",
          padding: "12px 16px",
          cursor: "pointer",
          font: "inherit",
          color: islandTheme.color.textPrimary,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <span className="island-mono" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: islandTheme.color.textMuted }}>
          Browse all {categories.length} categories
        </span>
        <span style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div style={{ padding: "0 12px 12px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
          {categories.map((c) => (
            <CategoryTile key={c.id} category={c} onClick={() => onSelect(c.slug)} />
          ))}
        </div>
      ) : null}
    </IslandCard>
  );
}

function TopAuthorsCard({ stats }: { stats: ForumStats }) {
  return (
    <IslandCard style={{ padding: 0, overflow: "hidden" }}>
      <SectionHeader>Top contributors</SectionHeader>
      <div style={{ padding: "8px 16px 14px", display: "flex", gap: 10, flexWrap: "wrap" }}>
        {stats.topAuthors.map((a, i) => (
          <div
            key={`${a.displayName}-${i}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderRadius: 999,
              background: islandTheme.color.panelMutedBg,
              border: `1px solid ${islandTheme.color.cardBorder}`
            }}
          >
            {a.avatarUrl ? (
              <img src={a.avatarUrl} alt={a.displayName} style={{ width: 24, height: 24, borderRadius: 999 }} />
            ) : (
              <div style={{ width: 24, height: 24, borderRadius: 999, background: islandTheme.color.panelBg }} />
            )}
            <span style={{ fontSize: 13, fontWeight: 700 }}>{a.displayName}</span>
            <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
              {a.postCount} post{a.postCount === 1 ? "" : "s"}
            </span>
          </div>
        ))}
      </div>
    </IslandCard>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="island-mono"
      style={{
        padding: "12px 16px",
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: islandTheme.color.textMuted,
        borderBottom: `1px solid ${islandTheme.color.cardBorder}`
      }}
    >
      {children}
    </div>
  );
}

function CategoryTile({ category, onClick }: { category: ForumCategory; onClick: () => void }) {
  return (
    <button
      type="button"
      className="island-btn"
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: 16,
        borderRadius: 14,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        background: `linear-gradient(135deg, ${category.accentColor}22 0%, ${islandTheme.color.panelBg} 80%)`,
        backdropFilter: islandTheme.glass.blur,
        WebkitBackdropFilter: islandTheme.glass.blur,
        color: islandTheme.color.textPrimary,
        cursor: "pointer",
        font: "inherit",
        transition: "transform 140ms ease, border-color 140ms ease"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.borderColor = category.accentColor;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = islandTheme.color.cardBorder;
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: `${category.accentColor}33`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22
          }}
        >
          {category.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="island-display" style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            {category.name}
            {category.isLocked ? <LockGlyph /> : null}
          </div>
          <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>
            {category.threadCount} thread{category.threadCount === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: islandTheme.color.textSubtle, lineHeight: 1.45, marginBottom: 10 }}>
        {category.description}
      </div>
      {category.lastActivity ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: islandTheme.color.textMuted }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            ↳ {category.lastActivity.threadTitle}
          </span>
          <span>{formatRelative(category.lastActivity.at)}</span>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, fontStyle: "italic" }}>
          No threads yet — be first.
        </div>
      )}
    </button>
  );
}

function SearchResultRow({ result, firstRow, onSelect }: { result: ForumSearchResult; firstRow: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      className="island-btn"
      onClick={onSelect}
      style={listRowStyle(firstRow)}
      onMouseEnter={(e) => { e.currentTarget.style.background = islandTheme.color.panelMutedBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 700, minWidth: 0 }}>
        <TypeChip type={result.threadType} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{result.title}</span>
      </div>
      {result.snippet ? (
        <div style={{ fontSize: 12.5, color: islandTheme.color.textSubtle, marginTop: 3, lineHeight: 1.4 }}>{renderSnippet(result.snippet)}</div>
      ) : null}
      <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 3 }}>
        <span style={{ color: result.categoryAccent }}>{result.categoryIcon} {result.categoryName}</span>
        {" · "}{result.replyCount} repl{result.replyCount === 1 ? "y" : "ies"}
        {" · "}{formatRelative(result.lastReplyAt ?? result.createdAt)}
      </div>
    </button>
  );
}

function MemoryWallCard({ memories, onSelect }: { memories: ForumFeedThread[]; onSelect: (id: number) => void }) {
  return (
    <IslandCard style={{ padding: 0, overflow: "hidden" }}>
      <SectionHeader>📸 Memory wall</SectionHeader>
      <div style={{ padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 8 }}>
        {memories.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            title={m.title}
            style={{
              padding: 0,
              border: `1px solid ${islandTheme.color.cardBorder}`,
              borderRadius: 8,
              overflow: "hidden",
              cursor: "pointer",
              background: islandTheme.color.panelMutedBg,
              aspectRatio: "4 / 3"
            }}
          >
            {m.coverImage ? (
              <img src={m.coverImage.thumbUrl} alt={m.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 22 }} aria-hidden="true">📸</span>
            )}
          </button>
        ))}
      </div>
    </IslandCard>
  );
}

function ResourceShelfCard({ resources, onSelect }: { resources: ForumResourceItem[]; onSelect: (id: number) => void }) {
  return (
    <IslandCard style={{ padding: 0, overflow: "hidden" }}>
      <SectionHeader>🧰 Resource shelf</SectionHeader>
      {resources.map((r, i) => (
        <button
          key={r.id}
          type="button"
          className="island-btn"
          onClick={() => onSelect(r.id)}
          style={listRowStyle(i === 0)}
          onMouseEnter={(e) => { e.currentTarget.style.background = islandTheme.color.panelMutedBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, minWidth: 0 }}>
            <TypeChip type={r.threadType} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
          </div>
          <div style={{ fontSize: 12, color: islandTheme.color.primaryGlow, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            🔗 {r.linkPreview?.siteName ?? (r.linkUrl ? domainOf(r.linkUrl) : r.categoryName)}
          </div>
        </button>
      ))}
    </IslandCard>
  );
}


// ── Category View ───────────────────────────────────────────────────────────

function CategoryView({
  slug,
  isAdmin,
  onBack,
  onSelectThread,
  onCompose
}: {
  slug: string;
  isAdmin: boolean;
  onBack: () => void;
  onSelectThread: (id: number) => void;
  onCompose: () => void;
}) {
  const [threads, setThreads] = useState<ForumThreadListItem[] | null>(null);
  const [category, setCategory] = useState<{ name: string; description: string; icon: string; accentColor: string; isLocked: boolean } | null>(null);

  const load = useCallback(async () => {
    const r = await apiFetch(`/forums/categories/${slug}/threads?limit=100`).then((r) => r.json()).catch(() => null);
    if (!r) return;
    setCategory({
      name: r.category.name,
      description: r.category.description,
      icon: r.category.icon,
      accentColor: r.category.accentColor,
      isLocked: r.category.isLocked
    });
    setThreads(r.threads ?? []);
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!category) {
    return (
      <IslandCard>
        <BackLink onClick={onBack} label="← Forum home" />
        <p style={{ marginTop: 8, color: islandTheme.color.textSubtle }}>Loading…</p>
      </IslandCard>
    );
  }

  const pinned = (threads ?? []).filter((t) => t.isPinned);
  const regular = (threads ?? []).filter((t) => !t.isPinned);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <BackLink onClick={onBack} label="← Forum home" />
      <IslandCard
        style={{
          background: `linear-gradient(135deg, ${category.accentColor}22 0%, ${islandTheme.color.panelBg} 80%)`,
          padding: 18
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: 12,
              background: `${category.accentColor}33`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              flexShrink: 0
            }}
          >
            {category.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="island-display" style={{ margin: 0, fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              {category.name}
              {category.isLocked ? <LockGlyph /> : null}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: islandTheme.color.textSubtle }}>
              {category.description}
            </p>
            {category.isLocked && isAdmin ? (
              <p style={{ margin: "6px 0 0", fontSize: 12, color: islandTheme.color.textMuted, fontStyle: "italic" }}>
                Admin only — this category is locked for regular members.
              </p>
            ) : null}
          </div>
          <IslandButton
            variant="primary"
            onClick={onCompose}
            disabled={category.isLocked && !isAdmin}
            style={{ flexShrink: 0 }}
          >
            + New Thread
          </IslandButton>
        </div>
      </IslandCard>

      {pinned.length > 0 ? (
        <ThreadListBlock label="Pinned" threads={pinned} onSelect={onSelectThread} />
      ) : null}
      <ThreadListBlock
        label={pinned.length > 0 ? "Threads" : "All threads"}
        threads={regular}
        onSelect={onSelectThread}
        emptyText="No threads yet. Start one."
      />
    </div>
  );
}

function ThreadListBlock({
  label,
  threads,
  onSelect,
  emptyText
}: {
  label: string;
  threads: ForumThreadListItem[];
  onSelect: (id: number) => void;
  emptyText?: string;
}) {
  return (
    <IslandCard style={{ padding: 0, overflow: "hidden" }}>
      <div
        className="island-mono"
        style={{
          padding: "12px 16px",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: islandTheme.color.textMuted,
          borderBottom: `1px solid ${islandTheme.color.cardBorder}`
        }}
      >
        {label}
      </div>
      {threads.length === 0 && emptyText ? (
        <p style={{ margin: 0, padding: 16, fontSize: 13, color: islandTheme.color.textMuted }}>{emptyText}</p>
      ) : (
        threads.map((t, i) => (
          <ThreadRow key={t.id} thread={t} firstRow={i === 0} onSelect={() => onSelect(t.id)} />
        ))
      )}
    </IslandCard>
  );
}

function ThreadRow({
  thread,
  firstRow,
  onSelect
}: {
  thread: ForumThreadListItem;
  firstRow: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="island-btn"
      onClick={onSelect}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 70px 70px 130px",
        gap: 12,
        padding: "14px 16px",
        alignItems: "center",
        width: "100%",
        background: "transparent",
        border: "none",
        borderTop: firstRow ? "none" : `1px solid ${islandTheme.color.cardBorder}`,
        cursor: "pointer",
        font: "inherit",
        color: islandTheme.color.textPrimary,
        textAlign: "left"
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = islandTheme.color.panelMutedBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
        {thread.author.avatarUrl ? (
          <img
            src={thread.author.avatarUrl}
            alt={thread.author.displayName}
            style={{ width: 32, height: 32, borderRadius: 999, border: `1px solid ${islandTheme.color.border}`, flexShrink: 0 }}
          />
        ) : (
          <div style={{ width: 32, height: 32, borderRadius: 999, background: islandTheme.color.panelMutedBg, flexShrink: 0 }} />
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 700 }}>
            {thread.isPinned ? <PinGlyph /> : null}
            {thread.isLocked ? <LockGlyph /> : null}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{thread.title}</span>
          </div>
          <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>
            by {thread.author.displayName}
          </div>
        </div>
      </div>
      <ColumnStat value={thread.replyCount} label="replies" />
      <ColumnStat value={thread.viewCount} label="views" />
      <div style={{ fontSize: 12, color: islandTheme.color.textMuted, textAlign: "right" }}>
        <div>{formatRelative(thread.lastReplyAt ?? thread.createdAt)}</div>
        {thread.lastReplyUser ? (
          <div style={{ marginTop: 2, opacity: 0.85 }}>{thread.lastReplyUser.displayName}</div>
        ) : null}
      </div>
    </button>
  );
}

function ColumnStat({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div className="island-display" style={{ fontSize: 14, fontWeight: 700 }}>{value.toLocaleString()}</div>
      <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {label}
      </div>
    </div>
  );
}
