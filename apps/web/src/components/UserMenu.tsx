import { type ReactNode, type RefObject } from "react";
import { useDayNight, type DayNightMode, type DayNightPreference } from "../scene/useDayNight.js";
import { islandTheme } from "../theme.js";
import type { MeProfile, PageId } from "../types.js";
import { UserAvatar, getInitials } from "./Topbar.js";

type UserMenuProps = {
  menuRef: RefObject<HTMLDivElement | null>;
  profile: MeProfile | null;
  page: PageId;
  isAdmin: boolean;
  onClose: () => void;
  onNavigate: (page: PageId) => void;
  onLogout: () => void;
};

export function UserMenu({
  menuRef,
  profile,
  page,
  isAdmin,
  onClose,
  onNavigate,
  onLogout
}: UserMenuProps) {
  const { mode, preference, cyclePreference } = useDayNight();
  const initials = getInitials(profile?.displayName ?? profile?.username ?? "??");
  const handle = profile?.username ?? "guest";
  const inVoice = profile?.inVoice ?? false;
  const presence = profile?.richPresenceText?.trim() ?? null;
  const steamLinked = Boolean(profile?.steamId64);

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        right: 0,
        width: islandTheme.layout.menuMaxWidth,
        maxWidth: "calc(100vw - 24px)",
        background: islandTheme.color.menuBg,
        backdropFilter: islandTheme.glass.blurMenu,
        WebkitBackdropFilter: islandTheme.glass.blurMenu,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        borderRadius: 12,
        boxShadow: "0 20px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.05) inset",
        overflow: "hidden",
        zIndex: 50
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          height: 36,
          background:
            mode === "day"
              ? "linear-gradient(135deg, #fbbf24 0%, #f97316 50%, #ec4899 100%)"
              : "linear-gradient(135deg, #1e3a8a 0%, #0c4a6e 50%, #0e7490 100%)",
          flexShrink: 0
        }}
      />

      {/* ── Identity ── */}
      <div style={{ padding: "0 12px 10px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: -22 }}>
          {/* Avatar with presence dot */}
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 999,
              border: `3px solid ${islandTheme.color.panelBg}`,
              flexShrink: 0,
              position: "relative"
            }}
          >
            <UserAvatar profile={profile} initials={initials} size={40} />
            {inVoice ? (
              <span
                aria-label="In voice"
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: -1,
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: islandTheme.color.primaryGlow,
                  border: `2px solid ${islandTheme.color.panelBg}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 6
                }}
              >
                🎙
              </span>
            ) : null}
          </div>

          {/* Name + handle */}
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
            <div
              className="island-display"
              style={{
                fontWeight: 700,
                fontSize: 14,
                lineHeight: 1.2,
                color: islandTheme.color.textPrimary,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {profile?.displayName ?? "Not signed in"}
            </div>
            <div
              className="island-mono"
              style={{
                color: islandTheme.color.textMuted,
                fontSize: 12,
                marginTop: 1
              }}
            >
              @{handle}
            </div>
          </div>
        </div>

        {/* Rich presence */}
        {presence ? (
          <div
            style={{
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 8px",
              borderRadius: 6,
              background: islandTheme.color.panelMutedBg,
              border: `1px solid ${islandTheme.color.cardBorder}`,
              fontSize: 12,
              color: islandTheme.color.textMuted
            }}
          >
            <span style={{ fontSize: 12, flexShrink: 0 }}>🎮</span>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {presence}
            </span>
          </div>
        ) : null}
      </div>

      {/* ── Divider ── */}
      <Divider />

      {/* ── Nav items ── */}
      <div style={{ padding: "4px 6px" }}>
        <NavItem
          icon="🪪"
          active={page === "profile"}
          onClick={() => { onClose(); onNavigate("profile"); }}
        >
          View profile
        </NavItem>

        {isAdmin ? (
          <NavItem
            icon="🛡️"
            active={page === "admin"}
            onClick={() => { onClose(); onNavigate("admin"); }}
            badge="PARENT"
            badgeColor="#f59e0b"
          >
            Admin panel
          </NavItem>
        ) : null}

        <SteamNavItem
          linked={steamLinked}
          onClick={() => { onClose(); onNavigate("settings"); }}
        />

        <NavItem
          icon="⚙️"
          active={page === "settings"}
          onClick={() => { onClose(); onNavigate("settings"); }}
        >
          Settings
        </NavItem>

        <ThemeNavItem mode={mode} preference={preference} onCycle={cyclePreference} />
      </div>

      {/* ── Divider ── */}
      <Divider />

      <div style={{ padding: "4px 6px 6px" }}>
        <NavItem
          icon="↩"
          danger
          onClick={() => { onClose(); onLogout(); }}
        >
          Sign out
        </NavItem>
      </div>
    </div>
  );
}

/* ── Shared divider ── */

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: islandTheme.color.cardBorder,
        margin: "0 10px"
      }}
    />
  );
}

/* ── Nav item (Fluent/Atlassian pattern) ── */

type NavItemProps = {
  icon: ReactNode;
  children: ReactNode;
  active?: boolean;
  danger?: boolean;
  badge?: string;
  badgeColor?: string;
  onClick?: () => void;
  rightSlot?: ReactNode;
};

function NavItem({ icon, children, active, danger, badge, badgeColor, onClick, rightSlot }: NavItemProps) {
  const accentColor = danger
    ? "#ef4444"
    : active
    ? islandTheme.color.primaryGlow
    : islandTheme.color.primaryGlow;

  const baseBg = active && !danger ? "rgba(56,189,248,0.08)" : "transparent";
  const baseColor = danger
    ? islandTheme.color.dangerText
    : active
    ? islandTheme.color.textPrimary
    : islandTheme.color.textSubtle;

  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "6px 8px",
        borderRadius: 7,
        border: "none",
        borderLeft: active && !danger ? `2px solid ${accentColor}` : "2px solid transparent",
        background: baseBg,
        color: baseColor,
        fontSize: 13,
        fontFamily: "inherit",
        fontWeight: active ? 600 : 400,
        textAlign: "left",
        cursor: "pointer",
        transition: "background 120ms ease, color 120ms ease, border-color 120ms ease"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger
          ? "rgba(239,68,68,0.1)"
          : "rgba(56,189,248,0.08)";
        e.currentTarget.style.color = danger
          ? "#fca5a5"
          : islandTheme.color.textPrimary;
        if (!active) e.currentTarget.style.borderLeftColor = danger ? "#ef4444" : accentColor;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = baseBg;
        e.currentTarget.style.color = baseColor;
        e.currentTarget.style.borderLeftColor = active && !danger ? accentColor : "transparent";
      }}
    >
      {/* Icon container */}
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: 6,
          background: active
            ? "rgba(56,189,248,0.15)"
            : danger
            ? "rgba(239,68,68,0.1)"
            : "rgba(255,255,255,0.05)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          flexShrink: 0
        }}
      >
        {icon}
      </span>

      <span style={{ flex: 1 }}>{children}</span>

      {badge ? (
        <span
          className="island-mono"
          style={{
            padding: "1px 5px",
            borderRadius: 999,
            background: `${badgeColor ?? islandTheme.color.primaryGlow}22`,
            color: badgeColor ?? islandTheme.color.primaryGlow,
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.06em",
            flexShrink: 0
          }}
        >
          {badge}
        </span>
      ) : null}

      {rightSlot ?? (
        onClick ? (
          <span
            style={{
              color: islandTheme.color.textMuted,
              fontSize: 12,
              flexShrink: 0,
              opacity: 0.5
            }}
          >
            ›
          </span>
        ) : null
      )}
    </button>
  );
}

/* ── Steam nav item ── */

function SteamNavItem({ linked, onClick }: { linked: boolean; onClick: () => void }) {
  const dotColor = linked ? "#22c55e" : "#ef4444";

  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "6px 8px",
        borderRadius: 7,
        border: "none",
        borderLeft: "2px solid transparent",
        background: "transparent",
        color: islandTheme.color.textSubtle,
        fontSize: 13,
        fontFamily: "inherit",
        fontWeight: 400,
        textAlign: "left",
        cursor: "pointer",
        transition: "background 120ms ease, color 120ms ease, border-color 120ms ease"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(56,189,248,0.08)";
        e.currentTarget.style.color = islandTheme.color.textPrimary;
        e.currentTarget.style.borderLeftColor = islandTheme.color.primaryGlow;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = islandTheme.color.textSubtle;
        e.currentTarget.style.borderLeftColor = "transparent";
      }}
    >
      {/* Steam logo + status dot overlay */}
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: 6,
          background: "rgba(255,255,255,0.05)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          position: "relative"
        }}
      >
        <img
          src="/steam-logo.png"
          width={18}
          height={18}
          alt="Steam"
          aria-hidden="true"
          style={{ borderRadius: "50%", display: "block" }}
        />
        {/* Status dot — bottom-left of the icon container */}
        <span
          aria-label={linked ? "Steam synced" : "Steam not synced"}
          style={{
            position: "absolute",
            bottom: 1,
            left: 1,
            width: 8,
            height: 8,
            borderRadius: 999,
            background: dotColor,
            border: `2px solid ${islandTheme.color.panelBg}`,
            boxShadow: `0 0 4px ${dotColor}88`
          }}
        />
      </span>

      <span style={{ flex: 1 }}>
        {linked ? "Steam synced" : "Steam not synced"}
      </span>

      <span
        style={{
          color: islandTheme.color.textMuted,
          fontSize: 12,
          flexShrink: 0,
          opacity: 0.5
        }}
      >
        ›
      </span>
    </button>
  );
}

/* ── Theme nav item ── */

function ThemeNavItem({
  mode,
  preference,
  onCycle
}: {
  mode: DayNightMode;
  preference: DayNightPreference;
  onCycle: () => void;
}) {
  const day = mode === "day";
  const auto = preference === "auto";
  // Auto reflects whatever the clock resolved to; explicit choices show their icon.
  const icon = auto ? "🌗" : day ? "☀️" : "🌙";
  // Show the resolved mode alongside auto so people discover auto exists.
  const label = auto ? `${day ? "Day" : "Night"} · auto` : day ? "Day" : "Night";
  return (
    <NavItem
      icon={icon}
      onClick={onCycle}
      rightSlot={
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span
            className="island-mono"
            style={{ fontSize: 12, color: islandTheme.color.textMuted }}
          >
            {label}
          </span>
          <ThemeSwitch on={day} dimmed={auto} />
        </span>
      }
    >
      Theme
    </NavItem>
  );
}

function ThemeSwitch({ on, dimmed = false }: { on: boolean; dimmed?: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 32,
        height: 18,
        borderRadius: 999,
        background: on ? "rgba(244,162,97,0.4)" : islandTheme.color.panelMutedBg,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        position: "relative",
        transition: "background 280ms ease",
        flexShrink: 0,
        opacity: dimmed ? 0.65 : 1
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 16 : 2,
          width: 12,
          height: 12,
          borderRadius: 999,
          background: on
            ? "linear-gradient(135deg, #fde68a, #f59e0b)"
            : "linear-gradient(135deg, #e2e8f0, #94a3b8)",
          transition: "left 280ms cubic-bezier(.5,0,.25,1), background 280ms",
          boxShadow: "0 1px 4px rgba(0,0,0,0.35)"
        }}
      />
    </span>
  );
}
