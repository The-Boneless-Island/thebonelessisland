import { type CSSProperties, type ReactNode } from "react";
import { API_BASE_URL } from "../api/client.js";
import { islandTheme } from "../theme.js";

const STEAM_DARK = "#171a21";
const STEAM_DARK_2 = "#1b2838";
const STEAM_BLUE = "#66c0f4";
const STEAM_BLUE_DEEP = "#1a9fff";

export function steamSignInUrl(): string {
  return `${API_BASE_URL}/steam/openid/start`;
}

export function SteamLogo({
  size = 18,
  tone = "light"
}: {
  size?: number;
  tone?: "light" | "dark";
}) {
  return (
    <img
      src="/steam-logo.png"
      width={size}
      height={size}
      alt="Steam"
      aria-hidden="true"
      style={{
        borderRadius: "50%",
        display: "block",
        opacity: tone === "dark" ? 0.4 : 1
      }}
    />
  );
}

export function SteamSignInButton({
  href,
  onClick,
  size = "md",
  label = "Sign in through Steam"
}: {
  href?: string;
  onClick?: () => void;
  size?: "sm" | "md";
  label?: string;
}) {
  const sm = size === "sm";
  const baseStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: sm ? 8 : 12,
    padding: sm ? "6px 12px" : "10px 18px",
    borderRadius: 6,
    background: `linear-gradient(180deg, ${STEAM_DARK_2} 0%, ${STEAM_DARK} 100%)`,
    border: "1px solid rgba(102, 192, 244, 0.35)",
    boxShadow: "0 6px 16px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.04)",
    color: "#ffffff",
    fontSize: sm ? 12 : 14,
    fontWeight: 700,
    letterSpacing: "0.01em",
    cursor: "pointer",
    textDecoration: "none",
    fontFamily: "inherit"
  };

  const innerHover = (e: React.SyntheticEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = STEAM_BLUE;
  };
  const innerLeave = (e: React.SyntheticEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = "rgba(102, 192, 244, 0.35)";
  };

  const inner = (
    <>
      <SteamLogo size={sm ? 16 : 20} tone="light" />
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1, alignItems: "flex-start" }}>
        {!sm ? (
          <span
            style={{
              fontSize: 12,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: STEAM_BLUE,
              fontWeight: 700
            }}
          >
            Steam
          </span>
        ) : null}
        <span>{label}</span>
      </span>
    </>
  );

  if (href) {
    return (
      <a href={href} style={baseStyle} onMouseEnter={innerHover} onMouseLeave={innerLeave}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} style={baseStyle} onMouseEnter={innerHover} onMouseLeave={innerLeave}>
      {inner}
    </button>
  );
}

export function SteamStatusBadge({
  linked,
  size = 28,
  onClick,
  title
}: {
  linked: boolean;
  size?: number;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? (linked ? "Steam linked" : "Steam not linked")}
      aria-label={title ?? (linked ? "Steam linked" : "Steam not linked")}
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: 999,
        border: `1px solid ${linked ? STEAM_BLUE : islandTheme.color.cardBorder}`,
        background: linked
          ? `linear-gradient(135deg, ${STEAM_DARK_2} 0%, ${STEAM_DARK} 100%)`
          : islandTheme.color.panelMutedBg,
        color: linked ? STEAM_BLUE : islandTheme.color.textMuted,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: linked ? `0 0 0 2px rgba(102, 192, 244, 0.18)` : "none",
        transition: "border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease",
        flexShrink: 0
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.04)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      <SteamLogo size={Math.round(size * 0.55)} tone={linked ? "light" : "dark"} />
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: -1,
          right: -1,
          width: Math.max(7, size * 0.28),
          height: Math.max(7, size * 0.28),
          borderRadius: 999,
          background: linked ? islandTheme.color.successAccent : islandTheme.color.textMuted,
          border: `2px solid ${islandTheme.color.panelMutedBg}`
        }}
      />
    </button>
  );
}

export function steamSyncRelativeLabel(iso: string | null | undefined): string {
  if (!iso) return "Never synced";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "Sync time unknown";
  const delta = Math.max(0, Date.now() - then);
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return "Synced just now";
  if (minutes < 60) return `Synced ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Synced ${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `Synced ${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 8) return `Synced ${weeks}w ago`;
  return `Synced ${Math.round(days / 30)}mo ago`;
}

export const steamColors = {
  dark: STEAM_DARK,
  dark2: STEAM_DARK_2,
  blue: STEAM_BLUE,
  blueDeep: STEAM_BLUE_DEEP
};

type SteamPanelProps = {
  children: ReactNode;
  style?: CSSProperties;
};

export function SteamBrandedPanel({ children, style }: SteamPanelProps) {
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${STEAM_DARK_2} 0%, ${STEAM_DARK} 100%)`,
        border: "1px solid rgba(102, 192, 244, 0.35)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        borderRadius: 14,
        color: "#dbeafe",
        ...style
      }}
    >
      {children}
    </div>
  );
}
