// Ctrl/Cmd+K quick switcher: jump to any page, crew member profile, or
// library game from anywhere. Pure client-side over already-loaded state.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { islandTheme } from "../theme.js";
import type { CrewOwnedGame, GuildMember, PageId } from "../types.js";

type SwitcherItem = {
  key: string;
  kind: "page" | "member" | "game";
  label: string;
  detail: string;
  icon: string;
  run: () => void;
};

const PAGE_ENTRIES: Array<{ id: PageId; label: string; detail: string; icon: string; adminOnly?: boolean }> = [
  { id: "home", label: "Home", detail: "The shoreline dashboard", icon: "🏝️" },
  { id: "games", label: "Games", detail: "Game nights + what can we play", icon: "🎮" },
  { id: "library", label: "Library", detail: "Games the crew owns", icon: "🗂" },
  { id: "games-news", label: "Gaming News", detail: "AI-curated news feed", icon: "📰" },
  { id: "community", label: "Community", detail: "The crew and what they're up to", icon: "👥" },
  { id: "tide-check", label: "Sunday Tide Check", detail: "Weekly crew digest", icon: "🌊" },
  { id: "community-forums", label: "Forums", detail: "Long-form island chatter", icon: "💬" },
  { id: "community-leaderboard", label: "Leaderboard", detail: "Top Nuggies holders", icon: "🏆" },
  { id: "crew-achievements", label: "Crew Achievements", detail: "Achievement progress across the crew", icon: "🎖" },
  { id: "nuggies", label: "Balance & Shop", detail: "Your Nuggies and the item shop", icon: "🍗" },
  { id: "nuggies-loans", label: "Loans", detail: "Lend, borrow, and repay", icon: "🤝" },
  { id: "nuggies-casino", label: "Nuggie Casino", detail: "Coinflip, blackjack, hi-lo", icon: "🎰" },
  { id: "nuggies-history", label: "Nuggies History", detail: "Your transaction log", icon: "📜" },
  { id: "nuggies-milestones", label: "Milestones", detail: "Rank ladder + achievements", icon: "⭐" },
  { id: "profile", label: "Profile", detail: "Your island profile", icon: "🪪" },
  { id: "settings", label: "Settings", detail: "Steam link + privacy", icon: "⚙️" },
  { id: "admin", label: "Admin", detail: "Island controls", icon: "★", adminOnly: true }
];

type QuickSwitcherProps = {
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  guildMembers: GuildMember[];
  crewGames: CrewOwnedGame[];
  onNavigate: (page: PageId) => void;
  onOpenProfile: (discordUserId: string) => void;
};

export function QuickSwitcher({
  open,
  onClose,
  isAdmin,
  guildMembers,
  crewGames,
  onNavigate,
  onOpenProfile
}: QuickSwitcherProps) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      // Focus after the portal paints.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const items = useMemo<SwitcherItem[]>(() => {
    const pages: SwitcherItem[] = PAGE_ENTRIES.filter((p) => !p.adminOnly || isAdmin).map((p) => ({
      key: `page-${p.id}`,
      kind: "page",
      label: p.label,
      detail: p.detail,
      icon: p.icon,
      run: () => onNavigate(p.id)
    }));
    const members: SwitcherItem[] = guildMembers.map((m) => ({
      key: `member-${m.discordUserId}`,
      kind: "member",
      label: m.displayName,
      detail: `@${m.username} · open profile`,
      icon: "🙋",
      run: () => onOpenProfile(m.discordUserId)
    }));
    const games: SwitcherItem[] = crewGames.map((g) => ({
      key: `game-${g.appId}`,
      kind: "game",
      label: g.name,
      detail: `${g.owners.length} owner${g.owners.length === 1 ? "" : "s"} · open library`,
      icon: "🕹",
      run: () => onNavigate("library")
    }));
    return [...pages, ...members, ...games];
  }, [isAdmin, guildMembers, crewGames, onNavigate, onOpenProfile]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.filter((i) => i.kind === "page");
    return items
      .filter((i) => `${i.label} ${i.detail}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [items, query]);

  const select = (item: SwitcherItem) => {
    item.run();
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "14vh"
      }}
    >
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
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick switcher"
        style={{
          position: "relative",
          zIndex: 1,
          width: "min(560px, calc(100vw - 32px))",
          borderRadius: 16,
          background: islandTheme.color.menuBg,
          backdropFilter: islandTheme.glass.blurMenu,
          WebkitBackdropFilter: islandTheme.glass.blurMenu,
          border: `1px solid ${islandTheme.color.cardBorder}`,
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          overflow: "hidden"
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" && results[highlight]) {
              e.preventDefault();
              select(results[highlight]);
            }
          }}
          placeholder="Jump to a page, crewmate, or game…"
          aria-label="Quick switcher search"
          spellCheck={false}
          style={{
            width: "100%",
            border: "none",
            borderBottom: `1px solid ${islandTheme.color.cardBorder}`,
            background: "transparent",
            color: islandTheme.color.textPrimary,
            fontSize: 15,
            padding: "16px 18px",
            outline: "none",
            font: "inherit"
          }}
        />
        <div style={{ maxHeight: 380, overflowY: "auto", padding: 6 }}>
          {results.length === 0 ? (
            <div style={{ padding: "16px 14px", fontSize: 13, color: islandTheme.color.textMuted, textAlign: "center" }}>
              Nothing on the island matches "{query}".
            </div>
          ) : (
            results.map((item, i) => (
              <button
                key={item.key}
                type="button"
                onClick={() => select(item)}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "none",
                  background: i === highlight ? "rgba(37, 99, 235, 0.18)" : "transparent",
                  color: islandTheme.color.textPrimary,
                  cursor: "pointer",
                  font: "inherit",
                  textAlign: "left"
                }}
              >
                <span aria-hidden="true" style={{ fontSize: 17, width: 24, textAlign: "center", flexShrink: 0 }}>
                  {item.icon}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.label}
                  </span>
                  <span style={{ display: "block", fontSize: 12, color: islandTheme.color.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.detail}
                  </span>
                </span>
                <span
                  className="island-mono"
                  style={{
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: islandTheme.color.textMuted,
                    flexShrink: 0
                  }}
                >
                  {item.kind}
                </span>
              </button>
            ))
          )}
        </div>
        <div
          className="island-mono"
          style={{
            display: "flex",
            gap: 14,
            padding: "8px 14px",
            borderTop: `1px solid ${islandTheme.color.cardBorder}`,
            fontSize: 12,
            color: islandTheme.color.textMuted
          }}
        >
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
          <span>Ctrl+K toggle</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
