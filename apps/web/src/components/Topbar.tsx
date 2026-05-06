import { useEffect, useRef, useState } from "react";
import { islandTheme } from "../theme.js";
import type { MeProfile, PageId } from "../types.js";
import { UserMenu } from "./UserMenu.js";
import { MegaMenu } from "./MegaMenu.js";

type TopbarProps = {
  page: PageId;
  onNavigate: (page: PageId) => void;
  profile: MeProfile | null;
  isAdmin: boolean;
  tagline?: string;
  onLogout: () => void;
};

export function Topbar({ page, onNavigate, profile, isAdmin, tagline, onLogout }: TopbarProps) {
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (triggerRef.current?.contains(event.target as Node)) return;
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        backdropFilter: "blur(14px) saturate(140%)",
        WebkitBackdropFilter: "blur(14px) saturate(140%)",
        background: islandTheme.color.panelBg,
        borderBottom: `1px solid ${islandTheme.color.cardBorder}`
      }}
    >
      <div
        style={{
          maxWidth: islandTheme.layout.appMaxWidth,
          margin: "0 auto",
          padding: "12px clamp(0.9rem, 2vw, 1.4rem)",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap"
        }}
      >
        <Brand onNavigate={onNavigate} tagline={tagline} />
        <MegaMenu page={page} onNavigate={onNavigate} isAdmin={isAdmin} />
        <div style={{ flex: 1, minWidth: 12 }} />
        <SearchInput value={search} onChange={setSearch} />
        <UserTrigger
          buttonRef={triggerRef}
          profile={profile}
          open={menuOpen}
          onToggle={() => setMenuOpen((v) => !v)}
        />
        {menuOpen ? (
          <UserMenu
            menuRef={menuRef}
            profile={profile}
            page={page}
            isAdmin={isAdmin}
            onClose={() => setMenuOpen(false)}
            onNavigate={onNavigate}
            onLogout={onLogout}
          />
        ) : null}
      </div>
    </header>
  );
}

function Brand({ onNavigate, tagline }: { onNavigate: (page: PageId) => void; tagline?: string }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate("home")}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "transparent",
        border: "none",
        padding: "4px 6px 4px 0",
        borderRadius: 10,
        cursor: "pointer",
        font: "inherit",
        textAlign: "left"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = islandTheme.color.secondary;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 999,
          background: 'url("/boneless-island-logo.png") center/cover',
          border: `1px solid ${islandTheme.color.cardBorder}`,
          boxShadow: "0 0 0 1px rgba(255,255,255,0.04), 0 6px 16px rgba(0,0,0,0.3)",
          flexShrink: 0
        }}
      />
      <div>
        <div className="island-display" style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.01em", color: islandTheme.color.textPrimary }}>
          The Boneless Island
        </div>
        <div className="island-mono" style={{ fontSize: 11, color: islandTheme.color.textMuted, marginTop: -2 }}>
          {tagline || "crew at the shoreline"}
        </div>
      </div>
    </button>
  );
}

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
};

function SearchInput({ value, onChange }: SearchInputProps) {
  const searchIcon =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='7'/><path d='m21 21-4.3-4.3'/></svg>";
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search the island…"
      style={{
        border: `1px solid ${islandTheme.color.cardBorder}`,
        background: islandTheme.color.panelMutedBg,
        color: islandTheme.color.textPrimary,
        padding: "8px 12px 8px 34px",
        borderRadius: 999,
        fontSize: 13,
        width: 220,
        backgroundImage: `url("${searchIcon}")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "11px center",
        outline: "none"
      }}
    />
  );
}

type UserTriggerProps = {
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  profile: MeProfile | null;
  open: boolean;
  onToggle: () => void;
};

function UserTrigger({ buttonRef, profile, open, onToggle }: UserTriggerProps) {
  const initials = getInitials(profile?.displayName ?? profile?.username ?? "??");
  const handle = profile?.username ? `@${profile.username}` : "@guest";
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onToggle}
      aria-haspopup="menu"
      aria-expanded={open}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 10px 4px 4px",
        borderRadius: 999,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        background: islandTheme.color.panelMutedBg,
        color: islandTheme.color.textPrimary,
        cursor: "pointer",
        font: "inherit"
      }}
    >
      <UserAvatar profile={profile} initials={initials} size={30} />
      <span style={{ fontSize: 13, fontWeight: 600 }}>{handle}</span>
      <span style={{ color: islandTheme.color.textMuted, fontSize: 10 }}>{open ? "▲" : "▼"}</span>
    </button>
  );
}

type UserAvatarProps = {
  profile: MeProfile | null;
  initials: string;
  size: number;
};

export function UserAvatar({ profile, initials, size }: UserAvatarProps) {
  if (profile?.avatarUrl) {
    return (
      <div style={{ position: "relative", width: size, height: size }}>
        <img
          src={profile.avatarUrl}
          alt=""
          style={{
            width: size,
            height: size,
            borderRadius: 999,
            display: "block",
            objectFit: "cover"
          }}
        />
        <PresenceDot inVoice={profile.inVoice} size={Math.max(8, size * 0.32)} />
      </div>
    );
  }
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: 999,
        background: "linear-gradient(135deg, #fbbf77, #ef8354)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        color: "#3a1d10",
        fontSize: Math.max(11, Math.round(size * 0.4))
      }}
    >
      {initials}
      <PresenceDot inVoice={profile?.inVoice ?? false} size={Math.max(8, size * 0.32)} />
    </div>
  );
}

function PresenceDot({ inVoice, size }: { inVoice: boolean; size: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        bottom: -1,
        right: -1,
        width: size,
        height: size,
        borderRadius: 999,
        background: inVoice ? islandTheme.color.successAccent : islandTheme.color.textMuted,
        border: `2px solid ${islandTheme.color.panelBg}`
      }}
    />
  );
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "??";
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
