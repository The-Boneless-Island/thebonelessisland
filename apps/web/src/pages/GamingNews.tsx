import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { IslandCard } from "../islandUi.js";
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

const NEWS_PAGE_SIZE = 8;

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
      {options.map((opt) => {
        const isActive = activeTags.has(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onTagClick(opt)}
            className="island-mono"
            style={{
              border: `1px solid ${isActive ? islandTheme.color.primary : islandTheme.color.border}`,
              background: isActive ? "rgba(37, 99, 235, 0.15)" : "transparent",
              color: isActive ? islandTheme.color.textPrimary : islandTheme.color.textSubtle,
              fontSize: 10,
              fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 999,
              cursor: "pointer",
              font: "inherit",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              transition: `border-color ${islandTheme.motion.dur.fast} ${islandTheme.motion.ease.out}, background ${islandTheme.motion.dur.fast} ${islandTheme.motion.ease.out}`
            }}
          >
            {opt}
          </button>
        );
      })}
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
  const rest = filtered.slice(1);
  const visibleRest = showAll ? rest : rest.slice(0, NEWS_PAGE_SIZE - 1);
  const hasMore = rest.length > NEWS_PAGE_SIZE - 1 && !showAll;

  function revealSpoiler(id: string) {
    setRevealedSpoilers((prev) => new Set([...prev, id]));
  }

  return (
    <>
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
              <button
                key={tag}
                type="button"
                onClick={() => handleTagClick(tag)}
                className="island-mono"
                style={{
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                  border: `1px solid ${islandTheme.color.primary}`,
                  background: "rgba(37,99,235,0.15)",
                  color: islandTheme.color.textPrimary,
                  borderRadius: 999, padding: "2px 8px", cursor: "pointer", font: "inherit",
                  display: "flex", alignItems: "center", gap: 4
                }}
              >
                {tag} ×
              </button>
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
            {hero && (
              <NewsHeroCard
                item={hero}
                spoilerRevealed={revealedSpoilers.has(hero.externalId)}
                onRevealSpoiler={() => revealSpoiler(hero.externalId)}
                onOpen={() => setActiveArticle(hero)}
                onTagClick={handleTagClick}
              />
            )}

            {visibleRest.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                  gap: 10
                }}
              >
                {visibleRest.map((item) => (
                  <NewsCard
                    key={item.externalId}
                    item={item}
                    spoilerRevealed={revealedSpoilers.has(item.externalId)}
                    onRevealSpoiler={() => revealSpoiler(item.externalId)}
                    onOpen={() => setActiveArticle(item)}
                    onTagClick={handleTagClick}
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
                {rest.length - (NEWS_PAGE_SIZE - 1)} more stories from the shore →
              </button>
            )}
          </>
        )}
      </section>

      {activeArticle && (
        <NewsArticleModal item={activeArticle} onClose={() => setActiveArticle(null)} />
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
  onTagClick
}: {
  item: GeneralNewsItem;
  spoilerRevealed: boolean;
  onRevealSpoiler: () => void;
  onOpen: () => void;
  onTagClick?: (tag: string) => void;
}) {
  const { mode } = useDayNight();
  const [userVote, setUserVote] = useState<1 | -1 | 0>(0);

  const isSpoiler = item.aiSpoilerWarning && !spoilerRevealed;
  const summary = item.aiSummary ?? truncateContents(item.contents, 200);
  const labelColor = LABEL_COLORS[item.aiLabel ?? ""] ?? islandTheme.color.textMuted;
  const labelText = LABEL_LABELS[item.aiLabel ?? ""] ?? null;
  const displayTags = (item.aiTags ?? []).slice(0, 4);
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
    const next: 0 | 1 | -1 = userVote === dir ? 0 : dir;
    setUserVote(next);
    fetch(`/api/news/general/${item.id}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: next }),
      credentials: "include"
    }).catch(() => {});
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
      <div style={{ padding: "24px 24px 16px", display: "grid", gap: 10, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {item.sourceName}
          </span>
          {labelText && (
            <span
              className="island-mono"
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: labelColor,
                background: `${labelColor}22`,
                border: `1px solid ${labelColor}44`,
                borderRadius: 999,
                padding: "2px 8px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                whiteSpace: "nowrap"
              }}
            >
              {labelText}
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {displayTags.map((tag) => (
            <TagPill key={tag} tag={tag} onTagClick={onTagClick} />
          ))}
        </div>

        <h3
          className="island-display"
          style={{ margin: 0, fontSize: "clamp(17px, 2.5vw, 22px)", lineHeight: 1.15, color: islandTheme.color.textPrimary }}
        >
          {item.title}
        </h3>

        {item.aiSubtitle && (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4, color: islandTheme.color.textSubtle, opacity: 0.85 }}>
            {item.aiSubtitle}
          </p>
        )}

        {isSpoiler ? (
          <SpoilerBlock onReveal={(e) => { e.stopPropagation(); onRevealSpoiler(); }} />
        ) : summary ? (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: islandTheme.color.textSubtle, opacity: 0.95 }}>
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
          padding: "10px 24px",
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
  onTagClick
}: {
  item: GeneralNewsItem;
  spoilerRevealed: boolean;
  onRevealSpoiler: () => void;
  onOpen: () => void;
  onTagClick?: (tag: string) => void;
}) {
  const [userVote, setUserVote] = useState<1 | -1 | 0>(0);

  const isSpoiler = item.aiSpoilerWarning && !spoilerRevealed;
  const summary = item.aiSummary ?? truncateContents(item.contents, 180);
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
    const next: 0 | 1 | -1 = userVote === dir ? 0 : dir;
    setUserVote(next);
    fetch(`/api/news/general/${item.id}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: next }),
      credentials: "include"
    }).catch(() => {});
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
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", padding: "10px 12px 0" }}>
        {displayTags.map((tag) => (
          <TagPill key={tag} tag={tag} onTagClick={onTagClick} />
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "84px 1fr", gap: 10, padding: "8px 12px" }}>
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            style={{ width: 84, height: 63, borderRadius: 8, objectFit: "cover", display: "block", flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: 84,
              height: 63,
              borderRadius: 8,
              background: islandTheme.color.panelMutedBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              flexShrink: 0
            }}
          >
            📰
          </div>
        )}
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3, justifyContent: "center" }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.3,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical"
            }}
          >
            {item.title}
          </div>
          {item.aiSubtitle && (
            <div
              style={{
                fontSize: 11,
                color: islandTheme.color.textSubtle,
                lineHeight: 1.35,
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

      <div style={{ padding: "0 12px", flex: 1 }}>
        {isSpoiler ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRevealSpoiler(); }}
            style={{
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              borderRadius: 6,
              color: "#f59e0b",
              fontSize: 11,
              padding: "3px 8px",
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
              fontSize: 12,
              color: islandTheme.color.textSubtle,
              lineHeight: 1.5,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical"
            }}
          >
            {summary}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: 8,
          alignItems: "start",
          padding: "8px 12px",
          borderTop: `1px solid ${islandTheme.color.cardBorder}`,
          marginTop: 8
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
            transition: `color ${islandTheme.motion.dur.fast} ease`,
            marginTop: 1
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = islandTheme.color.textSubtle; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = islandTheme.color.textMuted; }}
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

// ── Shared Sub-Components ─────────────────────────────────────────────────────

function TagPill({ tag, onTagClick }: { tag: string; onTagClick?: (tag: string) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onTagClick?.(tag); }}
      className="island-mono"
      style={{
        fontSize: 9,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        color: islandTheme.color.textMuted,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        borderRadius: 999,
        padding: "2px 7px",
        background: islandTheme.color.panelMutedBg,
        whiteSpace: "nowrap",
        cursor: onTagClick ? "pointer" : "default",
        font: "inherit",
        transition: `border-color ${islandTheme.motion.dur.fast} ease`
      }}
      onMouseEnter={(e) => {
        if (onTagClick) e.currentTarget.style.borderColor = islandTheme.color.primaryGlow;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = islandTheme.color.cardBorder;
      }}
    >
      {tag}
    </button>
  );
}

type VoteControlsProps = {
  userVote: 1 | -1 | 0;
  netVotes: number;
  onVote: (e: React.MouseEvent, dir: 1 | -1) => void;
};

function VoteControls({ userVote, netVotes, onVote }: VoteControlsProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
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
          padding: "3px 4px",
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
          fontSize: 11,
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
          padding: "3px 4px",
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

function NewsArticleModal({ item, onClose }: { item: GeneralNewsItem; onClose: () => void }) {
  const labelColor = LABEL_COLORS[item.aiLabel ?? ""] ?? islandTheme.color.textMuted;
  const labelText = LABEL_LABELS[item.aiLabel ?? ""] ?? null;
  const fullText = truncateContents(item.contents, 2000);
  const ago = relativeAgo(item.publishedAt);

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
            <span
              className="island-mono"
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: labelColor,
                background: `${labelColor}22`,
                border: `1px solid ${labelColor}44`,
                borderRadius: 999,
                padding: "2px 8px",
                textTransform: "uppercase",
                letterSpacing: "0.06em"
              }}
            >
              {labelText}
            </span>
          )}
        </div>

        <h2
          className="island-display"
          style={{ margin: "0 0 18px", fontSize: "clamp(20px, 3vw, 26px)", lineHeight: 1.15, fontWeight: 800 }}
        >
          {item.title}
        </h2>

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
              className="island-mono"
              style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: islandTheme.color.primaryGlow, marginBottom: 6 }}
            >
              AI Summary
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: islandTheme.color.textPrimary }}>
              {item.aiSummary}
            </p>
          </div>
        )}

        {item.matchedTags.length > 0 && (
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
              style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: islandTheme.color.successAccent, marginBottom: 6 }}
            >
              Why it's relevant to your crew
            </div>
            <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5 }}>
              Matches crew interests:{" "}
              <span style={{ color: islandTheme.color.textPrimary }}>
                {item.matchedTags.slice(0, 6).join(", ")}
              </span>
            </p>
          </div>
        )}

        {fullText && (
          <div style={{ marginBottom: 24 }}>
            <div
              className="island-mono"
              style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: islandTheme.color.textMuted, marginBottom: 10 }}
            >
              Article
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: islandTheme.color.textSubtle }}>
              {fullText}
            </p>
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
                color: "#fff",
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
