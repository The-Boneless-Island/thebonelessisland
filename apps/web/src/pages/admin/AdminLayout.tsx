// Admin shell: persistent sidebar + header with unified search. The active page
// is a real URL path (/admin and /admin/<page>) so admin views are deep-linkable,
// survive refresh, and the browser back button works.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { islandTheme } from "../../theme.js";
import {
  ADMIN_NAV_GROUPS,
  ADMIN_PAGES,
  searchAdmin,
  type AdminPageId,
  type AdminSearchResult
} from "./adminNav.js";

const ADMIN_PREFIX = "/admin/";

export function pageIdFromPath(pathname: string): AdminPageId {
  if (!pathname.startsWith(ADMIN_PREFIX)) return "dashboard";
  const id = pathname.slice(ADMIN_PREFIX.length).split("/")[0] as AdminPageId;
  return ADMIN_PAGES[id] ? id : "dashboard";
}

function adminPath(page: AdminPageId): string {
  return page === "dashboard" ? "/admin" : `${ADMIN_PREFIX}${page}`;
}

type AdminLayoutProps = {
  renderPage: (page: AdminPageId, navigate: (page: AdminPageId, anchor?: string) => void) => ReactNode;
};

export function AdminLayout({ renderPage }: AdminLayoutProps) {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const page = pageIdFromPath(location.pathname);
  const pendingAnchor = useRef<string | null>(null);
  // Bumped on every navigate-with-anchor so the anchor-scroll effect fires even
  // when the section is unchanged (jumping to an anchor on the current page).
  const [anchorNonce, setAnchorNonce] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const navigate = useCallback(
    (next: AdminPageId, anchor?: string) => {
      pendingAnchor.current = anchor ?? null;
      if (anchor) setAnchorNonce((n) => n + 1);
      const path = adminPath(next);
      if (location.pathname !== path) routerNavigate(path);
      if (!anchor) {
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      }
    },
    [routerNavigate, location.pathname]
  );

  // After the target page paints, scroll to + flash the requested anchor.
  useEffect(() => {
    const anchor = pendingAnchor.current;
    if (!anchor) return;
    pendingAnchor.current = null;
    // Two frames: one for React commit, one for layout.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.getElementById(anchor);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.remove("bi-anchor-flash");
        // Force reflow so re-adding the class restarts the animation.
        void el.offsetWidth;
        el.classList.add("bi-anchor-flash");
        window.setTimeout(() => el.classList.remove("bi-anchor-flash"), 2400);
      });
    });
  }, [page, anchorNonce]);

  // "/" focuses search (unless typing in an input already).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const current = ADMIN_PAGES[page];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Header: title + breadcrumb + search */}
      <header style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <span
            className="island-mono"
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: islandTheme.color.textMuted,
              display: "block"
            }}
          >
            ★ Admin · Parent
          </span>
          <h1 className="island-display" style={{ margin: 0, fontSize: "clamp(22px, 3vw, 30px)", fontWeight: 800 }}>
            {page === "dashboard" ? "Admin" : current.label}
          </h1>
        </div>
        <div style={{ flex: 1, minWidth: 220, maxWidth: 460, marginLeft: "auto" }}>
          <AdminSearch inputRef={searchInputRef} onNavigate={navigate} />
        </div>
      </header>

      <div className="bi-admin-shell">
        <Sidebar page={page} onNavigate={navigate} />
        <div className="bi-admin-content" style={{ display: "grid", gap: 14, alignContent: "start" }}>
          {page !== "dashboard" && (
            <p style={{ margin: 0, fontSize: 13, color: islandTheme.color.textMuted, lineHeight: 1.4 }}>
              {current.icon} {current.blurb}
            </p>
          )}
          {renderPage(page, navigate)}
        </div>
      </div>

      <style>{`
        .bi-admin-shell {
          display: grid;
          grid-template-columns: 216px minmax(0, 1fr);
          gap: 24px;
          align-items: start;
        }
        /* Contained panel: without a surface of its own the nav items float in
           space and visually collide with the content column. */
        .bi-admin-sidebar {
          position: sticky;
          top: calc(var(--bi-topbar-h, 62px) + 16px);
          display: grid;
          gap: 14px;
          align-content: start;
          padding: 12px 10px;
          border-radius: 14px;
          background: var(--bi-panel-bg);
          border: 1px solid var(--bi-border);
          z-index: 0;
        }
        .bi-admin-group {
          display: grid;
          gap: 2px;
        }
        .bi-admin-content {
          position: relative;
          z-index: 1;
          min-width: 0;
        }
        @media (max-width: 880px) {
          .bi-admin-shell {
            grid-template-columns: minmax(0, 1fr);
          }
          .bi-admin-sidebar {
            position: static;
            display: flex;
            gap: 6px;
            overflow-x: auto;
            padding: 8px 10px;
            scrollbar-width: thin;
          }
          /* Flatten groups so every nav item flows into one scrollable pill row
             instead of stacking tall columns side by side. */
          .bi-admin-group {
            display: contents;
          }
          .bi-admin-item {
            width: auto !important;
            flex: 0 0 auto;
          }
          .bi-admin-sidebar .bi-admin-group-label {
            display: none;
          }
        }
        @keyframes biAnchorFlash {
          0% { box-shadow: 0 0 0 2px var(--bi-primary-glow); }
          70% { box-shadow: 0 0 0 2px var(--bi-primary-glow); }
          100% { box-shadow: 0 0 0 2px transparent; }
        }
        .bi-anchor-flash {
          animation: biAnchorFlash 2.4s ease-out;
          border-radius: ${islandTheme.radius.card}px;
        }
      `}</style>
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ page, onNavigate }: { page: AdminPageId; onNavigate: (p: AdminPageId) => void }) {
  return (
    <nav className="bi-admin-sidebar" aria-label="Admin sections">
      <div className="bi-admin-group">
        <SidebarItem
          meta={ADMIN_PAGES.dashboard}
          active={page === "dashboard"}
          onClick={() => onNavigate("dashboard")}
        />
      </div>
      {ADMIN_NAV_GROUPS.map((group) => (
        <div key={group.label} className="bi-admin-group">
          <span
            className="island-mono bi-admin-group-label"
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: islandTheme.color.textMuted,
              padding: "6px 10px 2px"
            }}
          >
            {group.label}
          </span>
          {group.pages.map((id) => (
            <SidebarItem
              key={id}
              meta={ADMIN_PAGES[id]}
              active={page === id}
              onClick={() => onNavigate(id)}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

function SidebarItem({
  meta,
  active,
  onClick
}: {
  meta: (typeof ADMIN_PAGES)[AdminPageId];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="bi-admin-item"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "8px 10px",
        borderRadius: islandTheme.radius.control,
        border: `1px solid ${active ? `${meta.accent}55` : "transparent"}`,
        background: active ? `${meta.accent}1e` : "transparent",
        color: active ? islandTheme.color.textPrimary : islandTheme.color.textSubtle,
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        font: "inherit",
        textAlign: "left",
        whiteSpace: "nowrap",
        transition: `background ${islandTheme.motion.dur.fast} ease, border-color ${islandTheme.motion.dur.fast} ease`
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = islandTheme.color.secondary;
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 15, flexShrink: 0 }}>{meta.icon}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{meta.label}</span>
    </button>
  );
}

// ── Search ───────────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<AdminSearchResult["type"], string> = {
  page: "page",
  section: "§",
  setting: "⚙"
};

function AdminSearch({
  inputRef,
  onNavigate
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onNavigate: (page: AdminPageId, anchor?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const results = query.trim() ? searchAdmin(query).slice(0, 10) : [];

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, inputRef]);

  const select = (r: AdminSearchResult) => {
    onNavigate(r.page, r.anchor);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-label="Search admin settings, pages, and sections"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results.length > 0) {
            e.preventDefault();
            select(results[0]);
          }
        }}
        placeholder="Search settings, pages, sections…  ( / )"
        spellCheck={false}
        style={{
          width: "100%",
          padding: "10px 14px",
          borderRadius: 999,
          border: `1px solid ${islandTheme.color.cardBorder}`,
          background: islandTheme.color.panelMutedBg,
          color: islandTheme.color.textPrimary,
          fontSize: 13,
          font: "inherit"
        }}
      />
      {open && query.trim() && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 60,
            background: islandTheme.color.menuBg,
            backdropFilter: islandTheme.glass.blurMenu,
            WebkitBackdropFilter: islandTheme.glass.blurMenu,
            border: `1px solid ${islandTheme.color.cardBorder}`,
            borderRadius: 12,
            boxShadow: "0 20px 48px rgba(0,0,0,0.45)",
            padding: 6,
            display: "grid",
            gap: 2,
            maxHeight: 420,
            overflowY: "auto"
          }}
        >
          {results.length === 0 ? (
            <div style={{ padding: "10px 12px", fontSize: 13, color: islandTheme.color.textMuted }}>
              Nothing matches "{query}".
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.type}-${r.page}-${r.anchor ?? ""}-${i}`}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => select(r)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "none",
                  background: "transparent",
                  color: islandTheme.color.textPrimary,
                  cursor: "pointer",
                  font: "inherit",
                  textAlign: "left"
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = islandTheme.color.secondary; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span
                  className="island-mono"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: r.accent,
                    background: `${r.accent}1e`,
                    border: `1px solid ${r.accent}44`,
                    borderRadius: 6,
                    padding: "1px 7px",
                    flexShrink: 0,
                    minWidth: 44,
                    textAlign: "center"
                  }}
                >
                  {TYPE_BADGE[r.type]}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 700 }}>
                    {r.label}
                    <span style={{ fontWeight: 400, color: islandTheme.color.textMuted, marginLeft: 8, fontSize: 12 }}>
                      {ADMIN_PAGES[r.page].label}
                    </span>
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: islandTheme.color.textMuted,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {r.description}
                  </span>
                </span>
                <span style={{ color: islandTheme.color.textMuted, fontSize: 14, flexShrink: 0 }}>→</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
