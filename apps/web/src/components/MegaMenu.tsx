import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { islandTheme } from "../theme.js";
import { pathForPage } from "../lib/routes.js";
import type { PageId } from "../types.js";

type NavChild = {
  id: PageId;
  label: string;
  description: string;
  badge?: string;
};

type NavGroup = {
  label: string;
  defaultId: PageId;
  children: NavChild[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Games",
    defaultId: "games",
    children: [
      { id: "library", label: "Library", description: "Games your crew owns and plays together" },
      { id: "games-news", label: "Gaming News", description: "AI-curated gaming news from the shore" }
    ]
  },
  {
    label: "Community",
    defaultId: "community",
    children: [
      { id: "community", label: "Members", description: "Who's on the island right now" },
      { id: "tide-check", label: "Sunday Tide Check", description: "This week's crew digest — what we played and queued" },
      { id: "community-forums", label: "Forums", description: "Island discussions and crew talk" },
      { id: "community-leaderboard", label: "Leaderboard", description: "Top Nuggies holders" },
      { id: "crew-achievements", label: "Crew Achievements", description: "Achievement progress across the crew" }
    ]
  },
  {
    label: "Nuggies",
    defaultId: "nuggies",
    children: [
      { id: "nuggies", label: "Balance & Shop", description: "Your balance and the item shop" },
      { id: "nuggies-casino", label: "The Arcade", description: "Coinflip, blackjack, hi-lo" },
      { id: "nuggies-history", label: "History", description: "Your transaction log" },
      { id: "nuggies-milestones", label: "Milestones", description: "Rank ladder + achievements" }
    ]
  }
];

const GAMES_GROUP_IDS: PageId[] = ["games", "library", "games-news"];
const COMMUNITY_GROUP_IDS: PageId[] = ["community", "tide-check", "community-forums", "community-leaderboard", "crew-achievements"];
const NUGGIES_GROUP_IDS: PageId[] = ["nuggies", "nuggies-casino", "nuggies-history", "nuggies-milestones"];

function groupIsActive(group: NavGroup, page: PageId): boolean {
  if (group.label === "Games") return GAMES_GROUP_IDS.includes(page);
  if (group.label === "Community") return COMMUNITY_GROUP_IDS.includes(page);
  if (group.label === "Nuggies") return NUGGIES_GROUP_IDS.includes(page);
  return false;
}

type MegaMenuProps = {
  page: PageId;
  onNavigate: (page: PageId) => void;
  isAdmin: boolean;
};

export function MegaMenu({ page, onNavigate, isAdmin }: MegaMenuProps) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 820);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 820);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Close mobile menu on page change
  useEffect(() => { setMobileOpen(false); }, [page]);

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          className="bi-megamenu-trigger"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          style={{
            background: "transparent",
            border: `1px solid ${islandTheme.color.cardBorder}`,
            borderRadius: 8,
            color: islandTheme.color.textPrimary,
            cursor: "pointer",
            padding: "6px 10px",
            display: "flex",
            alignItems: "center",
            gap: 6,
            font: "inherit",
            fontSize: 13,
            minHeight: 44,
            minWidth: 44
          }}
        >
          <HamburgerIcon />
        </button>
        {mobileOpen && (
          <MobileOverlay
            page={page}
            isAdmin={isAdmin}
            onNavigate={onNavigate}
            onClose={() => setMobileOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <nav style={{ display: "flex", gap: 2, alignItems: "center", marginLeft: 8 }}>
      {NAV_GROUPS.map((group) => (
        <DesktopGroupItem
          key={group.label}
          group={group}
          active={groupIsActive(group, page)}
          currentPage={page}
          onNavigate={onNavigate}
        />
      ))}
      {isAdmin && (
        <Link
          to="/admin"
          style={{ ...navButtonStyle(page === "admin"), textDecoration: "none" }}
          onMouseEnter={(e) => { if (page !== "admin") e.currentTarget.style.background = islandTheme.color.secondary; }}
          onMouseLeave={(e) => { if (page !== "admin") e.currentTarget.style.background = "transparent"; }}
        >
          Admin
        </Link>
      )}
    </nav>
  );
}

// ── Desktop Group Item ────────────────────────────────────────────────────────

function DesktopGroupItem({
  group,
  active,
  currentPage,
  onNavigate
}: {
  group: NavGroup;
  active: boolean;
  currentPage: PageId;
  onNavigate: (id: PageId) => void;
}) {
  const [open, setOpen] = useState(false);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  function clearTimers() {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }

  function handleMouseEnter() {
    clearTimers();
    openTimer.current = window.setTimeout(() => setOpen(true), 120);
  }

  function handleMouseLeave() {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpen(false), 160);
  }

  useEffect(() => () => clearTimers(), []);

  return (
    <div style={{ position: "relative" }} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <Link
        to={pathForPage(group.defaultId)}
        style={{ ...navButtonStyle(active), textDecoration: "none" }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = islandTheme.color.secondary; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = active ? "rgba(37, 99, 235, 0.22)" : "transparent"; }}
      >
        {group.label}
        <ChevronSmall open={open} />
      </Link>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 50,
            minWidth: islandTheme.layout.menuMinWidth,
            maxWidth: islandTheme.layout.menuMaxWidth,
            background: islandTheme.color.menuBg,
            backdropFilter: islandTheme.glass.blurMenu,
            WebkitBackdropFilter: islandTheme.glass.blurMenu,
            border: `1px solid ${islandTheme.color.cardBorder}`,
            borderRadius: 14,
            padding: 6,
            boxShadow: "0 20px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04)"
          }}
        >
          {group.children.map((child) => {
            const childActive = currentPage === child.id;
            return (
              <Link
                key={child.id}
                to={pathForPage(child.id)}
                onClick={(e) => { if (child.badge) { e.preventDefault(); return; } setOpen(false); }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  textDecoration: "none",
                  color: "inherit",
                  background: childActive ? "rgba(37, 99, 235, 0.18)" : "transparent",
                  border: "none",
                  borderRadius: 10,
                  padding: "10px 14px",
                  cursor: child.badge ? "default" : "pointer",
                  font: "inherit",
                  transition: `background ${islandTheme.motion.dur.fast} ease`
                }}
                onMouseEnter={(e) => { if (!childActive && !child.badge) e.currentTarget.style.background = islandTheme.color.secondary; }}
                onMouseLeave={(e) => { if (!childActive) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: childActive ? islandTheme.color.textPrimary : islandTheme.color.textSubtle
                    }}
                  >
                    {child.label}
                  </span>
                  {child.badge && (
                    <span
                      className="island-mono"
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: islandTheme.color.textMuted,
                        background: islandTheme.color.panelMutedBg,
                        border: `1px solid ${islandTheme.color.cardBorder}`,
                        borderRadius: 999,
                        padding: "2px 6px",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {child.badge}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2, lineHeight: 1.4 }}>
                  {child.description}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Mobile Overlay ────────────────────────────────────────────────────────────

function MobileOverlay({
  page,
  isAdmin,
  onNavigate,
  onClose
}: {
  page: PageId;
  isAdmin: boolean;
  onNavigate: (id: PageId) => void;
  onClose: () => void;
}) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(() => {
    for (const g of NAV_GROUPS) {
      if (groupIsActive(g, page)) return g.label;
    }
    return null;
  });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        flexDirection: "column"
      }}
    >
      {/* Backdrop */}
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(4, 8, 20, 0.6)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)"
        }}
      />

      {/* Panel slides in from right */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: `min(${islandTheme.layout.menuMobileMaxWidth}px, calc(100vw - 16px))`,
          background: islandTheme.color.menuBg,
          backdropFilter: islandTheme.glass.blurMenu,
          WebkitBackdropFilter: islandTheme.glass.blurMenu,
          borderLeft: `1px solid ${islandTheme.color.cardBorder}`,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto"
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 20px",
            borderBottom: `1px solid ${islandTheme.color.cardBorder}`
          }}
        >
          <span className="island-display" style={{ fontSize: 16, fontWeight: 700 }}>
            Navigation
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            style={{
              background: islandTheme.color.panelMutedBg,
              border: `1px solid ${islandTheme.color.cardBorder}`,
              borderRadius: 8,
              color: islandTheme.color.textMuted,
              fontSize: 16,
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              font: "inherit"
            }}
          >
            ✕
          </button>
        </div>

        {/* Nav groups */}
        <div style={{ padding: "10px 10px", display: "grid", gap: 4 }}>
          {NAV_GROUPS.map((group) => {
            const expanded = expandedGroup === group.label;
            const groupActive = groupIsActive(group, page);
            return (
              <div key={group.label}>
                <button
                  type="button"
                  onClick={() => setExpandedGroup(expanded ? null : group.label)}
                  style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: groupActive ? "rgba(37, 99, 235, 0.15)" : "transparent",
                    border: "none",
                    borderRadius: 10,
                    padding: "12px 14px",
                    cursor: "pointer",
                    font: "inherit",
                    color: groupActive ? islandTheme.color.textPrimary : islandTheme.color.textSubtle,
                    fontSize: 14,
                    fontWeight: 700
                  }}
                >
                  {group.label}
                  <ChevronSmall open={expanded} />
                </button>

                {expanded && (
                  <div style={{ paddingLeft: 10, display: "grid", gap: 2, marginTop: 2 }}>
                    {group.children.map((child) => {
                      const childActive = page === child.id;
                      return (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => !child.badge && onNavigate(child.id)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            background: childActive ? "rgba(37, 99, 235, 0.18)" : "transparent",
                            border: "none",
                            borderRadius: 8,
                            padding: "10px 14px",
                            cursor: child.badge ? "default" : "pointer",
                            font: "inherit",
                            textAlign: "left"
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: childActive ? islandTheme.color.textPrimary : islandTheme.color.textSubtle
                              }}
                            >
                              {child.label}
                            </div>
                            <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 1 }}>
                              {child.description}
                            </div>
                          </div>
                          {child.badge && (
                            <span
                              className="island-mono"
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                color: islandTheme.color.textMuted,
                                background: islandTheme.color.panelMutedBg,
                                border: `1px solid ${islandTheme.color.cardBorder}`,
                                borderRadius: 999,
                                padding: "2px 6px",
                                whiteSpace: "nowrap",
                                flexShrink: 0,
                                marginLeft: 8
                              }}
                            >
                              {child.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {isAdmin && (
            <button
              type="button"
              onClick={() => onNavigate("admin")}
              style={{
                display: "flex",
                width: "100%",
                background: page === "admin" ? "rgba(37, 99, 235, 0.15)" : "transparent",
                border: "none",
                borderRadius: 10,
                padding: "12px 14px",
                cursor: "pointer",
                font: "inherit",
                color: page === "admin" ? islandTheme.color.textPrimary : islandTheme.color.textSubtle,
                fontSize: 14,
                fontWeight: 700
              }}
            >
              Admin
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shared Style Helper ───────────────────────────────────────────────────────

function navButtonStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 4,
    border: "none",
    background: active
      ? "linear-gradient(180deg, rgba(91,139,255,.22) 0%, rgba(47,99,239,.14) 100%)"
      : "transparent",
    color: active ? "#f3f7ff" : "var(--bi-text-muted)",
    fontSize: 14,
    fontWeight: active ? 700 : 500,
    padding: "8px 12px",
    borderRadius: 999,
    cursor: "pointer",
    transition: `background ${islandTheme.motion.dur.fast} ease, color ${islandTheme.motion.dur.fast} ease, box-shadow ${islandTheme.motion.dur.fast} ease`,
    font: "inherit",
    textDecoration: "none",
    outline: "none",
    boxShadow: active
      ? "0 0 0 1px rgba(91,139,255,.55) inset, 0 0 12px -4px rgba(91,139,255,.5)"
      : "none",
  };
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ChevronSmall({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transition: `transform ${islandTheme.motion.dur.fast} ease`, transform: open ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}
    >
      <polyline points="4 6 8 10 12 6" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="2" y1="4" x2="14" y2="4" />
      <line x1="2" y1="8" x2="14" y2="8" />
      <line x1="2" y1="12" x2="14" y2="12" />
    </svg>
  );
}
