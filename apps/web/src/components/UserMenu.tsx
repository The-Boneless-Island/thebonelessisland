import { type CSSProperties, type ReactNode, type RefObject } from "react";
import { useDayNight } from "../scene/useDayNight.js";
import { islandTheme } from "../theme.js";
import type { MeProfile, PageId } from "../types.js";
import { SteamLogo, steamColors, steamSignInUrl, steamSyncRelativeLabel } from "./steam.js";
import { UserAvatar, getInitials } from "./Topbar.js";

type UserMenuProps = {
  menuRef: RefObject<HTMLDivElement | null>;
  profile: MeProfile | null;
  page: PageId;
  isAdmin: boolean;
  onClose: () => void;
  onNavigate: (page: PageId) => void;
  onLogout: () => void;
  onSyncSteam: () => void;
  onLinkSteam: () => void;
};

export function UserMenu({
  menuRef,
  profile,
  page,
  isAdmin,
  onClose,
  onNavigate,
  onLogout,
  onSyncSteam,
  onLinkSteam
}: UserMenuProps) {
  const { mode, toggle } = useDayNight();

  const initials = getInitials(profile?.displayName ?? profile?.username ?? "??");
  const handle = profile?.username ?? "guest";
  const inVoice = profile?.inVoice ?? false;
  const presence = profile?.richPresenceText?.trim() ?? null;

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        right: "clamp(0.9rem, 2vw, 1.4rem)",
        width: 300,
        maxWidth: "calc(100vw - 24px)",
        background: islandTheme.color.panelBg,
        backdropFilter: islandTheme.glass.blurStrong,
        WebkitBackdropFilter: islandTheme.glass.blurStrong,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        borderRadius: 14,
        boxShadow: "0 16px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04) inset",
        overflow: "hidden",
        zIndex: 50
      }}
    >
      {/* ── Header banner ── */}
      <div
        style={{
          height: 48,
          background:
            mode === "day"
              ? "linear-gradient(135deg, #fbbf24 0%, #f97316 50%, #ec4899 100%)"
              : "linear-gradient(135deg, #1e3a8a 0%, #0c4a6e 50%, #0e7490 100%)",
          position: "relative",
          flexShrink: 0
        }}
      />

      {/* ── Identity block ── */}
      <div style={{ padding: "0 14px 10px" }}>
        {/* Avatar overlaps banner */}
        <div style={{ marginTop: -26, marginBottom: 8 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 999,
              border: `3px solid ${islandTheme.color.panelBg}`,
              display: "inline-block"
            }}
          >
            <UserAvatar profile={profile} initials={initials} size={46} />
          </div>
        </div>

        <div className="island-display" style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.2 }}>
          {profile?.displayName ?? "Not signed in"}
        </div>
        <div
          className="island-mono"
          style={{ color: islandTheme.color.textMuted, fontSize: 11, marginTop: 2 }}
        >
          @{handle}
        </div>

        {/* Rich presence — only when there's something real */}
        {presence ? (
          <div
            style={{
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "6px 8px",
              borderRadius: 8,
              background: islandTheme.color.panelMutedBg,
              border: `1px solid ${islandTheme.color.cardBorder}`,
              fontSize: 12,
              color: islandTheme.color.textSubtle
            }}
          >
            <span style={{ fontSize: 13 }}>🎮</span>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {presence}
            </span>
            {inVoice ? (
              <span
                className="island-mono"
                style={{ fontSize: 10, color: islandTheme.color.primaryGlow, flexShrink: 0 }}
              >
                ● voice
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── Divider ── */}
      <div style={{ height: 1, background: islandTheme.color.cardBorder, margin: "0 14px" }} />

      {/* ── Actions ── */}
      <div style={{ padding: "6px 8px" }}>
        <MenuLink
          icon="🪪"
          onClick={() => {
            onClose();
            onNavigate("profile");
          }}
        >
          View profile
        </MenuLink>

        {isAdmin ? (
          <AdminMenuRow
            active={page === "admin"}
            onClick={() => {
              onClose();
              onNavigate("admin");
            }}
          />
        ) : null}

        <SteamMenuRow
          linked={Boolean(profile?.steamId64)}
          steamId64={profile?.steamId64 ?? null}
          lastSyncedAt={profile?.steamLastSyncedAt ?? null}
          onSync={() => {
            onClose();
            onSyncSteam();
          }}
          onLink={() => {
            onClose();
            onLinkSteam();
          }}
        />

        <ThemeRow mode={mode} onToggle={toggle} />
      </div>

      {/* ── Divider ── */}
      <div style={{ height: 1, background: islandTheme.color.cardBorder, margin: "0 14px" }} />

      <div style={{ padding: "4px 8px 6px" }}>
        <MenuLink
          icon="↩"
          danger
          onClick={() => {
            onClose();
            onLogout();
          }}
        >
          Sign out of the island
        </MenuLink>
      </div>
    </div>
  );
}

/* ── Admin row ── */

function AdminMenuRow({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 10px",
        borderRadius: 8,
        color: active ? "#fde68a" : islandTheme.color.textSubtle,
        fontSize: 13,
        border: "none",
        background: active ? "rgba(245, 158, 11, 0.14)" : "transparent",
        textAlign: "left",
        width: "100%",
        font: "inherit",
        cursor: "pointer",
        transition: "background 140ms ease"
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "rgba(245, 158, 11, 0.1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active ? "rgba(245, 158, 11, 0.14)" : "transparent";
      }}
    >
      <span style={{ width: 18, textAlign: "center", opacity: 0.85 }}>🛡️</span>
      <span style={{ flex: 1 }}>Admin panel</span>
      <span
        className="island-mono"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 18,
          height: 14,
          padding: "0 4px",
          borderRadius: 999,
          background: "linear-gradient(135deg, #f59e0b, #d97706)",
          color: "#0f172a",
          fontSize: 9,
          fontWeight: 800
        }}
      >
        PARENT
      </span>
    </button>
  );
}

/* ── Steam row ── */

type SteamMenuRowProps = {
  linked: boolean;
  steamId64: string | null;
  lastSyncedAt: string | null;
  onSync: () => void;
  onLink: () => void;
};

function SteamMenuRow({ linked, steamId64, lastSyncedAt, onSync, onLink }: SteamMenuRowProps) {
  if (!linked) {
    return (
      <div style={{ padding: "4px 2px" }}>
        <a
          href={steamSignInUrl()}
          onClick={onLink}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            borderRadius: 8,
            background: `linear-gradient(180deg, ${steamColors.dark2} 0%, ${steamColors.dark} 100%)`,
            border: `1px solid rgba(102, 192, 244, 0.35)`,
            textDecoration: "none",
            cursor: "pointer",
            transition: "border-color 140ms ease, box-shadow 140ms ease"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = steamColors.blue;
            e.currentTarget.style.boxShadow = `0 0 0 1px ${steamColors.blue}22`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(102, 192, 244, 0.35)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: "rgba(102, 192, 244, 0.12)",
              border: `1px solid rgba(102, 192, 244, 0.25)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}
          >
            <SteamLogo size={16} tone="light" />
          </span>
          <span style={{ flex: 1, display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
            <span
              className="island-mono"
              style={{ fontSize: 9, letterSpacing: "0.16em", color: steamColors.blue, fontWeight: 700, textTransform: "uppercase" }}
            >
              Steam
            </span>
            <span style={{ fontSize: 12, color: "#ffffff", fontWeight: 600 }}>Sign in through Steam</span>
          </span>
          <span
            className="island-mono"
            style={{
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 999,
              background: "rgba(102, 192, 244, 0.14)",
              color: steamColors.blue,
              fontWeight: 700,
              flexShrink: 0
            }}
          >
            + connect
          </span>
        </a>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSync}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 10px",
        borderRadius: 8,
        color: islandTheme.color.textSubtle,
        fontSize: 13,
        background: "transparent",
        border: "1px solid transparent",
        borderLeft: `3px solid transparent`,
        cursor: "pointer",
        width: "100%",
        fontFamily: "inherit",
        textAlign: "left",
        transition: "background 140ms ease, border-color 140ms ease"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(27, 40, 56, 0.6)";
        e.currentTarget.style.borderLeftColor = steamColors.blue;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.borderLeftColor = "transparent";
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: `linear-gradient(135deg, ${steamColors.dark2} 0%, ${steamColors.dark} 100%)`,
          border: `1px solid rgba(102, 192, 244, 0.2)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0
        }}
      >
        <SteamLogo size={15} tone="light" />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>Sync Steam library</span>
      <span
        className="island-mono"
        style={{
          fontSize: 10,
          color: steamColors.blue,
          flexShrink: 0
        }}
      >
        {steamSyncRelativeLabel(lastSyncedAt)}
      </span>
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: islandTheme.color.successAccent,
          flexShrink: 0
        }}
      />
    </button>
  );
}

/* ── Menu link ── */

type MenuLinkProps = {
  icon: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  rightSlot?: ReactNode;
};

function MenuLink({ icon, children, onClick, danger, rightSlot }: MenuLinkProps) {
  const baseStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "7px 10px",
    borderRadius: 8,
    color: danger ? islandTheme.color.dangerText : islandTheme.color.textSubtle,
    cursor: onClick ? "pointer" : "default",
    fontSize: 13,
    border: "none",
    background: "transparent",
    textAlign: "left",
    width: "100%",
    font: "inherit"
  };
  return (
    <button
      type="button"
      onClick={onClick}
      style={baseStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger
          ? "rgba(127, 29, 29, 0.3)"
          : islandTheme.color.secondary;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span style={{ width: 18, textAlign: "center", opacity: 0.85 }}>{icon}</span>
      <span style={{ flex: 1 }}>{children}</span>
      {rightSlot}
    </button>
  );
}

/* ── Theme row ── */

function ThemeRow({ mode, onToggle }: { mode: "day" | "night"; onToggle: () => void }) {
  const day = mode === "day";
  return (
    <MenuLink
      icon={day ? "☀️" : "🌙"}
      onClick={onToggle}
      rightSlot={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className="island-mono"
            style={{ fontSize: 10, color: islandTheme.color.textMuted }}
          >
            {day ? "Day" : "Night"}
          </span>
          <ThemeSwitch on={day} />
        </span>
      }
    >
      Theme
    </MenuLink>
  );
}

function ThemeSwitch({ on }: { on: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 36,
        height: 20,
        borderRadius: 999,
        background: on ? "rgba(244, 162, 97, 0.45)" : islandTheme.color.panelMutedBg,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        position: "relative",
        transition: "background 320ms ease",
        flexShrink: 0
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          width: 14,
          height: 14,
          borderRadius: 999,
          background: on
            ? "linear-gradient(135deg, #fde68a, #f59e0b)"
            : "linear-gradient(135deg, #e2e8f0, #94a3b8)",
          transition: "left 320ms cubic-bezier(.5,0,.25,1), background 320ms",
          boxShadow: "0 2px 4px rgba(0,0,0,0.35)"
        }}
      />
    </span>
  );
}
