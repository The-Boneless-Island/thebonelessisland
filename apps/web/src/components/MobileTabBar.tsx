// Bottom tab bar for phones. The topbar mega-menu is hover-driven and unusable
// on touch; below 640px this carries primary navigation instead. Hidden
// entirely on wider viewports.

import { Link } from "react-router";
import { islandTheme } from "../theme.js";
import { pathForPage } from "../lib/routes.js";
import type { PageId } from "../types.js";

type Tab = {
  id: PageId;
  icon: string;
  label: string;
  match: (page: PageId) => boolean;
};

const TABS: Tab[] = [
  { id: "home", icon: "🏝️", label: "Home", match: (p) => p === "home" || p === "tide-check" },
  {
    id: "games",
    icon: "🎮",
    label: "Games",
    match: (p) => p === "games" || p === "library" || p === "games-news"
  },
  {
    id: "community",
    icon: "💬",
    label: "Crew",
    match: (p) => p.startsWith("community") || p === "crew-achievements" || p === "islander-profile"
  },
  { id: "nuggies", icon: "🍗", label: "Nuggies", match: (p) => p.startsWith("nuggies") },
  { id: "profile", icon: "👤", label: "Profile", match: (p) => p === "profile" || p === "settings" }
];

export function MobileTabBar({ page }: { page: PageId; onNavigate?: (page: PageId) => void }) {
  return (
    <>
      <nav className="bi-tabbar" aria-label="Primary">
        {TABS.map((tab) => {
          const active = tab.match(page);
          return (
            <Link
              key={tab.id}
              to={pathForPage(tab.id)}
              className="bi-tabbar-btn"
              aria-current={active ? "page" : undefined}
            >
              <span aria-hidden="true" style={{ fontSize: 19, lineHeight: 1 }}>
                {tab.icon}
              </span>
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
      <style>{`
        .bi-tabbar { display: none; }
        @media (max-width: 640px) {
          .bi-tabbar {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 80;
            display: grid;
            grid-template-columns: repeat(${TABS.length}, 1fr);
            gap: 2px;
            padding: 6px max(8px, env(safe-area-inset-left))
                     calc(6px + env(safe-area-inset-bottom))
                     max(8px, env(safe-area-inset-right));
            background: var(--bi-menu-bg);
            backdrop-filter: ${islandTheme.glass.blurMenu};
            -webkit-backdrop-filter: ${islandTheme.glass.blurMenu};
            border-top: 1px solid var(--bi-border);
          }
          /* Keep page content clear of the bar. */
          .bi-main { padding-bottom: 88px !important; }
        }
        .bi-tabbar-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          padding: 6px 2px;
          border: none;
          border-radius: ${islandTheme.radius.control}px;
          background: transparent;
          color: var(--bi-text-muted);
          text-decoration: none;
          font: inherit;
          font-size: ${islandTheme.text.xs}px;
          font-weight: 700;
          letter-spacing: 0.02em;
          cursor: pointer;
        }
        .bi-tabbar-btn[aria-current="page"] {
          color: var(--bi-primary-glow);
          background: var(--bi-panel-muted-bg);
        }
      `}</style>
    </>
  );
}
