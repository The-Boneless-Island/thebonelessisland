import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { IslandCard, IslandTag, islandTagStyle, getTagColor } from "../islandUi.js";
import { useDayNight } from "../scene/useDayNight.js";
import { islandTheme } from "../theme.js";
import type { GeneralNewsItem } from "../types.js";

type GamingNewsPageProps = {
  generalNews: GeneralNewsItem[];
};

export function GamingNewsPage({ generalNews }: GamingNewsPageProps) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <h1 className="island-display" style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>
          Gaming News
        </h1>
        <div
          className="island-mono"
          style={{
            marginTop: 4,
            fontSize: 11,
            color: islandTheme.color.textMuted,
            textTransform: "uppercase",
            letterSpacing: "0.06em"
          }}
        >
          Fresh from the shore · AI-curated for the crew
        </div>
      </div>
      <GamingNewsFeed news={generalNews} />
    </div>
  );
}

// ── Types & Constants ─────────────────────────────────────────────────────────

const KNOWN_GENRES = new Set([
  "FPS", "RPG", "Strategy", "Horror", "Platformer", "Survival",
  "Battle Royale", "MOBA", "Racing", "Puzzle", "Fighting", "Sim", "MMO"
]);

const KNOWN_PLATFORMS = new Set(["PC", "PlayStation", "Xbox", "Nintendo", "Mobile", "VR"]);

function prettyHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type NewsTab = "all" | "top_news" | "community" | "personal";

const NEWS_TABS: Array<{ id: NewsTab; label: string; emoji: string }> = [
  { id: "all", label: "All", emoji: "" },
  { id: "top_news", label: "Breaking", emoji: "🔥" },
  { id: "community", label: "Trending", emoji: "🌊" },
  { id: "personal", label: "Your games", emoji: "🎮" }
];

const LABEL_COLORS: Record<string, string> = {
  top_news: islandTheme.color.warnAccent,
  community: islandTheme.color.toolAccent,
  personal: islandTheme.color.successAccent
};

const LABEL_LABELS: Record<string, string> = {
  top_news: "🔥 Breaking",
  community: "🌊 Trending",
  personal: "🎮 Crew pick"
};

const FEATURED_COUNT = 4;   // 1 hero + 3 small
const LIST_INITIAL = 10;    // list rows shown before "Load more"

// ── Filter Pill Row ───────────────────────────────────────────────────────────

type FilterPillRowProps = {
  label: string;
  options: string[];
  activeTags: Set<string>;
  onTagClick: (tag: string) => void;
};

function FilterPillRow({ label, options, activeTags, onTagClick }: FilterPillRowProps) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <span
        className="island-mono"
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          color: islandTheme.color.textMuted,
          flexShrink: 0
        }}
      >
        {label}
      </span>
      {options.map((opt) => (
        <IslandTag
          key={opt}
          color={getTagColor(opt)}
          active={activeTags.has(opt)}
          onClick={() => onTagClick(opt)}
        >
          {opt}
        </IslandTag>
      ))}
    </div>
  );
}

// ── Main Feed ─────────────────────────────────────────────────────────────────

function GamingNewsFeed({ news }: { news: GeneralNewsItem[] }) {
  const [tab, setTab] = useState<NewsTab>("all");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<"latest" | "top">("latest");
  const [showAll, setShowAll] = useState(false);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<string>>(new Set());
  const [activeArticle, setActiveArticle] = useState<GeneralNewsItem | null>(null);
  const [userVotes, setUserVotes] = useState<Record<number, 1 | -1 | 0>>({});

  function handleVote(articleId: number, dir: 1 | -1) {
    const current = userVotes[articleId] ?? 0;
    const next: 0 | 1 | -1 = current === dir ? 0 : dir;
    setUserVotes((prev) => ({ ...prev, [articleId]: next }));
    fetch(`/api/news/general/${articleId}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: next }),
      credentials: "include"
    }).catch(() => {});
  }

  function handleTagClick(tag: string) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
    setShowAll(false);
  }

  const availableGenres = useMemo(() => {
    const freq: Record<string, number> = {};
    for (const item of news) {
      for (const tag of item.aiTags ?? []) {
        if (KNOWN_GENRES.has(tag)) freq[tag] = (freq[tag] ?? 0) + 1;
      }
    }
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [news]);

  const availablePlatforms = useMemo(() => {
    const freq: Record<string, number> = {};
    for (const item of news) {
      for (const tag of item.aiTags ?? []) {
        if (KNOWN_PLATFORMS.has(tag)) freq[tag] = (freq[tag] ?? 0) + 1;
      }
    }
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [news]);

  function resetFilters() {
    setActiveTags(new Set());
    setShowAll(false);
  }

  const filtered = useMemo(() => {
    let items = tab === "all" ? news : news.filter((item) => item.aiLabel === tab);
    if (activeTags.size > 0) {
      items = items.filter((i) => [...activeTags].every((t) => (i.aiTags ?? []).includes(t)));
    }
    if (sortMode === "top") {
      items = [...items].sort((a, b) => {
        const sa = (a.aiRelevanceScore ?? 0) + (a.upvotes - a.downvotes * 0.5) * 0.08;
        const sb = (b.aiRelevanceScore ?? 0) + (b.upvotes - b.downvotes * 0.5) * 0.08;
        return sb - sa;
      });
    }
    return items;
  }, [news, tab, activeTags, sortMode]);

  const hero = filtered[0] ?? null;
  const featuredSmall = filtered.slice(1, FEATURED_COUNT);
  const rest = filtered.slice(FEATURED_COUNT);
  const visibleRest = showAll ? rest : rest.slice(0, LIST_INITIAL);
  const hasMore = rest.length > LIST_INITIAL && !showAll;

  function revealSpoiler(id: string) {
    setRevealedSpoilers((prev) => new Set([...prev, id]));
  }

  return (
    <>
      <style>{`
        .news-featured-rail {
          display: grid;
          grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
          gap: 10px;
        }
        .news-featured-small {
          display: grid;
          gap: 10px;
          grid-auto-rows: 1fr;
        }
        @media (max-width: 820px) {
          .news-featured-rail { grid-template-columns: 1fr; }
          .news-featured-small {
            grid-auto-rows: auto;
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (max-width: 520px) {
          .news-featured-small { grid-template-columns: 1fr; }
        }
      `}</style>
      <section style={{ display: "grid", gap: 14 }}>
        {/* Tab bar */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {NEWS_TABS.map((t) => {
            const active = t.id === tab;
            const count = t.id === "all" ? news.length : news.filter((n) => n.aiLabel === t.id).length;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTab(t.id); resetFilters(); }}
                style={{
                  border: "none",
                  background: active ? "rgba(37, 99, 235, 0.22)" : "transparent",
                  color: active ? islandTheme.color.textPrimary : islandTheme.color.textSubtle,
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "6px 14px",
                  borderRadius: 999,
                  cursor: "pointer",
                  font: "inherit",
                  display: "flex",
                  alignItems: "center",
                  gap: 5
                }}
              >
                {t.emoji ? <span>{t.emoji}</span> : null}
                {t.label}
                {count > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      background: active ? "rgba(37, 99, 235, 0.35)" : islandTheme.color.panelMutedBg,
                      color: islandTheme.color.textMuted,
                      borderRadius: 999,
                      padding: "1px 6px",
                      fontWeight: 700
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 2 }}>
            {(["latest", "top"] as const).map((mode) => {
              const active = sortMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSortMode(mode)}
                  className="island-mono"
                  style={{
                    border: `1px solid ${active ? islandTheme.color.primary : islandTheme.color.border}`,
                    background: active ? "rgba(37, 99, 235, 0.15)" : "transparent",
                    color: active ? islandTheme.color.textPrimary : islandTheme.color.textSubtle,
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: 999,
                    cursor: "pointer",
                    font: "inherit",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em"
                  }}
                >
                  {mode === "latest" ? "Latest" : "Top"}
                </button>
              );
            })}
          </div>
        </div>

        {availableGenres.length > 0 && (
          <FilterPillRow
            label="Genre"
            options={availableGenres}
            activeTags={activeTags}
            onTagClick={handleTagClick}
          />
        )}

        {availablePlatforms.length > 0 && (
          <FilterPillRow
            label="Platform"
            options={availablePlatforms}
            activeTags={activeTags}
            onTagClick={handleTagClick}
          />
        )}

        {activeTags.size > 0 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span className="island-mono" style={{ fontSize: 10, color: islandTheme.color.textMuted, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Active filters
            </span>
            {[...activeTags].map((tag) => (
              <IslandTag
                key={tag}
                color={getTagColor(tag)}
                active
                onClick={() => handleTagClick(tag)}
              >
                {tag} ×
              </IslandTag>
            ))}
            <button
              type="button"
              onClick={resetFilters}
              className="island-mono"
              style={{
                fontSize: 10, color: islandTheme.color.textMuted, background: "transparent",
                border: "none", cursor: "pointer", font: "inherit", padding: "2px 4px"
              }}
            >
              Clear all
            </button>
          </div>
        )}

        {news.length === 0 ? (
          <NewsEmptyState />
        ) : filtered.length === 0 ? (
          <IslandCard style={{ padding: "16px 18px" }}>
            <div style={{ fontSize: 13, color: islandTheme.color.textSubtle }}>
              Nothing matches these filters right now. Check back after the next curation pass.
            </div>
          </IslandCard>
        ) : (
          <>
            {(hero || featuredSmall.length > 0) && (
              <div className="news-featured-rail">
                {hero && (
                  <NewsHeroCard
                    item={hero}
                    spoilerRevealed={revealedSpoilers.has(hero.externalId)}
                    onRevealSpoiler={() => revealSpoiler(hero.externalId)}
                    onOpen={() => setActiveArticle(hero)}
                    onTagClick={handleTagClick}
                    userVote={userVotes[hero.id] ?? 0}
                    onVote={(dir) => handleVote(hero.id, dir)}
                  />
                )}
                {featuredSmall.length > 0 && (
                  <div className="news-featured-small">
                    {featuredSmall.map((item) => (
                      <NewsCard
                        key={item.externalId}
                        item={item}
                        spoilerRevealed={revealedSpoilers.has(item.externalId)}
                        onRevealSpoiler={() => revealSpoiler(item.externalId)}
                        onOpen={() => setActiveArticle(item)}
                        onTagClick={handleTagClick}
                        userVote={userVotes[item.id] ?? 0}
                        onVote={(dir) => handleVote(item.id, dir)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {visibleRest.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {visibleRest.map((item) => (
                  <NewsListRow
                    key={item.externalId}
                    item={item}
                    spoilerRevealed={revealedSpoilers.has(item.externalId)}
                    onRevealSpoiler={() => revealSpoiler(item.externalId)}
                    onOpen={() => setActiveArticle(item)}
                    onTagClick={handleTagClick}
                    userVote={userVotes[item.id] ?? 0}
                    onVote={(dir) => handleVote(item.id, dir)}
                  />
                ))}
              </div>
            )}

            {hasMore && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
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
                {rest.length - LIST_INITIAL} more stories from the shore →
              </button>
            )}
          </>
        )}
      </section>

      {activeArticle && (
        <NewsArticleModal
          item={activeArticle}
          userVote={userVotes[activeArticle.id] ?? 0}
          onVote={(dir) => handleVote(activeArticle.id, dir)}
          onClose={() => setActiveArticle(null)}
        />
      )}
    </>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function NewsEmptyState() {
  return (
    <IslandCard style={{ padding: "20px 22px" }}>
      <div style={{ display: "grid", gap: 12 }}>
        {[0, 1].map((i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "40px 1fr",
              gap: 12,
              alignItems: "start",
              opacity: 0.4 - i * 0.1
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: islandTheme.color.panelMutedBg,
                animation: "shimmer 1.6s ease-in-out infinite"
              }}
            />
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ height: 13, borderRadius: 6, background: islandTheme.color.panelMutedBg, width: "70%" }} />
              <div style={{ height: 11, borderRadius: 6, background: islandTheme.color.panelMutedBg, width: "90%" }} />
              <div style={{ height: 11, borderRadius: 6, background: islandTheme.color.panelMutedBg, width: "55%" }} />
            </div>
          </div>
        ))}
        <p style={{ margin: 0, fontSize: 12, color: islandTheme.color.textMuted, lineHeight: 1.5 }}>
          Curation is running — the tide brings in fresh picks every few minutes. Sync your Steam library to prime the feed.
        </p>
      </div>
      <style>{`
        @keyframes shimmer {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>
    </IslandCard>
  );
}

// ── Hero Card ─────────────────────────────────────────────────────────────────

function NewsHeroCard({
  item,
  spoilerRevealed,
  onRevealSpoiler,
  onOpen,
  onTagClick,
  userVote,
  onVote
}: {
  item: GeneralNewsItem;
  spoilerRevealed: boolean;
  onRevealSpoiler: () => void;
  onOpen: () => void;
  onTagClick?: (tag: string) => void;
  userVote: 1 | -1 | 0;
  onVote: (dir: 1 | -1) => void;
}) {
  const { mode } = useDayNight();

  const isSpoiler = item.aiSpoilerWarning && !spoilerRevealed;
  const summary = item.aiSummary ?? truncateContents(item.contents, 200);
  const labelColor = LABEL_COLORS[item.aiLabel ?? ""] ?? islandTheme.color.textMuted;
  const labelText = LABEL_LABELS[item.aiLabel ?? ""] ?? null;
  const displayTags = (item.aiTags ?? []).slice(0, 3);
  const whyText =
    item.aiWhyRecommended ??
    ((item.matchedTags?.length ?? 0) > 0
      ? `Crew match: ${item.matchedTags.slice(0, 2).join(", ")}`
      : item.sourceName);
  const netVotes = ((item.upvotes ?? 0) - (item.downvotes ?? 0)) + userVote;

  function handleShare(e: React.MouseEvent) {
    e.stopPropagation();
    if (navigator.share) {
      navigator.share({ title: item.title, url: item.url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(item.url).catch(() => {});
    }
  }

  function handleVote(e: React.MouseEvent, dir: 1 | -1) {
    e.stopPropagation();
    onVote(dir);
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(); }}
      style={{
        position: "relative",
        borderRadius: 16,
        overflow: "hidden",
        background: item.imageUrl
          ? mode === "day"
            ? `linear-gradient(135deg, rgba(240,248,255,0.90) 40%, rgba(240,248,255,0.65) 75%, rgba(240,248,255,0.25) 100%), url("${item.imageUrl}") center / cover no-repeat`
            : `linear-gradient(135deg, rgba(8,16,34,0.92) 40%, rgba(8,16,34,0.6) 75%, rgba(8,16,34,0.25) 100%), url("${item.imageUrl}") center / cover no-repeat`
          : `linear-gradient(135deg, rgba(37,99,235,0.28) 0%, ${islandTheme.color.panelBg} 80%)`,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        display: "flex",
        flexDirection: "column",
        transition: "transform 180ms ease, box-shadow 180ms ease",
        cursor: "pointer"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 20px 45px rgba(0,0,0,0.35)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{ padding: "18px 20px 12px", display: "grid", gap: 8, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span className="island-mono" style={{ fontSize: 10, color: islandTheme.color.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {item.sourceName}
          </span>
          {labelText && (
            <span className="island-mono" style={islandTagStyle({ color: labelColor })}>
              {labelText}
            </span>
          )}
        </div>

        <h3
          className="island-display"
          style={{ margin: 0, fontSize: "clamp(15px, 2vw, 19px)", lineHeight: 1.15, color: islandTheme.color.textPrimary }}
        >
          {item.aiTitle ?? item.title}
        </h3>

        {item.aiSubtitle && (
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, color: islandTheme.color.textSubtle, opacity: 0.85 }}>
            {item.aiSubtitle}
          </p>
        )}

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {displayTags.map((tag) => (
            <TagPill key={tag} tag={tag} onTagClick={onTagClick} />
          ))}
        </div>

        {isSpoiler ? (
          <SpoilerBlock onReveal={(e) => { e.stopPropagation(); onRevealSpoiler(); }} />
        ) : summary ? (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: islandTheme.color.textSubtle, opacity: 0.95 }}>
            {summary}
          </p>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: 8,
          alignItems: "start",
          padding: "8px 20px",
          borderTop: `1px solid ${islandTheme.color.cardBorder}`,
          background: islandTheme.color.panelMutedBg
        }}
      >
        <button
          type="button"
          onClick={handleShare}
          aria-label="Share article"
          title="Share article"
          style={{
            background: "transparent",
            border: "none",
            color: islandTheme.color.textMuted,
            cursor: "pointer",
            padding: "2px 4px",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            font: "inherit",
            marginTop: 1
          }}
        >
          <ShareIcon />
        </button>

        <div
          className="island-mono"
          style={{
            fontSize: 10,
            color: islandTheme.color.textMuted,
            lineHeight: 1.4,
            letterSpacing: "0.02em"
          }}
        >
          {whyText}
        </div>

        <VoteControls userVote={userVote} netVotes={netVotes} onVote={handleVote} />
      </div>
    </article>
  );
}

// ── Grid Card ─────────────────────────────────────────────────────────────────

function NewsCard({
  item,
  spoilerRevealed,
  onRevealSpoiler,
  onOpen,
  onTagClick,
  userVote,
  onVote
}: {
  item: GeneralNewsItem;
  spoilerRevealed: boolean;
  onRevealSpoiler: () => void;
  onOpen: () => void;
  onTagClick?: (tag: string) => void;
  userVote: 1 | -1 | 0;
  onVote: (dir: 1 | -1) => void;
}) {
  const isSpoiler = item.aiSpoilerWarning && !spoilerRevealed;
  const summary = item.aiSummary ?? truncateContents(item.contents, 180);
  const displayTags = (item.aiTags ?? []).slice(0, 3);
  const netVotes = ((item.upvotes ?? 0) - (item.downvotes ?? 0)) + userVote;

  function handleShare(e: React.MouseEvent) {
    e.stopPropagation();
    if (navigator.share) {
      navigator.share({ title: item.title, url: item.url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(item.url).catch(() => {});
    }
  }

  function handleVote(e: React.MouseEvent, dir: 1 | -1) {
    e.stopPropagation();
    onVote(dir);
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(); }}
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: 12,
        background: islandTheme.color.panelBg,
        backdropFilter: islandTheme.glass.blur,
        WebkitBackdropFilter: islandTheme.glass.blur,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        cursor: "pointer",
        overflow: "hidden",
        transition: `border-color ${islandTheme.motion.dur.fast} ease, transform ${islandTheme.motion.dur.fast} ease`,
        height: "100%",
        boxSizing: "border-box"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = islandTheme.color.primaryGlow;
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = islandTheme.color.cardBorder;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: "8px 10px 0" }}>
        {displayTags.map((tag) => (
          <TagPill key={tag} tag={tag} onTagClick={onTagClick} />
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "68px 1fr", gap: 8, padding: "6px 10px" }}>
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            style={{ width: 68, height: 50, borderRadius: 6, objectFit: "cover", display: "block", flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: 68,
              height: 50,
              borderRadius: 6,
              background: islandTheme.color.panelMutedBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              flexShrink: 0
            }}
          >
            📰
          </div>
        )}
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2, justifyContent: "center" }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1.25,
              color: islandTheme.color.textPrimary,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical"
            }}
          >
            {item.aiTitle ?? item.title}
          </div>
          {item.aiSubtitle && (
            <div
              style={{
                fontSize: 11,
                color: islandTheme.color.textSubtle,
                lineHeight: 1.4,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical"
              }}
            >
              {item.aiSubtitle}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "0 10px", flex: 1 }}>
        {isSpoiler ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRevealSpoiler(); }}
            style={{
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              borderRadius: 6,
              color: "#f59e0b",
              fontSize: 10,
              padding: "2px 7px",
              cursor: "pointer",
              font: "inherit",
              textAlign: "left"
            }}
          >
            ⚠ Spoiler — tap to reveal
          </button>
        ) : summary ? (
          <div
            style={{
              fontSize: 11,
              color: islandTheme.color.textSubtle,
              lineHeight: 1.5,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical"
            }}
          >
            {summary}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 10px",
          borderTop: `1px solid ${islandTheme.color.cardBorder}`,
          marginTop: 6
        }}
      >
        <button
          type="button"
          onClick={handleShare}
          aria-label="Share article"
          title="Share article"
          style={{
            background: "transparent",
            border: "none",
            color: islandTheme.color.textMuted,
            cursor: "pointer",
            padding: "2px 4px",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: "inherit",
            transition: `color ${islandTheme.motion.dur.fast} ease`
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = islandTheme.color.textSubtle; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = islandTheme.color.textMuted; }}
        >
          <ShareIcon />
        </button>

        <VoteControls userVote={userVote} netVotes={netVotes} onVote={handleVote} />
      </div>
    </article>
  );
}

// ── List Row ──────────────────────────────────────────────────────────────────

function NewsListRow({
  item,
  spoilerRevealed,
  onOpen,
  onTagClick,
  userVote,
  onVote
}: {
  item: GeneralNewsItem;
  spoilerRevealed: boolean;
  onRevealSpoiler: () => void;
  onOpen: () => void;
  onTagClick?: (tag: string) => void;
  userVote: 1 | -1 | 0;
  onVote: (dir: 1 | -1) => void;
}) {
  const isSpoiler = item.aiSpoilerWarning && !spoilerRevealed;
  const displayTags = (item.aiTags ?? []).slice(0, 3);
  const netVotes = ((item.upvotes ?? 0) - (item.downvotes ?? 0)) + userVote;
  const ago = relativeAgo(item.publishedAt);

  function handleShare(e: React.MouseEvent) {
    e.stopPropagation();
    if (navigator.share) {
      navigator.share({ title: item.title, url: item.url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(item.url).catch(() => {});
    }
  }

  function handleVote(e: React.MouseEvent, dir: 1 | -1) {
    e.stopPropagation();
    onVote(dir);
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(); }}
      style={{
        display: "grid",
        gridTemplateColumns: "80px minmax(0, 1fr) auto auto auto",
        alignItems: "center",
        gap: 12,
        padding: "8px 12px",
        borderRadius: islandTheme.radius.control,
        background: islandTheme.color.panelMutedBg,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        cursor: "pointer",
        transition: `border-color ${islandTheme.motion.dur.fast} ease, transform ${islandTheme.motion.dur.fast} ease`,
        boxSizing: "border-box"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = islandTheme.color.primaryGlow;
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = islandTheme.color.cardBorder;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          style={{ width: 80, height: 60, borderRadius: 6, objectFit: "cover", display: "block" }}
        />
      ) : (
        <div
          style={{
            width: 80,
            height: 60,
            borderRadius: 6,
            background: islandTheme.color.panelBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22
          }}
        >
          📰
        </div>
      )}

      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            lineHeight: 1.3,
            color: islandTheme.color.textPrimary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {item.aiTitle ?? item.title}
        </div>
        <div
          className="island-mono"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            color: islandTheme.color.textMuted,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.sourceName}</span>
          {ago ? <span aria-hidden="true">·</span> : null}
          {ago ? <span>{ago}</span> : null}
          {isSpoiler ? (
            <>
              <span aria-hidden="true">·</span>
              <span style={{ color: "#f59e0b" }} title="Spoiler — open to reveal">⚠ spoiler</span>
            </>
          ) : null}
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, flexWrap: "nowrap" }}>
        {displayTags.map((tag) => (
          <TagPill key={tag} tag={tag} onTagClick={onTagClick} />
        ))}
      </div>

      <button
        type="button"
        onClick={handleShare}
        aria-label="Share article"
        title="Share article"
        style={{
          background: "transparent",
          border: "none",
          color: islandTheme.color.textMuted,
          cursor: "pointer",
          padding: "2px 4px",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          font: "inherit",
          transition: `color ${islandTheme.motion.dur.fast} ease`
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = islandTheme.color.textSubtle; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = islandTheme.color.textMuted; }}
      >
        <ShareIcon />
      </button>

      <VoteControls userVote={userVote} netVotes={netVotes} onVote={handleVote} size="compact" />
    </article>
  );
}

// ── Shared Sub-Components ─────────────────────────────────────────────────────

function TagPill({ tag, onTagClick }: { tag: string; onTagClick?: (tag: string) => void }) {
  return (
    <IslandTag
      color={getTagColor(tag)}
      onClick={onTagClick ? (e) => { e.stopPropagation(); onTagClick(tag); } : undefined}
    >
      {tag}
    </IslandTag>
  );
}

type VoteControlsProps = {
  userVote: 1 | -1 | 0;
  netVotes: number;
  onVote: (e: React.MouseEvent, dir: 1 | -1) => void;
  size?: "default" | "compact";
};

function VoteControls({ userVote, netVotes, onVote, size = "default" }: VoteControlsProps) {
  const compact = size === "compact";
  const buttonPad = compact ? "2px 3px" : "3px 4px";
  const countSize = compact ? 10 : 11;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 1 : 2 }}>
      <button
        type="button"
        onClick={(e) => onVote(e, 1)}
        aria-label="Rate AI summary as helpful"
        aria-pressed={userVote === 1}
        title="Rate AI summary — helpful"
        style={{
          background: "transparent",
          border: "none",
          borderRadius: 4,
          color: userVote === 1 ? islandTheme.color.successAccent : islandTheme.color.textMuted,
          cursor: "pointer",
          padding: buttonPad,
          display: "flex",
          alignItems: "center",
          font: "inherit",
          transition: `color ${islandTheme.motion.dur.fast} ease`
        }}
      >
        <ThumbUpIcon />
      </button>
      <span
        className="island-mono"
        style={{
          fontSize: countSize,
          fontWeight: 700,
          color: netVotes > 0 ? islandTheme.color.successAccent : netVotes < 0 ? islandTheme.color.dangerAccent : islandTheme.color.textMuted,
          minWidth: 16,
          textAlign: "center",
          lineHeight: 1
        }}
      >
        {netVotes}
      </span>
      <button
        type="button"
        onClick={(e) => onVote(e, -1)}
        aria-label="Rate AI summary as not helpful"
        aria-pressed={userVote === -1}
        title="Rate AI summary — not helpful"
        style={{
          background: "transparent",
          border: "none",
          borderRadius: 4,
          color: userVote === -1 ? islandTheme.color.dangerAccent : islandTheme.color.textMuted,
          cursor: "pointer",
          padding: buttonPad,
          display: "flex",
          alignItems: "center",
          font: "inherit",
          transition: `color ${islandTheme.motion.dur.fast} ease`
        }}
      >
        <ThumbDownIcon />
      </button>
    </div>
  );
}

// ── Article Modal ─────────────────────────────────────────────────────────────

function NewsArticleModal({
  item,
  userVote,
  onVote,
  onClose
}: {
  item: GeneralNewsItem;
  userVote: 1 | -1 | 0;
  onVote: (dir: 1 | -1) => void;
  onClose: () => void;
}) {
  const labelColor = LABEL_COLORS[item.aiLabel ?? ""] ?? islandTheme.color.textMuted;
  const labelText = LABEL_LABELS[item.aiLabel ?? ""] ?? null;
  const ago = relativeAgo(item.publishedAt);
  const displayTags = (item.aiTags ?? []).slice(0, 3);
  const netVotes = ((item.upvotes ?? 0) - (item.downvotes ?? 0)) + userVote;

  function handleVote(e: React.MouseEvent, dir: 1 | -1) {
    e.stopPropagation();
    onVote(dir);
  }

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(12px, 3vh, 32px) clamp(12px, 3vw, 32px)"
      }}
    >
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(4, 8, 20, 0.72)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)"
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 680,
          maxHeight: "85vh",
          overflowY: "auto",
          borderRadius: 16,
          background: islandTheme.color.panelBg,
          backdropFilter: islandTheme.glass.blurStrong,
          WebkitBackdropFilter: islandTheme.glass.blurStrong,
          border: `1px solid ${islandTheme.color.cardBorder}`,
          padding: "24px 24px 32px"
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close article"
          style={{
            position: "absolute",
            top: 18,
            right: 18,
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: `1px solid ${islandTheme.color.cardBorder}`,
            background: islandTheme.color.panelMutedBg,
            color: islandTheme.color.textMuted,
            fontSize: 16,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: "inherit"
          }}
        >
          ✕
        </button>

        {item.imageUrl && (
          <div style={{ marginBottom: 20, borderRadius: 12, overflow: "hidden", maxHeight: 200 }}>
            <img src={item.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <span className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {item.sourceName}
          </span>
          {item.author && (
            <>
              <span style={{ fontSize: 11, color: islandTheme.color.textMuted, opacity: 0.5 }}>·</span>
              <span className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted }}>{item.author}</span>
            </>
          )}
          <span style={{ fontSize: 11, color: islandTheme.color.textMuted, opacity: 0.5 }}>·</span>
          <span className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted }}>{ago}</span>
          {labelText && (
            <span className="island-mono" style={islandTagStyle({ color: labelColor })}>
              {labelText}
            </span>
          )}
        </div>

        <h2
          className="island-display"
          style={{ margin: "0 0 12px", fontSize: "clamp(20px, 3vw, 26px)", lineHeight: 1.15, fontWeight: 800 }}
        >
          {item.aiTitle ?? item.title}
        </h2>

        {displayTags.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
            {displayTags.map((tag) => (
              <IslandTag key={tag} color={getTagColor(tag)}>
                {tag}
              </IslandTag>
            ))}
          </div>
        )}

        {item.aiSummary && (
          <div
            style={{
              padding: "14px 18px",
              borderRadius: 12,
              background: "rgba(37, 99, 235, 0.12)",
              border: "1px solid rgba(37, 99, 235, 0.2)",
              marginBottom: 20
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 10
              }}
            >
              <span
                className="island-mono"
                style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: islandTheme.color.primaryGlow }}
              >
                AI Summary
              </span>
              <VoteControls userVote={userVote} netVotes={netVotes} onVote={handleVote} />
            </div>
            <FormattedSummary text={item.aiSummary} />
          </div>
        )}

        {(item.aiWhyRecommended || item.matchedTags.length > 0) && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              background: "rgba(74, 222, 128, 0.08)",
              border: "1px solid rgba(74, 222, 128, 0.2)",
              marginBottom: 20
            }}
          >
            <div
              className="island-mono"
              style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: islandTheme.color.successAccent, marginBottom: 8, fontWeight: 700 }}
            >
              Why This Matters to Boneless Island
            </div>
            {item.aiWhyRecommended && (
              <p style={{ margin: "0 0 6px", fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
                {item.aiWhyRecommended}
              </p>
            )}
            {item.matchedTags.length > 0 && (
              <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
                Matches crew interests:{" "}
                <span style={{ color: islandTheme.color.textPrimary }}>
                  {item.matchedTags.slice(0, 6).join(", ")}
                </span>
              </p>
            )}
          </div>
        )}

        {item.aiSources && item.aiSources.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div
              className="island-mono"
              style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: islandTheme.color.textMuted, marginBottom: 8, fontWeight: 700 }}
            >
              Sources
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
              {item.aiSources.map((url) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: islandTheme.color.primaryGlow, textDecoration: "none" }}
                  >
                    {prettyHost(url)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <details
          style={{
            borderTop: `1px solid ${islandTheme.color.cardBorder}`,
            paddingTop: 18,
            marginTop: 4
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              fontSize: 12,
              color: islandTheme.color.textMuted,
              fontWeight: 600,
              listStyle: "none",
              display: "flex",
              alignItems: "center",
              gap: 6,
              userSelect: "none"
            }}
          >
            <span style={{ fontSize: 10 }}>▶</span>
            Source attribution
          </summary>
          <div
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 10
            }}
          >
            <div>
              <div className="island-mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: islandTheme.color.textMuted, marginBottom: 2 }}>
                Source
              </div>
              <div style={{ fontSize: 13, color: islandTheme.color.textSubtle }}>{item.sourceName}</div>
            </div>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "9px 18px",
                borderRadius: 10,
                background: islandTheme.color.primary,
                color: islandTheme.color.textInverted,
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
                font: "inherit"
              }}
            >
              Read full article →
            </a>
          </div>
        </details>
      </div>
    </div>,
    document.body
  );
}

// ── Spoiler Block ─────────────────────────────────────────────────────────────

function SpoilerBlock({ onReveal }: { onReveal: (e: React.MouseEvent) => void }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 10,
        background: "rgba(245, 158, 11, 0.08)",
        border: "1px solid rgba(245, 158, 11, 0.25)"
      }}
    >
      <span style={{ fontSize: 18 }}>⚠</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>Spoiler warning</div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>
          This article contains story spoilers. Summary hidden.
        </div>
      </div>
      <button
        type="button"
        onClick={onReveal}
        style={{
          background: "rgba(245, 158, 11, 0.15)",
          border: "1px solid rgba(245, 158, 11, 0.35)",
          borderRadius: 8,
          color: "#f59e0b",
          fontSize: 12,
          fontWeight: 700,
          padding: "5px 10px",
          cursor: "pointer",
          font: "inherit",
          whiteSpace: "nowrap"
        }}
      >
        Reveal
      </button>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 1v9" />
      <polyline points="5 4 8 1 11 4" />
      <path d="M2 9v5h12V9" />
    </svg>
  );
}

function ThumbUpIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
      <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function FormattedSummary({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: Array<{ kind: "p" | "ul"; lines: string[] }> = [];
  let cur: { kind: "p" | "ul"; lines: string[] } | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      cur = null;
      continue;
    }
    const isBullet = /^[-*•]\s+/.test(line);
    const kind: "p" | "ul" = isBullet ? "ul" : "p";
    if (!cur || cur.kind !== kind) {
      cur = { kind, lines: [] };
      blocks.push(cur);
    }
    cur.lines.push(isBullet ? line.replace(/^[-*•]\s+/, "") : line);
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {blocks.map((b, i) =>
        b.kind === "ul" ? (
          <ul
            key={i}
            style={{
              margin: 0,
              paddingLeft: 22,
              fontSize: 14,
              lineHeight: 1.6,
              color: islandTheme.color.textPrimary
            }}
          >
            {b.lines.map((l, j) => (
              <li key={j} style={{ marginBottom: 4 }}>
                {l}
              </li>
            ))}
          </ul>
        ) : (
          <p
            key={i}
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.6,
              color: islandTheme.color.textPrimary
            }}
          >
            {b.lines.join(" ")}
          </p>
        )
      )}
    </div>
  );
}

function truncateContents(contents: string | null, maxChars: number): string | null {
  if (!contents) return null;
  const stripped = contents.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return stripped.length > maxChars ? stripped.slice(0, maxChars) + "…" : stripped;
}

function relativeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const delta = Math.max(0, Date.now() - then);
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 8) return `${weeks}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}
