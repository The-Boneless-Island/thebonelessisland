import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";
import { IslandButton, IslandCard, IslandTag, islandInputStyle, islandTagStyle } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import type {
  ForumCategory,
  ForumFeedSort,
  ForumFeedThread,
  ForumPost,
  ForumRecentThread,
  ForumStats,
  ForumThreadDetail,
  ForumThreadListItem,
  MeProfile
} from "../types.js";

type ForumView =
  | { mode: "home" }
  | { mode: "category"; slug: string }
  | { mode: "thread"; threadId: number }
  | { mode: "compose"; categorySlug: string };

type ForumsPageProps = {
  profile: MeProfile | null;
  isAdmin: boolean;
};

export function ForumsPage({ profile, isAdmin }: ForumsPageProps) {
  const [view, setView] = useState<ForumView>({ mode: "home" });

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <ForumHeader />
      {view.mode === "home" ? (
        <ForumHome
          profile={profile}
          onSelectCategory={(slug) => setView({ mode: "category", slug })}
          onSelectThread={(threadId) => setView({ mode: "thread", threadId })}
          onCompose={(slug) => setView({ mode: "compose", categorySlug: slug })}
        />
      ) : null}
      {view.mode === "category" ? (
        <CategoryView
          slug={view.slug}
          onBack={() => setView({ mode: "home" })}
          onSelectThread={(threadId) => setView({ mode: "thread", threadId })}
          onCompose={() => setView({ mode: "compose", categorySlug: view.slug })}
        />
      ) : null}
      {view.mode === "thread" ? (
        <ThreadView
          threadId={view.threadId}
          profile={profile}
          isAdmin={isAdmin}
          onBack={() => setView({ mode: "home" })}
          onCategory={(slug) => setView({ mode: "category", slug })}
        />
      ) : null}
      {view.mode === "compose" ? (
        <ComposeView
          categorySlug={view.categorySlug}
          onCancel={() => setView({ mode: "category", slug: view.categorySlug })}
          onCreated={(threadId) => setView({ mode: "thread", threadId })}
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
          fontSize: 11,
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
  onCompose: (slug: string) => void;
}) {
  const [categories, setCategories] = useState<ForumCategory[] | null>(null);
  const [stats, setStats] = useState<ForumStats | null>(null);
  const [feed, setFeed] = useState<ForumFeedThread[] | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [sort, setSort] = useState<ForumFeedSort>("latest");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ForumRecentThread[] | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  const loadShell = useCallback(async () => {
    const [catsRes, statsRes] = await Promise.all([
      apiFetch("/forums/categories").catch(() => null),
      apiFetch("/forums/stats").catch(() => null)
    ]);
    let cats: { categories?: ForumCategory[] } | null = null;
    if (catsRes && catsRes.ok) {
      cats = await catsRes.json().catch(() => null);
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
          mine: data.mine ?? { threadCount: 0, postCount: 0 },
        };
      }
    }
    setCategories(cats?.categories ?? []);
    setStats(st);
  }, []);

  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    setFeedError(null);
    try {
      const params = new URLSearchParams();
      params.set("sort", sort);
      params.set("limit", "30");
      if (categoryFilter) params.set("category", categoryFilter);
      const r = await apiFetch(`/forums/threads?${params.toString()}`);
      if (!r.ok) {
        const data = await r.json().catch(() => null);
        throw new Error(data?.error ?? `Feed load failed (${r.status})`);
      }
      const data = await r.json();
      setFeed(data.threads ?? []);
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : "Feed load failed");
      setFeed([]);
    } finally {
      setFeedLoading(false);
    }
  }, [sort, categoryFilter]);

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

  const noCategories = categories !== null && categories.length === 0;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <ForumHeroBar
        statsLine={stats
          ? `${stats.threadsTotal ?? 0} threads · ${stats.postsTotal ?? 0} posts · ${stats.postsToday ?? 0} new today`
          : null}
        onStartDiscussion={() => setComposerOpen((v) => !v)}
        composerOpen={composerOpen}
        canCompose={!noCategories}
      />

      {composerOpen && categories ? (
        <CategoryPickerCard
          categories={categories}
          onPick={(slug) => { setComposerOpen(false); onCompose(slug); }}
          onCancel={() => setComposerOpen(false)}
        />
      ) : null}

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search threads by title…"
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
              <RecentRow key={t.id} thread={t} firstRow={i === 0} onSelect={() => onSelectThread(t.id)} />
            ))
          )}
        </IslandCard>
      ) : (
        <>
          {noCategories ? <ForumsEmptyState /> : null}

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
            onSelect={onSelectThread}
            onClearFilter={() => { setCategoryFilter(null); setSort("latest"); }}
          />

          {categories && categories.length > 0 ? (
            <BrowseCategoriesCollapsible categories={categories} onSelect={onSelectCategory} />
          ) : null}

          {stats && (stats.topAuthors?.length ?? 0) > 0 ? <TopAuthorsCard stats={stats} /> : null}
        </>
      )}
    </div>
  );
}

// ── Hero / Composer / Empty State ───────────────────────────────────────────

function ForumHeroBar({
  statsLine,
  onStartDiscussion,
  composerOpen,
  canCompose
}: {
  statsLine: string | null;
  onStartDiscussion: () => void;
  composerOpen: boolean;
  canCompose: boolean;
}) {
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
        <div className="island-display" style={{ fontSize: 17, fontWeight: 800 }}>
          Have something to say?
        </div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 4 }}>
          {statsLine ?? "Loading stats…"}
        </div>
      </div>
      <IslandButton variant="primary" onClick={onStartDiscussion} disabled={!canCompose}>
        {composerOpen ? "× Close" : "+ Start a Discussion"}
      </IslandButton>
    </IslandCard>
  );
}

function CategoryPickerCard({
  categories,
  onPick,
  onCancel
}: {
  categories: ForumCategory[];
  onPick: (slug: string) => void;
  onCancel: () => void;
}) {
  return (
    <IslandCard style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span className="island-mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: islandTheme.color.textMuted }}>
          Pick a category for your post
        </span>
        <button
          type="button"
          className="island-btn"
          onClick={onCancel}
          style={{ background: "transparent", border: "none", color: islandTheme.color.textMuted, fontSize: 13, cursor: "pointer", font: "inherit" }}
        >
          Cancel
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
        {categories.filter((c) => !c.isLocked).map((c) => (
          <button
            key={c.id}
            type="button"
            className="island-btn"
            onClick={() => onPick(c.slug)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 10,
              background: `${c.accentColor}1f`,
              border: `1px solid ${c.accentColor}55`,
              color: islandTheme.color.textPrimary,
              cursor: "pointer",
              font: "inherit",
              textAlign: "left"
            }}
          >
            <span style={{ fontSize: 18 }}>{c.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{c.name}</span>
          </button>
        ))}
      </div>
    </IslandCard>
  );
}

function ForumsEmptyState() {
  return (
    <IslandCard style={{ padding: 18, textAlign: "center" }}>
      <div style={{ fontSize: 30, marginBottom: 8 }}>🏝️</div>
      <h3 className="island-display" style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
        No categories yet
      </h3>
      <p style={{ margin: "6px 0 0", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
        Forums backend is wired up but no categories were found.<br />
        Run <code style={{ background: islandTheme.color.panelMutedBg, padding: "2px 6px", borderRadius: 4 }}>npm run db:migrate</code> from <code style={{ background: islandTheme.color.panelMutedBg, padding: "2px 6px", borderRadius: 4 }}>apps/api</code> to create the schema and seed defaults, or have a Parent admin create categories from <strong>Admin → Forum Moderation → Categories</strong>.
      </p>
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
              fontSize: 10,
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
  onSelect,
  onClearFilter
}: {
  threads: ForumFeedThread[] | null;
  loading: boolean;
  error: string | null;
  sort: ForumFeedSort;
  categoryFilter: string | null;
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
      {loading ? (
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
        threads.map((t, i) => (
          <FeedRow key={t.id} thread={t} firstRow={i === 0} onSelect={() => onSelect(t.id)} />
        ))
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
          <div style={{ fontSize: 11, color: islandTheme.color.textMuted, marginTop: 2 }}>
            <span style={{ color: thread.categoryAccent }}>{thread.categoryIcon} {thread.categoryName}</span>
            {" · "}
            by {thread.author.displayName}
            {" · "}
            {thread.replyCount} repl{thread.replyCount === 1 ? "y" : "ies"}
            {" · "}
            {thread.viewCount} view{thread.viewCount === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: islandTheme.color.textMuted, whiteSpace: "nowrap", textAlign: "right" }}>
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
        <span className="island-mono" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: islandTheme.color.textMuted }}>
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
            <span className="island-mono" style={{ fontSize: 10, color: islandTheme.color.textMuted }}>
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
        fontSize: 11,
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
          <div className="island-mono" style={{ fontSize: 10, color: islandTheme.color.textMuted, marginTop: 2 }}>
            {category.threadCount} thread{category.threadCount === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: islandTheme.color.textSubtle, lineHeight: 1.45, marginBottom: 10 }}>
        {category.description}
      </div>
      {category.lastActivity ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: islandTheme.color.textMuted }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            ↳ {category.lastActivity.threadTitle}
          </span>
          <span>{formatRelative(category.lastActivity.at)}</span>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: islandTheme.color.textMuted, fontStyle: "italic" }}>
          No threads yet — be first.
        </div>
      )}
    </button>
  );
}

function RecentRow({
  thread,
  firstRow,
  onSelect
}: {
  thread: ForumRecentThread;
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
        cursor: "pointer",
        font: "inherit",
        color: islandTheme.color.textPrimary,
        textAlign: "left"
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = islandTheme.color.panelMutedBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700 }}>
          {thread.isPinned ? <PinGlyph /> : null}
          {thread.isLocked ? <LockGlyph /> : null}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{thread.title}</span>
        </div>
        <div style={{ fontSize: 11, color: islandTheme.color.textMuted, marginTop: 2 }}>
          <span style={{ color: thread.categoryAccent ?? islandTheme.color.textSubtle }}>
            {thread.categoryIcon} {thread.categoryName}
          </span>
          {" · "}
          by {thread.author.displayName}
          {" · "}
          {thread.replyCount} repl{thread.replyCount === 1 ? "y" : "ies"}
        </div>
      </div>
      <div style={{ fontSize: 11, color: islandTheme.color.textMuted, whiteSpace: "nowrap" }}>
        {formatRelative(thread.lastReplyAt ?? thread.createdAt)}
      </div>
    </button>
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
          fontSize: 11,
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
          <div style={{ fontSize: 11, color: islandTheme.color.textMuted, marginTop: 2 }}>
            by {thread.author.displayName}
          </div>
        </div>
      </div>
      <ColumnStat value={thread.replyCount} label="replies" />
      <ColumnStat value={thread.viewCount} label="views" />
      <div style={{ fontSize: 11, color: islandTheme.color.textMuted, textAlign: "right" }}>
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
      <div className="island-mono" style={{ fontSize: 9, color: islandTheme.color.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {label}
      </div>
    </div>
  );
}

// ── Thread View ─────────────────────────────────────────────────────────────

function ThreadView({
  threadId,
  profile,
  isAdmin,
  onBack,
  onCategory
}: {
  threadId: number;
  profile: MeProfile | null;
  isAdmin: boolean;
  onBack: () => void;
  onCategory: (slug: string) => void;
}) {
  const [thread, setThread] = useState<ForumThreadDetail | null>(null);
  const [posts, setPosts] = useState<ForumPost[] | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function postReply() {
    if (!reply.trim() || busy || !thread) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch(`/forums/threads/${threadId}/posts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: reply.trim() })
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error ?? "Reply failed");
      setReply("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reply failed");
    } finally {
      setBusy(false);
    }
  }

  async function reactPost(postId: number) {
    setPosts((cur) => cur?.map((p) => p.id === postId
      ? { ...p, userReacted: !p.userReacted, reactionCount: p.reactionCount + (p.userReacted ? -1 : 1) }
      : p) ?? cur);
    try {
      await apiFetch(`/forums/posts/${postId}/react`, { method: "POST" });
    } catch {
      void load();
    }
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
              {thread.title}
            </h1>
            <div style={{ marginTop: 6, fontSize: 12, color: islandTheme.color.textMuted }}>
              {posts.length} post{posts.length === 1 ? "" : "s"} · {thread.viewCount.toLocaleString()} views · started {formatRelative(thread.createdAt)}
            </div>
          </div>
          {isAdmin ? (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <ModButton onClick={() => modAction("isPinned", !thread.isPinned)}>
                {thread.isPinned ? "Unpin" : "Pin"}
              </ModButton>
              <ModButton onClick={() => modAction("isLocked", !thread.isLocked)}>
                {thread.isLocked ? "Unlock" : "Lock"}
              </ModButton>
              <ModButton onClick={deleteThread} danger>
                Delete
              </ModButton>
            </div>
          ) : null}
        </div>
      </IslandCard>

      {posts.map((post, idx) => (
        <PostCard
          key={post.id}
          post={post}
          idx={idx + 1}
          canEdit={profile?.discordUserId === post.author.discordUserId || isAdmin}
          isOwner={profile?.discordUserId === post.author.discordUserId}
          onReact={() => reactPost(post.id)}
          onEdit={() => editPost(post.id, post.body)}
          onDelete={() => deletePost(post.id)}
          onReport={() => reportPost(post.id)}
        />
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
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={5}
            placeholder="Be cool. Stay on topic. Markdown-ish: *italic*, **bold**, > quote"
            style={{ ...islandInputStyle, width: "100%", padding: "10px 14px", fontSize: 14, fontFamily: "inherit", resize: "vertical" }}
          />
          {error ? (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: islandTheme.color.dangerText }}>{error}</p>
          ) : null}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <span style={{ fontSize: 11, color: islandTheme.color.textMuted }}>
              {reply.length} char{reply.length === 1 ? "" : "s"} · earns ₦1
            </span>
            <IslandButton variant="primary" onClick={postReply} disabled={busy || reply.trim().length < 2}>
              {busy ? "Posting…" : "Post Reply"}
            </IslandButton>
          </div>
        </IslandCard>
      )}
    </div>
  );
}

function PostCard({
  post,
  idx,
  canEdit,
  isOwner,
  onReact,
  onEdit,
  onDelete,
  onReport
}: {
  post: ForumPost;
  idx: number;
  canEdit: boolean;
  isOwner: boolean;
  onReact: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
}) {
  return (
    <IslandCard
      style={{
        padding: 0,
        overflow: "hidden",
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
          <div className="island-mono" style={{ fontSize: 10, color: islandTheme.color.textMuted }}>
            @{post.author.username}
          </div>
          {post.isOp ? <IslandTag tone="primary">Op</IslandTag> : null}
        </div>

        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 11, color: islandTheme.color.textMuted, gap: 12, flexWrap: "wrap" }}>
            <span>#{idx} · {formatAbsolute(post.createdAt)}</span>
            {post.editedAt ? <span style={{ fontStyle: "italic" }}>edited {formatRelative(post.editedAt)}</span> : null}
          </div>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: post.isDeleted ? islandTheme.color.textMuted : islandTheme.color.textPrimary,
              fontStyle: post.isDeleted ? "italic" : "normal"
            }}
          >
            {post.isDeleted ? "[deleted]" : post.body}
          </div>
          {!post.isDeleted ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
              <button
                type="button"
                className="island-btn"
                onClick={onReact}
                style={{
                  background: post.userReacted ? islandTheme.color.primary : islandTheme.color.panelMutedBg,
                  color: post.userReacted ? islandTheme.color.primaryText : islandTheme.color.textSubtle,
                  border: `1px solid ${post.userReacted ? islandTheme.color.primary : islandTheme.color.cardBorder}`,
                  borderRadius: 999,
                  padding: "4px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                  font: "inherit"
                }}
              >
                👍 {post.reactionCount}
              </button>
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
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer",
        font: "inherit"
      }}
    >
      {children}
    </button>
  );
}

// ── Compose ─────────────────────────────────────────────────────────────────

function ComposeView({
  categorySlug,
  onCancel,
  onCreated
}: {
  categorySlug: string;
  onCancel: () => void;
  onCreated: (threadId: number) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch(`/forums/categories/${categorySlug}/threads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim() })
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error ?? "Post failed");
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
          New thread
        </h2>
        <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <span className="island-mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}>
            Title
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
            placeholder="Be specific — this is the headline"
            style={{ ...islandInputStyle, width: "100%", padding: "10px 14px", fontSize: 14 }}
          />
        </label>
        <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <span className="island-mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted }}>
            Body
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            placeholder="Lay out your thoughts. Markdown-ish: *italic*, **bold**, > quote, ```code```"
            style={{ ...islandInputStyle, width: "100%", padding: "10px 14px", fontSize: 14, fontFamily: "inherit", resize: "vertical" }}
          />
        </label>
        {error ? (
          <p style={{ margin: "0 0 10px", fontSize: 12, color: islandTheme.color.dangerText }}>{error}</p>
        ) : null}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: islandTheme.color.textMuted }}>
            Posting earns ₦5 · {body.length} chars
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <IslandButton onClick={onCancel}>Cancel</IslandButton>
            <IslandButton variant="primary" onClick={submit} disabled={busy || title.trim().length < 3 || body.trim().length < 2}>
              {busy ? "Posting…" : "Post Thread"}
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
