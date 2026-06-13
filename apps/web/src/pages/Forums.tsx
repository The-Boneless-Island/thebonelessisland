import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router";
import { apiFetch } from "../api/client.js";
import { IslandButton, IslandCard, IslandEmptyState, IslandTag, islandInputStyle, islandTagStyle } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import { GameCover } from "../steamArt.js";
import { renderMarkdown, surroundSelection, prefixLines } from "../lib/markdown.js";
import type {
  CrewOwnedGame,
  ForumAttachment,
  ForumCategory,
  ForumFeedSort,
  ForumFeedThread,
  ForumLinkPreview,
  ForumMember,
  ForumPoll,
  ForumPost,
  ForumReactionKey,
  ForumRelatedThread,
  ForumResourceItem,
  ForumSearchResult,
  ForumStats,
  ForumThreadDetail,
  ForumThreadGame,
  ForumThreadListItem,
  ForumThreadType,
  ForumUpload,
  MeProfile
} from "../types.js";

// ── Post types ──────────────────────────────────────────────────────────────
// Four orthogonal post types (alongside categories). Each has a stable accent
// + emoji used consistently across composer, type rail, feed chips and headers.
type PostTypeMeta = { key: ForumThreadType; emoji: string; label: string; blurb: string; accent: string };

const POST_TYPES: PostTypeMeta[] = [
  { key: "discussion", emoji: "💬", label: "Discussion", blurb: "A question, a hot take, anything worth talking about.", accent: "#38bdf8" },
  { key: "memory", emoji: "📸", label: "Memory", blurb: "Screenshots, photos and stories from our adventures.", accent: "#a855f7" },
  { key: "recommendation", emoji: "⭐", label: "Recommendation", blurb: "A game, show, or anything worth the crew's time.", accent: "#fbbf77" },
  { key: "resource", emoji: "🧰", label: "Resource", blurb: "A link to a tool or guide others should know about.", accent: "#4ade80" }
];

const POST_TYPE_BY_KEY: Record<ForumThreadType, PostTypeMeta> =
  Object.fromEntries(POST_TYPES.map((t) => [t.key, t])) as Record<ForumThreadType, PostTypeMeta>;

// The fixed reaction palette. Order here is the display order in the bar.
const REACTION_META: { key: ForumReactionKey; emoji: string; label: string }[] = [
  { key: "nug", emoji: "👍", label: "Nug" },
  { key: "heart", emoji: "❤️", label: "Love" },
  { key: "laugh", emoji: "😂", label: "Haha" },
  { key: "fire", emoji: "🔥", label: "Fire" },
  { key: "salute", emoji: "🫡", label: "Respect" }
];

type ForumView =
  | { mode: "home" }
  | { mode: "category"; slug: string }
  | { mode: "thread"; threadId: number; postId?: number }
  | { mode: "compose"; categorySlug: string; type?: ForumThreadType };

type ForumsPageProps = {
  profile: MeProfile | null;
  isAdmin: boolean;
  crewGames: CrewOwnedGame[];
};

const FEED_PAGE_SIZE = 30;

// ── Path routing ────────────────────────────────────────────────────────────
// Forum views are real URL paths so threads/posts are shareable (permalinks),
// announce-able (Discord) and notification-linkable, and survive refresh.
// Grammar (under the /forums route):
//   /forums
//   /forums/category/<slug>
//   /forums/thread/<id>[/post/<postId>]
//   /forums/compose/<slug>[/<type>]
function parseForumView(pathname: string): ForumView {
  const rest = pathname.replace(/^\/forums\/?/, "");
  let m: RegExpExecArray | null;
  if ((m = /^thread\/(\d+)(?:\/post\/(\d+))?/.exec(rest))) {
    return { mode: "thread", threadId: Number(m[1]), postId: m[2] ? Number(m[2]) : undefined };
  }
  if ((m = /^category\/([a-z0-9-]+)/.exec(rest))) return { mode: "category", slug: m[1] };
  if ((m = /^compose\/([a-z0-9-]+)(?:\/(discussion|memory|recommendation|resource))?/.exec(rest))) {
    return { mode: "compose", categorySlug: m[1], type: m[2] as ForumThreadType | undefined };
  }
  return { mode: "home" };
}

function forumPath(view: ForumView): string {
  switch (view.mode) {
    case "thread": return `/forums/thread/${view.threadId}${view.postId ? `/post/${view.postId}` : ""}`;
    case "category": return `/forums/category/${view.slug}`;
    case "compose": return `/forums/compose/${view.categorySlug}${view.type ? `/${view.type}` : ""}`;
    default: return "/forums";
  }
}

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
          onBack={() => navigate({ mode: "home" })}
          onSelectThread={(threadId) => navigate({ mode: "thread", threadId })}
          onCompose={() => navigate({ mode: "compose", categorySlug: view.slug })}
        />
      ) : null}
      {view.mode === "thread" ? (
        <ThreadView
          threadId={view.threadId}
          targetPostId={view.postId}
          profile={profile}
          isAdmin={isAdmin}
          onBack={() => navigate({ mode: "home" })}
          onCategory={(slug) => navigate({ mode: "category", slug })}
          onSelectThread={(id) => navigate({ mode: "thread", threadId: id })}
        />
      ) : null}
      {view.mode === "compose" ? (
        <ComposeView
          categorySlug={view.categorySlug}
          initialType={view.type}
          crewGames={crewGames}
          onCancel={() => navigate({ mode: "category", slug: view.categorySlug })}
          onCreated={(threadId) => navigate({ mode: "thread", threadId })}
        />
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
      <h1 className="island-display" style={{ margin: 0, fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 800 }}>
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
  // tick which is remembered in localStorage.
  const [introRead, setIntroRead] = useState(
    () => localStorage.getItem("bi:forum-onboarding-dismissed") === "1"
  );
  const markIntroRead = () => {
    localStorage.setItem("bi:forum-onboarding-dismissed", "1");
    setIntroRead(true);
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
          <div className="island-display" style={{ fontSize: 17, fontWeight: 800 }}>Share something with the crew</div>
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
          <h2 className="island-display" style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>👋 Welcome to the boards</h2>
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
            <span style={{ fontSize: 14, fontWeight: 800 }}>{t.label}</span>
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
                  fontWeight: 800,
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

function typePill(active: boolean, accent: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    font: "inherit",
    background: active ? `${accent}26` : islandTheme.color.panelMutedBg,
    color: active ? islandTheme.color.textPrimary : islandTheme.color.textSubtle,
    border: `1px solid ${active ? accent : islandTheme.color.cardBorder}`
  };
}

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
function TypeChip({ type }: { type: ForumThreadType }) {
  const meta = POST_TYPE_BY_KEY[type];
  if (type === "discussion") return null; // discussion is the implicit default
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "0 6px",
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 700,
        background: `${meta.accent}22`,
        border: `1px solid ${meta.accent}55`,
        color: meta.accent,
        verticalAlign: "middle"
      }}
    >
      <span aria-hidden="true">{meta.emoji}</span>
      {meta.label}
    </span>
  );
}

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

function chipStyle(active: boolean, accent: string): React.CSSProperties {
  return { ...islandTagStyle({ color: accent, active }), cursor: "pointer" };
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
          <div className="island-display" style={{ fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
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


// ── Search results + discovery rails ────────────────────────────────────────

// Postgres ts_headline marks matches with … sentinels. Render them
// as <mark> React elements — never raw HTML.
function renderSnippet(snippet: string | null): React.ReactNode {
  if (!snippet) return null;
  const START = String.fromCharCode(1);
  const END = String.fromCharCode(2);
  const out: React.ReactNode[] = [];
  let key = 0;
  snippet.split(START).forEach((part, idx) => {
    if (idx === 0) { if (part) out.push(part); return; }
    const endIdx = part.indexOf(END);
    if (endIdx === -1) { out.push(part); return; }
    const hl = part.slice(0, endIdx);
    const after = part.slice(endIdx + 1);
    out.push(
      <mark key={key++} style={{ background: `${islandTheme.color.nuggieGold}55`, color: "inherit", borderRadius: 3, padding: "0 2px" }}>
        {hl}
      </mark>
    );
    if (after) out.push(after);
  });
  return out;
}

function listRowStyle(firstRow: boolean): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "12px 16px",
    background: "transparent",
    border: "none",
    borderTop: firstRow ? "none" : `1px solid ${islandTheme.color.cardBorder}`,
    cursor: "pointer",
    font: "inherit",
    color: islandTheme.color.textPrimary
  };
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

function RelatedThreadsCard({ related, onSelect }: { related: ForumRelatedThread[]; onSelect: (id: number) => void }) {
  if (related.length === 0) return null;
  return (
    <IslandCard style={{ padding: 0, overflow: "hidden" }}>
      <SectionHeader>Related threads</SectionHeader>
      {related.map((t, i) => (
        <button
          key={t.id}
          type="button"
          className="island-btn"
          onClick={() => onSelect(t.id)}
          style={listRowStyle(i === 0)}
          onMouseEnter={(e) => { e.currentTarget.style.background = islandTheme.color.panelMutedBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 700, minWidth: 0 }}>
            <TypeChip type={t.threadType} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
          </div>
          <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>
            <span style={{ color: t.categoryAccent }}>{t.categoryIcon} {t.categoryName}</span>
            {" · "}{t.replyCount} repl{t.replyCount === 1 ? "y" : "ies"}
            {" · "}{formatRelative(t.lastReplyAt ?? t.createdAt)}
          </div>
        </button>
      ))}
    </IslandCard>
  );
}

// ── Category View ───────────────────────────────────────────────────────────

function CategoryView({
  slug,
  onBack,
  onSelectThread,
  onCompose
}: {
  slug: string;
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
            <h2 className="island-display" style={{ margin: 0, fontSize: 22, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
              {category.name}
              {category.isLocked ? <LockGlyph /> : null}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: islandTheme.color.textSubtle }}>
              {category.description}
            </p>
          </div>
          <IslandButton variant="primary" onClick={onCompose} disabled={category.isLocked} style={{ flexShrink: 0 }}>
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
      <div className="island-display" style={{ fontSize: 14, fontWeight: 800 }}>{value.toLocaleString()}</div>
      <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {label}
      </div>
    </div>
  );
}

// ── Thread View ─────────────────────────────────────────────────────────────

function ThreadView({
  threadId,
  targetPostId,
  profile,
  isAdmin,
  onBack,
  onCategory,
  onSelectThread
}: {
  threadId: number;
  targetPostId?: number;
  profile: MeProfile | null;
  isAdmin: boolean;
  onBack: () => void;
  onCategory: (slug: string) => void;
  onSelectThread: (id: number) => void;
}) {
  const [thread, setThread] = useState<ForumThreadDetail | null>(null);
  const [posts, setPosts] = useState<ForumPost[] | null>(null);
  const [related, setRelated] = useState<ForumRelatedThread[]>([]);
  // Reply drafts survive accidental navigation within the session.
  const replyDraftKey = `bi:forum-reply:${threadId}`;
  const [reply, setReply] = useState(() => sessionStorage.getItem(replyDraftKey) ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [replyUploads, setReplyUploads] = useState<ForumUpload[]>([]);
  const replyRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (reply) sessionStorage.setItem(replyDraftKey, reply);
    else sessionStorage.removeItem(replyDraftKey);
  }, [reply, replyDraftKey]);
  const load = useCallback(async () => {
    const r = await apiFetch(`/forums/threads/${threadId}`).then((r) => r.json()).catch(() => null);
    if (!r || !r.thread) {
      setError("Thread not found");
      return;
    }
    setThread(r.thread);
    setPosts(r.posts ?? []);
  }, [threadId]);

  useEffect(() => { void load(); }, [load]);

  // Related threads: same game tag first, then same category.
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/forums/threads/${threadId}/related`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setRelated(Array.isArray(d?.threads) ? d.threads : []); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [threadId]);

  // Once posts are present: scroll to a deep-linked post, else to the unread
  // divider (new replies since the last visit).
  useEffect(() => {
    if (!posts) return;
    if (targetPostId) {
      const el = document.getElementById(`post-${targetPostId}`);
      if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
      return;
    }
    if (thread?.firstUnreadPostId) {
      const el = document.getElementById("forum-unread-divider");
      if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, targetPostId, thread?.firstUnreadPostId]);

  async function toggleSubscribe() {
    if (!thread) return;
    const next = !thread.subscribed;
    setThread({ ...thread, subscribed: next });
    try {
      await apiFetch(`/forums/threads/${threadId}/subscribe`, { method: next ? "POST" : "DELETE" });
    } catch {
      setThread((t) => (t ? { ...t, subscribed: !next } : t));
    }
  }

  async function votePoll(optionIds: number[]) {
    if (!thread?.poll) return;
    try {
      const r = await apiFetch(`/forums/polls/${thread.poll.id}/vote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optionIds })
      });
      const data = await r.json().catch(() => null);
      if (r.ok && data?.poll) setThread((t) => (t ? { ...t, poll: data.poll } : t));
    } catch {
      /* ignore — keep prior state */
    }
  }

  function copyPermalink(postId: number) {
    const url = `${window.location.origin}/forums/thread/${threadId}/post/${postId}`;
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(postId);
      window.setTimeout(() => setCopied((c) => (c === postId ? null : c)), 1500);
    }).catch(() => undefined);
  }

  async function postReply() {
    if ((!reply.trim() && replyUploads.length === 0) || busy || !thread) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch(`/forums/threads/${threadId}/posts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: reply.trim() || "(image)",
          ...(replyUploads.length ? { uploadIds: replyUploads.map((u) => u.id) } : {})
        })
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error ?? "Reply failed");
      setReply("");
      setReplyUploads([]);
      sessionStorage.removeItem(replyDraftKey);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reply failed");
    } finally {
      setBusy(false);
    }
  }

  async function reactPost(postId: number, reaction: ForumReactionKey) {
    setPosts((cur) => cur?.map((p) => {
      if (p.id !== postId) return p;
      const has = p.myReactions.includes(reaction);
      const reactions = { ...p.reactions };
      const nextCount = Math.max(0, (reactions[reaction] ?? 0) + (has ? -1 : 1));
      if (nextCount === 0) delete reactions[reaction];
      else reactions[reaction] = nextCount;
      return {
        ...p,
        reactions,
        myReactions: has ? p.myReactions.filter((r) => r !== reaction) : [...p.myReactions, reaction]
      };
    }) ?? cur);
    try {
      await apiFetch(`/forums/posts/${postId}/react`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reaction })
      });
    } catch {
      void load();
    }
  }

  function quotePost(post: ForumPost) {
    const quoted = post.body.split("\n").map((l) => `> ${l}`).join("\n");
    const block = `${quoted}\n\n`;
    setReply((cur) => (cur.trim() ? `${cur.replace(/\s*$/, "")}\n\n${block}` : block));
    requestAnimationFrame(() => {
      replyRef.current?.focus();
      replyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function deletePost(postId: number) {
    if (!window.confirm("Delete this post?")) return;
    await apiFetch(`/forums/posts/${postId}`, { method: "DELETE" });
    await load();
  }

  async function editPost(postId: number, currentBody: string) {
    const next = window.prompt("Edit your post:", currentBody);
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed.length === 0) return;
    await apiFetch(`/forums/posts/${postId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: trimmed })
    });
    await load();
  }

  async function reportPost(postId: number) {
    const reason = window.prompt("Reason for report?");
    if (!reason || reason.trim().length === 0) return;
    await apiFetch(`/forums/posts/${postId}/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() })
    });
    window.alert("Reported. A mod will review.");
  }

  async function modAction(field: "isPinned" | "isLocked", value: boolean) {
    await apiFetch(`/forums/threads/${threadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [field]: value })
    });
    await load();
  }

  async function deleteThread() {
    if (!window.confirm("Delete entire thread?")) return;
    await apiFetch(`/forums/threads/${threadId}`, { method: "DELETE" });
    onBack();
  }

  function focusReply() {
    replyRef.current?.focus();
    replyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (error) {
    return (
      <IslandCard>
        <BackLink onClick={onBack} label="← Forum home" />
        <p style={{ marginTop: 12, color: islandTheme.color.dangerText }}>{error}</p>
      </IslandCard>
    );
  }
  if (!thread || !posts) {
    return (
      <IslandCard>
        <BackLink onClick={onBack} label="← Forum home" />
        <p style={{ marginTop: 12, color: islandTheme.color.textSubtle }}>Loading…</p>
      </IslandCard>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div
        style={{
          position: "sticky",
          top: 70,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 10,
          background: islandTheme.color.panelBg,
          border: `1px solid ${islandTheme.color.cardBorder}`,
          backdropFilter: islandTheme.glass.blur,
          WebkitBackdropFilter: islandTheme.glass.blur,
          boxShadow: islandTheme.shadow.cardIdle
        }}
      >
        <TypeChip type={thread.threadType} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {thread.title}
        </span>
        {!thread.isLocked ? (
          <IslandButton variant="primary" onClick={focusReply} style={{ padding: "0.34rem 0.7rem", fontSize: 13, flexShrink: 0 }}>
            Reply
          </IslandButton>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <BackLink onClick={onBack} label="← Forum home" />
        <span style={{ color: islandTheme.color.textMuted, fontSize: 13 }}>/</span>
        <button
          type="button"
          className="island-btn"
          onClick={() => onCategory(thread.categorySlug)}
          style={{
            background: "transparent",
            border: "none",
            color: thread.categoryAccent,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            padding: 0,
            font: "inherit"
          }}
        >
          {thread.categoryIcon} {thread.categoryName}
        </button>
      </div>

      <IslandCard
        style={{
          background: `linear-gradient(135deg, ${thread.categoryAccent}22 0%, ${islandTheme.color.panelBg} 80%)`,
          padding: 18
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="island-display" style={{ margin: 0, fontSize: "clamp(20px, 3vw, 28px)", fontWeight: 800, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {thread.isPinned ? <PinGlyph /> : null}
              {thread.isLocked ? <LockGlyph /> : null}
              <TypeChip type={thread.threadType} />
              {thread.title}
            </h1>
            <div style={{ marginTop: 6, fontSize: 12, color: islandTheme.color.textMuted }}>
              {posts.length} post{posts.length === 1 ? "" : "s"} · {thread.viewCount.toLocaleString()} views · started {formatRelative(thread.createdAt)}
              {thread.game ? <GameChip game={thread.game} /> : null}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <ModButton onClick={toggleSubscribe}>
              {thread.subscribed ? "🔔 Following" : "🔕 Follow"}
            </ModButton>
            {isAdmin ? (
              <>
                <ModButton onClick={() => modAction("isPinned", !thread.isPinned)}>
                  {thread.isPinned ? "Unpin" : "Pin"}
                </ModButton>
                <ModButton onClick={() => modAction("isLocked", !thread.isLocked)}>
                  {thread.isLocked ? "Unlock" : "Lock"}
                </ModButton>
                <ModButton onClick={deleteThread} danger>
                  Delete
                </ModButton>
              </>
            ) : null}
          </div>
        </div>
        {thread.linkUrl ? <LinkPreviewCard linkUrl={thread.linkUrl} preview={thread.linkPreview ?? null} /> : null}
      </IslandCard>

      {thread.poll ? <PollCard poll={thread.poll} onVote={votePoll} /> : null}

      {posts.map((post, idx) => (
        <Fragment key={post.id}>
          {thread.firstUnreadPostId === post.id && idx > 0 ? <UnreadDivider /> : null}
          <PostCard
            post={post}
            idx={idx + 1}
            canEdit={profile?.discordUserId === post.author.discordUserId || isAdmin}
            isOwner={profile?.discordUserId === post.author.discordUserId}
            copied={copied === post.id}
            onReact={(reaction) => reactPost(post.id, reaction)}
            onQuote={thread.isLocked ? undefined : () => quotePost(post)}
            onCopyLink={() => copyPermalink(post.id)}
            onEdit={() => editPost(post.id, post.body)}
            onDelete={() => deletePost(post.id)}
            onReport={() => reportPost(post.id)}
          />
        </Fragment>
      ))}

      {thread.isLocked ? (
        <IslandCard>
          <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textMuted, textAlign: "center" }}>
            🔒 This thread is locked. New replies are disabled.
          </p>
        </IslandCard>
      ) : (
        <IslandCard>
          <h3 style={{ margin: 0, marginBottom: 8, fontSize: 13, fontWeight: 700, color: islandTheme.color.textMuted }}>
            Post a reply
          </h3>
          <MarkdownEditor
            value={reply}
            onChange={setReply}
            rows={5}
            textareaRef={replyRef}
            placeholder="Be cool. Stay on topic. **bold**, *italic*, > quote, lists, `code`…"
          />
          <div style={{ marginTop: 10 }}>
            <ImageDropzone uploads={replyUploads} onUploadsChange={setReplyUploads} />
          </div>
          {error ? (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: islandTheme.color.dangerText }}>{error}</p>
          ) : null}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <span style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
              {reply.length} char{reply.length === 1 ? "" : "s"} · earns ₦1
            </span>
            <IslandButton variant="primary" onClick={postReply} disabled={busy || (reply.trim().length < 2 && replyUploads.length === 0)}>
              {busy ? "Posting…" : "Post Reply"}
            </IslandButton>
          </div>
        </IslandCard>
      )}

      <RelatedThreadsCard related={related} onSelect={onSelectThread} />
    </div>
  );
}

function PostCard({
  post,
  idx,
  canEdit,
  isOwner,
  copied,
  onReact,
  onQuote,
  onCopyLink,
  onEdit,
  onDelete,
  onReport
}: {
  post: ForumPost;
  idx: number;
  canEdit: boolean;
  isOwner: boolean;
  copied: boolean;
  onReact: (reaction: ForumReactionKey) => void;
  onQuote?: () => void;
  onCopyLink: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
}) {
  return (
    <IslandCard
      id={`post-${post.id}`}
      style={{
        padding: 0,
        overflow: "hidden",
        scrollMarginTop: 80,
        borderColor: post.isOp ? islandTheme.color.primaryGlow : islandTheme.color.cardBorder
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "180px 1fr",
          gap: 0
        }}
      >
        <div
          style={{
            borderRight: `1px solid ${islandTheme.color.cardBorder}`,
            padding: 14,
            background: islandTheme.color.panelMutedBg,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8
          }}
        >
          {post.author.avatarUrl ? (
            <img
              src={post.author.avatarUrl}
              alt={post.author.displayName}
              style={{ width: 64, height: 64, borderRadius: 999, border: `2px solid ${islandTheme.color.border}` }}
            />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: 999, background: islandTheme.color.panelBg }} />
          )}
          <div style={{ fontSize: 13, fontWeight: 800, textAlign: "center", lineHeight: 1.2 }}>
            {post.author.displayName}
          </div>
          <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
            @{post.author.username}
          </div>
          {post.isOp ? <IslandTag tone="primary">Op</IslandTag> : null}
        </div>

        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12, color: islandTheme.color.textMuted, gap: 12, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <a
                href={`/forums/thread/${post.threadId}/post/${post.id}`}
                onClick={(e) => { e.preventDefault(); onCopyLink(); }}
                title="Copy link to this post"
                style={{ color: islandTheme.color.textMuted, textDecoration: "none", fontWeight: 700 }}
              >
                #{idx}
              </a>
              <span>· {formatAbsolute(post.createdAt)}</span>
              <button
                type="button"
                className="island-btn"
                onClick={onCopyLink}
                title="Copy permalink"
                aria-label="Copy permalink"
                style={{ background: "transparent", border: "none", color: copied ? islandTheme.color.successSoft : islandTheme.color.textMuted, cursor: "pointer", font: "inherit", fontSize: 12, padding: 0 }}
              >
                {copied ? "✓ copied" : "🔗"}
              </button>
            </span>
            {post.editedAt ? <span style={{ fontStyle: "italic" }}>edited {formatRelative(post.editedAt)}</span> : null}
          </div>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxWidth: islandTheme.prose.readable.maxWidth,
              color: post.isDeleted ? islandTheme.color.textMuted : islandTheme.color.textPrimary,
              fontStyle: post.isDeleted ? "italic" : "normal"
            }}
          >
            {post.isDeleted ? "[deleted]" : renderMarkdown(post.body)}
          </div>
          {!post.isDeleted && post.attachments.length > 0 ? <AttachmentGallery attachments={post.attachments} /> : null}
          {!post.isDeleted ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
              {REACTION_META.map((r) => {
                const count = post.reactions[r.key] ?? 0;
                const mine = post.myReactions.includes(r.key);
                return (
                  <button
                    key={r.key}
                    type="button"
                    className="island-btn"
                    onClick={() => onReact(r.key)}
                    title={r.label}
                    aria-label={`${r.label}${count ? ` (${count})` : ""}`}
                    aria-pressed={mine}
                    style={{
                      background: mine ? islandTheme.color.primary : islandTheme.color.panelMutedBg,
                      color: mine ? islandTheme.color.primaryText : islandTheme.color.textSubtle,
                      border: `1px solid ${mine ? islandTheme.color.primary : islandTheme.color.cardBorder}`,
                      borderRadius: 999,
                      padding: count > 0 ? "4px 10px 4px 8px" : "4px 8px",
                      fontSize: 13,
                      lineHeight: 1,
                      cursor: "pointer",
                      font: "inherit",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4
                    }}
                  >
                    <span aria-hidden="true">{r.emoji}</span>
                    {count > 0 ? <span style={{ fontSize: 12, fontWeight: 700 }}>{count}</span> : null}
                  </button>
                );
              })}
              <span aria-hidden="true" style={{ width: 1, alignSelf: "stretch", background: islandTheme.color.cardBorder, margin: "2px 2px" }} />
              {onQuote ? (
                <button type="button" className="island-btn" onClick={onQuote} style={ghostBtn}>Quote</button>
              ) : null}
              {canEdit ? (
                <button type="button" className="island-btn" onClick={onEdit} style={ghostBtn}>Edit</button>
              ) : null}
              {canEdit ? (
                <button type="button" className="island-btn" onClick={onDelete} style={{ ...ghostBtn, color: islandTheme.color.dangerText }}>Delete</button>
              ) : null}
              {!isOwner ? (
                <button type="button" className="island-btn" onClick={onReport} style={ghostBtn}>Report</button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </IslandCard>
  );
}

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${islandTheme.color.cardBorder}`,
  color: islandTheme.color.textSubtle,
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  cursor: "pointer",
  font: "inherit"
};

function PollCard({ poll, onVote }: { poll: ForumPoll; onVote: (optionIds: number[]) => void }) {
  const closed = poll.closesAt ? new Date(poll.closesAt).getTime() < Date.now() : false;
  const total = poll.options.reduce((s, o) => s + o.votes, 0);

  function toggle(id: number) {
    if (closed) return;
    if (poll.multi) {
      const next = poll.myVotes.includes(id) ? poll.myVotes.filter((x) => x !== id) : [...poll.myVotes, id];
      onVote(next);
    } else {
      onVote(poll.myVotes.includes(id) ? [] : [id]);
    }
  }

  return (
    <IslandCard style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden="true" style={{ fontSize: 16 }}>📊</span>
        <span className="island-display" style={{ fontSize: 16, fontWeight: 800 }}>{poll.question}</span>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {poll.options.map((o) => {
          const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
          const mine = poll.myVotes.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.id)}
              disabled={closed}
              style={{
                position: "relative",
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 8,
                overflow: "hidden",
                border: `1px solid ${mine ? islandTheme.color.primaryGlow : islandTheme.color.cardBorder}`,
                background: islandTheme.color.panelMutedBg,
                cursor: closed ? "default" : "pointer",
                font: "inherit",
                color: islandTheme.color.textPrimary
              }}
            >
              <div
                aria-hidden="true"
                style={{ position: "absolute", insetInlineStart: 0, top: 0, bottom: 0, width: `${pct}%`, background: `${islandTheme.color.primary}33`, transition: "width 240ms ease" }}
              />
              <div style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: mine ? 800 : 600 }}>{mine ? "✓ " : ""}{o.label}</span>
                <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, flexShrink: 0 }}>{pct}% · {o.votes}</span>
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
        {poll.totalVoters} voter{poll.totalVoters === 1 ? "" : "s"}
        {poll.multi ? " · multiple choice" : ""}
        {closed ? " · closed" : poll.closesAt ? ` · closes ${formatRelative(poll.closesAt)}` : ""}
        {poll.myVotes.length === 0 && !closed ? " · tap to vote" : ""}
      </div>
    </IslandCard>
  );
}

function UnreadDivider() {
  return (
    <div id="forum-unread-divider" style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 4px", scrollMarginTop: 80 }}>
      <div style={{ flex: 1, height: 1, background: islandTheme.color.primaryGlow, opacity: 0.5 }} />
      <span className="island-mono" style={{ fontSize: 11, fontWeight: 700, color: islandTheme.color.primaryGlow, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
        New since your last visit
      </span>
      <div style={{ flex: 1, height: 1, background: islandTheme.color.primaryGlow, opacity: 0.5 }} />
    </div>
  );
}

function ModButton({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      className="island-btn"
      onClick={onClick}
      style={{
        background: danger ? islandTheme.color.dangerSurface : islandTheme.color.panelMutedBg,
        color: danger ? islandTheme.color.dangerText : islandTheme.color.textSubtle,
        border: `1px solid ${danger ? islandTheme.color.danger : islandTheme.color.cardBorder}`,
        borderRadius: 999,
        padding: "5px 12px",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        font: "inherit"
      }}
    >
      {children}
    </button>
  );
}

// ── Markdown editor (toolbar + write/preview) ───────────────────────────────

type MdAction = "bold" | "italic" | "strike" | "code" | "quote" | "ul" | "ol" | "link" | "image";

const MD_TOOLBAR: { action: MdAction; glyph: string; title: string }[] = [
  { action: "bold", glyph: "B", title: "Bold" },
  { action: "italic", glyph: "i", title: "Italic" },
  { action: "strike", glyph: "S", title: "Strikethrough" },
  { action: "code", glyph: "</>", title: "Code" },
  { action: "quote", glyph: "❝", title: "Quote" },
  { action: "ul", glyph: "•", title: "Bulleted list" },
  { action: "ol", glyph: "1.", title: "Numbered list" },
  { action: "link", glyph: "🔗", title: "Link" },
  { action: "image", glyph: "🖼", title: "Image" }
];

const mdToolBtn: React.CSSProperties = {
  minWidth: 28,
  height: 26,
  padding: "0 7px",
  borderRadius: 6,
  border: `1px solid ${islandTheme.color.cardBorder}`,
  background: islandTheme.color.panelMutedBg,
  color: islandTheme.color.textSubtle,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  font: "inherit"
};

// Crew member list for @mention autocomplete — fetched once, module-cached.
let forumMembersCache: ForumMember[] | null = null;
let forumMembersPromise: Promise<ForumMember[]> | null = null;

function useForumMembers(): ForumMember[] {
  const [members, setMembers] = useState<ForumMember[]>(forumMembersCache ?? []);
  useEffect(() => {
    if (forumMembersCache) { setMembers(forumMembersCache); return; }
    let promise: Promise<ForumMember[]>;
    if (forumMembersPromise) {
      promise = forumMembersPromise;
    } else {
      promise = apiFetch("/forums/members")
        .then((r) => r.json())
        .then((d): ForumMember[] => {
          const list: ForumMember[] = Array.isArray(d?.members) ? d.members : [];
          forumMembersCache = list;
          return list;
        })
        .catch((): ForumMember[] => {
          forumMembersCache = [];
          return [];
        });
      forumMembersPromise = promise;
    }
    let active = true;
    void promise.then((m) => { if (active) setMembers(m); });
    return () => { active = false; };
  }, []);
  return members;
}

function MarkdownEditor({
  value,
  onChange,
  rows = 8,
  placeholder,
  textareaRef
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const ref = textareaRef ?? internalRef;
  const [preview, setPreview] = useState(false);
  const members = useForumMembers();
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);

  const mentionMatches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return members
      .filter((m) => m.username.toLowerCase().includes(q) || m.displayName.toLowerCase().includes(q))
      .slice(0, 6);
  }, [mention, members]);

  function onTextChange(v: string, cursor: number) {
    onChange(v);
    // Detect an in-progress @mention token immediately left of the cursor.
    const m = /(^|\s)@([a-z0-9._]*)$/i.exec(v.slice(0, cursor));
    setMention(m ? { query: m[2], start: cursor - m[2].length - 1 } : null);
  }

  function insertMention(username: string) {
    const ta = ref.current;
    if (!ta || !mention) return;
    const pos = ta.selectionStart ?? value.length;
    const before = value.slice(0, mention.start);
    const after = value.slice(pos);
    const insert = `@${username} `;
    const next = before + insert + after;
    onChange(next);
    setMention(null);
    const caret = before.length + insert.length;
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(caret, caret); });
  }

  function apply(action: MdAction) {
    const ta = ref.current;
    if (!ta) return;
    const s = ta.selectionStart ?? value.length;
    const e = ta.selectionEnd ?? value.length;
    let next;
    switch (action) {
      case "bold": next = surroundSelection(value, s, e, "**", "**", "bold text"); break;
      case "italic": next = surroundSelection(value, s, e, "*", "*", "italic text"); break;
      case "strike": next = surroundSelection(value, s, e, "~~", "~~", "struck"); break;
      case "code": next = surroundSelection(value, s, e, "`", "`", "code"); break;
      case "link": next = surroundSelection(value, s, e, "[", "](https://)", "link text"); break;
      case "image": next = surroundSelection(value, s, e, "![", "](https://)", "alt text"); break;
      case "quote": next = prefixLines(value, s, e, "> ", "quote"); break;
      case "ul": next = prefixLines(value, s, e, "- ", "item"); break;
      case "ol": next = prefixLines(value, s, e, "1. ", "item"); break;
    }
    onChange(next.value);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(next.selStart, next.selEnd);
    });
  }

  return (
    <div style={{ display: "grid", gap: 6, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1, opacity: preview ? 0.4 : 1, pointerEvents: preview ? "none" : "auto" }}>
          {MD_TOOLBAR.map((t) => (
            <button
              key={t.action}
              type="button"
              className="island-btn"
              title={t.title}
              aria-label={t.title}
              onClick={() => apply(t.action)}
              style={{
                ...mdToolBtn,
                fontStyle: t.action === "italic" ? "italic" : "normal",
                textDecoration: t.action === "strike" ? "line-through" : "none",
                fontFamily: t.action === "code" || t.action === "ol" ? islandTheme.font.mono : "inherit"
              }}
            >
              {t.glyph}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="island-btn"
          onClick={() => setPreview((v) => !v)}
          disabled={!preview && value.trim().length === 0}
          style={{
            background: "transparent",
            border: "none",
            color: islandTheme.color.primaryGlow,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            padding: "0 4px",
            font: "inherit",
            opacity: !preview && value.trim().length === 0 ? 0.5 : 1
          }}
        >
          {preview ? "✎ Write" : "👁 Preview"}
        </button>
      </div>
      {preview ? (
        <div
          style={{
            minHeight: rows * 22,
            padding: "10px 14px",
            borderRadius: 10,
            border: `1px dashed ${islandTheme.color.cardBorder}`,
            background: islandTheme.color.panelMutedBg,
            fontSize: 14,
            lineHeight: 1.6
          }}
        >
          {value.trim() ? renderMarkdown(value) : <span style={{ color: islandTheme.color.textMuted }}>Nothing to preview yet.</span>}
        </div>
      ) : (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onTextChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onBlur={() => window.setTimeout(() => setMention(null), 150)}
          rows={rows}
          placeholder={placeholder}
          style={{ ...islandInputStyle, width: "100%", padding: "10px 14px", fontSize: 14, fontFamily: "inherit", resize: "vertical" }}
        />
      )}
      {!preview && mention && mentionMatches.length > 0 ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: 6,
            zIndex: 50,
            minWidth: 220,
            maxWidth: 320,
            background: islandTheme.color.menuBg,
            border: `1px solid ${islandTheme.color.border}`,
            borderRadius: 10,
            boxShadow: islandTheme.shadow.menu,
            overflow: "hidden"
          }}
        >
          {mentionMatches.map((m) => (
            <button
              key={m.username}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertMention(m.username); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "7px 10px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                font: "inherit",
                color: islandTheme.color.textPrimary,
                textAlign: "left"
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = islandTheme.color.panelMutedBg; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt="" style={{ width: 22, height: 22, borderRadius: 999 }} />
              ) : (
                <div style={{ width: 22, height: 22, borderRadius: 999, background: islandTheme.color.panelMutedBg }} />
              )}
              <span style={{ fontSize: 13, fontWeight: 700 }}>{m.displayName}</span>
              <span className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted }}>@{m.username}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Image dropzone + attachment gallery ─────────────────────────────────────

const MAX_ATTACHMENTS = 10;

function ImageDropzone({
  uploads,
  onUploadsChange
}: {
  uploads: ForumUpload[];
  onUploadsChange: (next: ForumUpload[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(files: FileList | File[]) {
    const slots = MAX_ATTACHMENTS - uploads.length;
    if (slots <= 0) { setError(`Up to ${MAX_ATTACHMENTS} images per post.`); return; }
    const list = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, slots);
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    const added: ForumUpload[] = [];
    let failed = 0;
    let lastMsg = "Upload failed";
    for (const f of list) {
      try {
        const fd = new FormData();
        fd.append("file", f);
        const r = await apiFetch("/forums/uploads", { method: "POST", body: fd });
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.error ?? "Upload failed");
        added.push(data as ForumUpload);
      } catch (e) {
        failed++;
        if (e instanceof Error && e.message) lastMsg = e.message;
      }
    }
    if (added.length) onUploadsChange([...uploads, ...added]);
    // Summarize partial failures (don't let one file's error mask the rest),
    // while still surfacing the server's reason for the last failure.
    if (failed > 0) {
      setError(
        failed === list.length
          ? failed === 1
            ? lastMsg
            : `All ${failed} uploads failed — ${lastMsg}`
          : `${failed} of ${list.length} images failed — ${lastMsg}`
      );
    }
    setBusy(false);
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void handleFiles(e.dataTransfer.files); }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "16px 12px",
          borderRadius: 10,
          border: `1.5px dashed ${dragOver ? islandTheme.color.primaryGlow : islandTheme.color.cardBorder}`,
          background: dragOver ? `${islandTheme.color.primary}14` : islandTheme.color.panelMutedBg,
          color: islandTheme.color.textSubtle,
          cursor: "pointer",
          fontSize: 13,
          textAlign: "center"
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 18 }}>🖼️</span>
        {busy ? "Uploading…" : `Drop images here or click to upload (${uploads.length}/${MAX_ATTACHMENTS})`}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        onChange={(e) => { if (e.target.files) void handleFiles(e.target.files); e.target.value = ""; }}
        style={{ display: "none" }}
      />
      {error ? <span style={{ fontSize: 12, color: islandTheme.color.dangerSoft }}>{error}</span> : null}
      {uploads.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {uploads.map((u) => (
            <div key={u.id} style={{ position: "relative" }}>
              <img
                src={u.thumbUrl}
                alt=""
                style={{ width: 84, height: 64, objectFit: "cover", borderRadius: 8, border: `1px solid ${islandTheme.color.cardBorder}`, display: "block" }}
              />
              <button
                type="button"
                onClick={() => onUploadsChange(uploads.filter((x) => x.id !== u.id))}
                aria-label="Remove image"
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  border: "none",
                  background: islandTheme.color.dangerSurface,
                  color: islandTheme.color.dangerText,
                  cursor: "pointer",
                  fontSize: 12,
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Thumbnail grid + click-to-zoom lightbox for a post's attached images. */
function AttachmentGallery({ attachments }: { attachments: ForumAttachment[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const count = attachments.length;
  const isOpen = openIdx !== null;

  const close = useCallback(() => setOpenIdx(null), []);
  const step = useCallback(
    (delta: number) => setOpenIdx((i) => (i === null ? i : (i + delta + count) % count)),
    [count]
  );

  // While the lightbox is open: keyboard nav (Esc/←/→), lock background scroll,
  // move focus into the dialog, and restore it to the thumbnail on close.
  // (Hooks must run before the early return below.)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    overlayRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      triggerRef.current?.focus();
    };
  }, [isOpen, close, step]);

  if (!attachments.length) return null;

  const navBtnStyle: CSSProperties = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: 44,
    height: 44,
    borderRadius: 999,
    border: "none",
    background: "rgba(2,6,23,0.6)",
    color: "#fff",
    fontSize: 28,
    lineHeight: 1,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  };

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
        {attachments.map((a, i) => (
          <button
            key={a.url}
            type="button"
            onClick={(e) => {
              triggerRef.current = e.currentTarget;
              setOpenIdx(i);
            }}
            style={{ padding: 0, border: `1px solid ${islandTheme.color.cardBorder}`, borderRadius: 8, overflow: "hidden", cursor: "zoom-in", background: "none", lineHeight: 0 }}
          >
            <img src={a.thumbUrl} alt="" loading="lazy" style={{ display: "block", maxHeight: 180, maxWidth: 260, objectFit: "cover" }} />
          </button>
        ))}
      </div>
      {openIdx !== null
        ? // Portal to <body>: the post sits inside an IslandCard whose
          // backdrop-filter makes it a containing block for position:fixed (and
          // its overflow:hidden clips), which would otherwise trap the lightbox
          // inside the post box. The portal lets it cover the real viewport.
          createPortal(
            <div
              ref={overlayRef}
              tabIndex={-1}
              onClick={close}
              role="dialog"
              aria-modal="true"
              aria-label="Image viewer"
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(2,6,23,0.88)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                cursor: "zoom-out",
                padding: 24,
                outline: "none"
              }}
            >
              {count > 1 ? (
                <button
                  type="button"
                  aria-label="Previous image"
                  onClick={(e) => { e.stopPropagation(); step(-1); }}
                  style={{ ...navBtnStyle, left: 16 }}
                >
                  ‹
                </button>
              ) : null}
              <img
                src={attachments[openIdx].url}
                alt=""
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: count > 1 ? "86%" : "96%", maxHeight: "96%", objectFit: "contain", borderRadius: 8, boxShadow: islandTheme.shadow.menu, cursor: "default" }}
              />
              {count > 1 ? (
                <>
                  <button
                    type="button"
                    aria-label="Next image"
                    onClick={(e) => { e.stopPropagation(); step(1); }}
                    style={{ ...navBtnStyle, right: 16 }}
                  >
                    ›
                  </button>
                  <div
                    aria-hidden="true"
                    style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", color: "#fff", fontSize: 13, background: "rgba(2,6,23,0.6)", padding: "4px 10px", borderRadius: 999 }}
                  >
                    {openIdx + 1} / {count}
                  </div>
                </>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

// ── Compose ─────────────────────────────────────────────────────────────────

function ComposeView({
  categorySlug,
  initialType,
  crewGames,
  onCancel,
  onCreated
}: {
  categorySlug: string;
  initialType?: ForumThreadType;
  crewGames: CrewOwnedGame[];
  onCancel: () => void;
  onCreated: (threadId: number) => void;
}) {
  // Compose drafts survive accidental navigation within the session.
  const draftKey = `bi:forum-compose:${categorySlug}`;
  const draft = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem(draftKey) ?? "null") as
        | { title?: string; body?: string; type?: ForumThreadType; linkUrl?: string }
        | null;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  const [title, setTitle] = useState(draft?.title ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [type, setType] = useState<ForumThreadType>(initialType ?? draft?.type ?? "discussion");
  const [linkUrl, setLinkUrl] = useState(draft?.linkUrl ?? "");
  // Uploads aren't persisted in the draft (server-side ids), so they reset on
  // reload — acceptable; the images themselves remain on the server until swept.
  const [uploads, setUploads] = useState<ForumUpload[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taggedGame, setTaggedGame] = useState<CrewOwnedGame | null>(null);
  const [gameQuery, setGameQuery] = useState("");
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [category, setCategory] = useState<string>(categorySlug);
  const [announce, setAnnounce] = useState(false);
  const [announceAvailable, setAnnounceAvailable] = useState(false);
  const [pollOn, setPollOn] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollMulti, setPollMulti] = useState(false);

  // Load categories for the picker; default to the requested slug, else the
  // last-used one, else the first unlocked category.
  useEffect(() => {
    let active = true;
    apiFetch("/forums/categories")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        const cats: ForumCategory[] = Array.isArray(d?.categories) ? d.categories : [];
        setCategories(cats);
        setAnnounceAvailable(Boolean(d?.announceAvailable));
        const last = localStorage.getItem("bi:forum-last-category");
        const valid = (slug: string) => cats.some((c) => c.slug === slug && !c.isLocked);
        if (valid(categorySlug)) setCategory(categorySlug);
        else if (last && valid(last)) setCategory(last);
        else { const first = cats.find((c) => !c.isLocked); if (first) setCategory(first.slug); }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [categorySlug]);

  const gameMatches = useMemo(() => {
    const q = gameQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return crewGames.filter((g) => g.name.toLowerCase().includes(q)).slice(0, 6);
  }, [gameQuery, crewGames]);

  useEffect(() => {
    if (title || body || linkUrl || type !== "discussion") {
      sessionStorage.setItem(draftKey, JSON.stringify({ title, body, type, linkUrl }));
    } else {
      sessionStorage.removeItem(draftKey);
    }
  }, [title, body, type, linkUrl, draftKey]);

  const linkTrimmed = linkUrl.trim();
  const linkOk = /^https?:\/\/\S+$/i.test(linkTrimmed);
  const showLinkField = type === "resource" || type === "recommendation";
  const linkRequired = type === "resource";
  const linkInvalid = (linkRequired && !linkOk) || (showLinkField && linkTrimmed.length > 0 && !linkOk);
  const meta = POST_TYPE_BY_KEY[type];

  const pollCleanOptions = pollOptions.map((o) => o.trim()).filter((o) => o.length > 0);
  const pollValid = !pollOn || (pollQuestion.trim().length > 0 && pollCleanOptions.length >= 2);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const sendLink = showLinkField && linkOk ? linkTrimmed : undefined;
      localStorage.setItem("bi:forum-last-category", category);
      const pollPayload = pollOn && pollValid
        ? { question: pollQuestion.trim(), options: pollCleanOptions, multi: pollMulti }
        : undefined;
      const r = await apiFetch(`/forums/categories/${category}/threads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          threadType: type,
          ...(sendLink ? { linkUrl: sendLink } : {}),
          ...(uploads.length ? { uploadIds: uploads.map((u) => u.id) } : {}),
          ...(taggedGame ? { appId: taggedGame.appId } : {}),
          ...(announce ? { announce: true } : {}),
          ...(pollPayload ? { poll: pollPayload } : {})
        })
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error ?? "Post failed");
      sessionStorage.removeItem(draftKey);
      onCreated(data.threadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Post failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <BackLink onClick={onCancel} label={`← Back to ${categorySlug}`} />
      <IslandCard>
        <h2 className="island-display" style={{ margin: 0, marginBottom: 12, fontSize: 20, fontWeight: 800 }}>
          {meta.emoji} New {meta.label.toLowerCase()}
        </h2>
        <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
          <span className="island-mono" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}>
            What are you sharing?
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
            {POST_TYPES.map((t) => {
              const active = type === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  className="island-btn"
                  onClick={() => setType(t.key)}
                  aria-pressed={active}
                  style={{
                    textAlign: "left",
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: active ? `${t.accent}22` : islandTheme.color.panelMutedBg,
                    border: `1px solid ${active ? t.accent : islandTheme.color.cardBorder}`,
                    color: islandTheme.color.textPrimary,
                    cursor: "pointer",
                    font: "inherit"
                  }}
                >
                  <span style={{ fontSize: 18, lineHeight: 1.1 }} aria-hidden="true">{t.emoji}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 800 }}>{t.label}</span>
                    <span style={{ display: "block", fontSize: 11, color: islandTheme.color.textMuted, marginTop: 2, lineHeight: 1.35 }}>{t.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <span className="island-mono" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}>
            Category
          </span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ ...islandInputStyle, width: "100%", padding: "10px 14px", fontSize: 14, cursor: "pointer" }}
          >
            {categories.filter((c) => !c.isLocked).map((c) => (
              <option key={c.id} value={c.slug}>{c.icon} {c.name}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <span className="island-mono" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}>
            Title
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
            placeholder={
              type === "memory" ? "Name the moment — e.g. “LAN night 2024, 3am Helldivers”"
              : type === "recommendation" ? "What are you recommending?"
              : type === "resource" ? "What is this tool/guide?"
              : "Be specific — this is the headline"
            }
            style={{ ...islandInputStyle, width: "100%", padding: "10px 14px", fontSize: 14 }}
          />
        </label>
        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <span className="island-mono" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}>
            Body
          </span>
          <MarkdownEditor
            value={body}
            onChange={setBody}
            rows={10}
            placeholder={
              type === "memory" ? "Tell the story. Add photos below, tag who was there…"
              : "Lay out your thoughts. **bold**, *italic*, > quote, - lists, `code`, [links](https://)…"
            }
          />
        </div>
        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <span className="island-mono" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}>
            {type === "memory" ? "📸 Photos" : "🖼️ Images (optional)"}
          </span>
          <ImageDropzone uploads={uploads} onUploadsChange={setUploads} />
        </div>
        {showLinkField ? (
          <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            <span className="island-mono" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}>
              {meta.emoji} Link {linkRequired ? "(required)" : "(optional)"}
            </span>
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              inputMode="url"
              placeholder="https://…"
              style={{
                ...islandInputStyle,
                width: "100%",
                padding: "10px 14px",
                fontSize: 14,
                borderColor: linkInvalid ? islandTheme.color.dangerAccent : islandTheme.color.border
              }}
            />
            <span style={{ fontSize: 12, color: linkInvalid ? islandTheme.color.dangerSoft : islandTheme.color.textMuted }}>
              {linkInvalid
                ? "Enter a full http(s):// link."
                : type === "resource"
                  ? "We'll unfurl a preview card from this link."
                  : "Add a store/link if you have one — optional."}
            </span>
          </div>
        ) : null}
        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <span className="island-mono" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}>
            🎮 Tag a game (optional)
          </span>
          {taggedGame ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 10,
                border: `1px solid ${islandTheme.color.cardBorder}`,
                background: islandTheme.color.panelMutedBg,
                justifySelf: "start"
              }}
            >
              <GameCover
                appId={taggedGame.appId}
                storedUrl={taggedGame.headerImageUrl}
                alt={taggedGame.name}
                style={{ width: 46, height: 21, borderRadius: 4 }}
              />
              <span style={{ fontSize: 13, fontWeight: 700 }}>{taggedGame.name}</span>
              <button
                type="button"
                className="island-btn"
                onClick={() => { setTaggedGame(null); setGameQuery(""); }}
                aria-label="Remove game tag"
                style={{ background: "transparent", border: "none", color: islandTheme.color.textMuted, cursor: "pointer", font: "inherit", fontSize: 13 }}
              >
                ×
              </button>
            </div>
          ) : (
            <>
              <input
                value={gameQuery}
                onChange={(e) => setGameQuery(e.target.value)}
                placeholder="Search the crew library…"
                style={{ ...islandInputStyle, width: "100%", padding: "8px 12px", fontSize: 13 }}
              />
              {gameMatches.length > 0 ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {gameMatches.map((g) => (
                    <button
                      key={g.appId}
                      type="button"
                      className="island-btn"
                      onClick={() => { setTaggedGame(g); setGameQuery(""); }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 10px 4px 4px",
                        borderRadius: 8,
                        border: `1px solid ${islandTheme.color.cardBorder}`,
                        background: islandTheme.color.panelMutedBg,
                        color: islandTheme.color.textPrimary,
                        cursor: "pointer",
                        font: "inherit",
                        fontSize: 12
                      }}
                    >
                      <GameCover appId={g.appId} storedUrl={g.headerImageUrl} alt={g.name} style={{ width: 40, height: 19, borderRadius: 4 }} />
                      {g.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, justifySelf: "start" }}>
            <input type="checkbox" checked={pollOn} onChange={(e) => setPollOn(e.target.checked)} />
            📊 Add a poll
          </label>
          {pollOn ? (
            <div style={{ display: "grid", gap: 8, padding: 12, borderRadius: 10, border: `1px solid ${islandTheme.color.cardBorder}`, background: islandTheme.color.panelMutedBg }}>
              <input
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                maxLength={300}
                placeholder="Ask a question…"
                style={{ ...islandInputStyle, width: "100%", padding: "8px 12px", fontSize: 14 }}
              />
              {pollOptions.map((opt, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    value={opt}
                    onChange={(e) => setPollOptions((o) => o.map((x, j) => (j === i ? e.target.value : x)))}
                    maxLength={120}
                    placeholder={`Option ${i + 1}`}
                    style={{ ...islandInputStyle, flex: 1, padding: "7px 12px", fontSize: 13 }}
                  />
                  {pollOptions.length > 2 ? (
                    <button
                      type="button"
                      onClick={() => setPollOptions((o) => o.filter((_, j) => j !== i))}
                      aria-label="Remove option"
                      style={{ background: "transparent", border: "none", color: islandTheme.color.textMuted, cursor: "pointer", font: "inherit", fontSize: 16 }}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
              {pollOptions.length < 10 ? (
                <button
                  type="button"
                  onClick={() => setPollOptions((o) => [...o, ""])}
                  style={{ background: "transparent", border: "none", color: islandTheme.color.primaryGlow, cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 700, justifySelf: "start", padding: 0 }}
                >
                  + Add option
                </button>
              ) : null}
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: islandTheme.color.textSubtle }}>
                <input type="checkbox" checked={pollMulti} onChange={(e) => setPollMulti(e.target.checked)} />
                Allow multiple choices
              </label>
            </div>
          ) : null}
        </div>

        {announceAvailable ? (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
            📣 Also announce this to the Discord
          </label>
        ) : null}

        {error ? (
          <p style={{ margin: "0 0 10px", fontSize: 12, color: islandTheme.color.dangerText }}>{error}</p>
        ) : null}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
            Posting earns ₦5 · {body.length} chars
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <IslandButton onClick={onCancel}>Cancel</IslandButton>
            <IslandButton variant="primary" onClick={submit} disabled={busy || !category || title.trim().length < 3 || body.trim().length < 2 || linkInvalid || (linkRequired && !linkOk) || (pollOn && !pollValid)}>
              {busy ? "Posting…" : `Post ${meta.label}`}
            </IslandButton>
          </div>
        </div>
      </IslandCard>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      className="island-btn"
      onClick={onClick}
      style={{
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
      {label}
    </button>
  );
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Compact one-line link summary for feed rows. */
function FeedLinkLine({ linkUrl, preview }: { linkUrl: string; preview: ForumLinkPreview | null }) {
  return (
    <div style={{ marginTop: 4, fontSize: 12, color: islandTheme.color.textSubtle, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <span aria-hidden="true">🔗</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
        {preview?.title ? (
          <span style={{ color: islandTheme.color.textPrimary, fontWeight: 600 }}>{preview.title}</span>
        ) : null}
        {preview?.title ? " · " : ""}
        <span style={{ color: islandTheme.color.primaryGlow }}>{preview?.siteName ?? domainOf(linkUrl)}</span>
      </span>
    </div>
  );
}

/** Rich unfurl card shown in the thread header for resource/recommendation posts. */
function LinkPreviewCard({ linkUrl, preview }: { linkUrl: string; preview: ForumLinkPreview | null }) {
  const domain = preview?.siteName ?? domainOf(linkUrl);
  const clamp2: React.CSSProperties = {
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical"
  };
  return (
    <a
      href={linkUrl}
      target="_blank"
      rel="noopener noreferrer nofollow"
      style={{
        display: "flex",
        gap: 12,
        marginTop: 14,
        padding: 10,
        borderRadius: 10,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        background: islandTheme.color.panelMutedBg,
        textDecoration: "none",
        color: islandTheme.color.textPrimary,
        alignItems: "center"
      }}
    >
      {preview?.imageUrl ? (
        <img
          src={preview.imageUrl}
          alt=""
          loading="lazy"
          style={{ width: 104, height: 64, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: `1px solid ${islandTheme.color.cardBorder}` }}
        />
      ) : (
        <div style={{ width: 104, height: 64, borderRadius: 8, flexShrink: 0, background: islandTheme.color.panelBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }} aria-hidden="true">
          🔗
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, color: islandTheme.color.primaryGlow, marginBottom: 2 }}>{domain}</div>
        <div style={{ fontSize: 14, fontWeight: 700, wordBreak: "break-word", ...clamp2 }}>{preview?.title ?? linkUrl}</div>
        {preview?.description ? (
          <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2, ...clamp2 }}>{preview.description}</div>
        ) : null}
      </div>
    </a>
  );
}

function GameChip({ game }: { game: ForumThreadGame }) {
  return (
    <span
      title={game.name}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        marginLeft: 8,
        padding: "1px 8px 1px 2px",
        borderRadius: 6,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        background: islandTheme.color.panelMutedBg,
        fontSize: 12,
        fontWeight: 700,
        color: islandTheme.color.textSubtle,
        verticalAlign: "middle",
        maxWidth: 220,
        overflow: "hidden",
        whiteSpace: "nowrap"
      }}
    >
      <GameCover
        appId={game.appId}
        storedUrl={game.headerImageUrl}
        alt=""
        style={{ width: 32, height: 15, borderRadius: 3, flexShrink: 0 }}
      />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{game.name}</span>
    </span>
  );
}

function PinGlyph() {
  return (
    <span
      title="Pinned"
      aria-label="pinned"
      style={{ fontSize: 13, color: islandTheme.color.primaryGlow, flexShrink: 0 }}
    >
      📌
    </span>
  );
}

function LockGlyph() {
  return (
    <span
      title="Locked"
      aria-label="locked"
      style={{ fontSize: 13, color: islandTheme.color.textMuted, flexShrink: 0 }}
    >
      🔒
    </span>
  );
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString();
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
