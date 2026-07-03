import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { islandTheme } from "./theme.js";

export type IslandButtonVariant = "primary" | "secondary" | "cta" | "ghost" | "danger";
export type IslandButtonSize = "sm" | "md" | "lg";

export const islandInputStyle: CSSProperties = {
  background: islandTheme.color.panelMutedBg,
  color: islandTheme.color.textPrimary,
  border: `1px solid ${islandTheme.color.border}`,
  borderRadius: islandTheme.radius.control,
  padding: "0.5rem 0.65rem"
};

export const islandCardStyle: CSSProperties = {
  background: islandTheme.color.panelBg,
  backdropFilter: islandTheme.glass.blur,
  WebkitBackdropFilter: islandTheme.glass.blur,
  border: `1px solid ${islandTheme.color.cardBorder}`,
  borderRadius: islandTheme.radius.card,
  padding: islandTheme.spacing.cardPadding
};

export function islandButtonStyle(variant: IslandButtonVariant, hov = false, light = false): CSSProperties {
  const base: CSSProperties = {
    borderRadius: islandTheme.radius.control,
    border: "none",
    cursor: "pointer",
  };
  switch (variant) {
    case "primary":
      return {
        ...base,
        background: "linear-gradient(180deg,#5b8bff 0%,#2f63ef 55%,#2450d8 100%)",
        color: "#f3f7ff",
        boxShadow: hov
          ? "0 10px 28px -8px rgba(59,130,246,.7), 0 0 0 1px rgba(120,160,255,.6) inset, 0 1px 0 rgba(255,255,255,.45) inset"
          : "0 6px 18px -8px rgba(37,80,216,.6), 0 1px 0 rgba(255,255,255,.35) inset",
      };
    case "cta":
      return {
        ...base,
        background: "linear-gradient(180deg,#ffd98c 0%,#ff9d5a 55%,#ff7a59 100%)",
        color: "#3a1208",
        boxShadow: hov
          ? "0 12px 30px -8px rgba(255,140,90,.75), 0 1px 0 rgba(255,255,255,.55) inset"
          : "0 6px 18px -8px rgba(255,120,90,.55), 0 1px 0 rgba(255,255,255,.45) inset",
      };
    case "secondary":
      return light
        ? {
            ...base,
            background: hov ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.7)",
            color: "#173559",
            boxShadow: hov
              ? "0 8px 22px -10px rgba(20,50,90,.4), 0 0 0 1px rgba(47,99,239,.45) inset"
              : "0 0 0 1px rgba(40,80,140,.2) inset, 0 2px 8px -4px rgba(20,50,90,.3)",
            backdropFilter: "blur(8px)",
          }
        : {
            ...base,
            background: hov ? "rgba(40,60,96,.85)" : "rgba(28,44,74,.7)",
            color: "#dbe6f5",
            boxShadow: hov
              ? "0 8px 22px -10px rgba(0,0,0,.6), 0 0 0 1px rgba(120,160,255,.5) inset"
              : "0 0 0 1px rgba(120,150,200,.22) inset",
            backdropFilter: "blur(8px)",
          };
    case "ghost":
      return light
        ? {
            ...base,
            background: hov ? "rgba(255,255,255,.45)" : "rgba(255,255,255,.28)",
            color: "#1d4068",
            boxShadow: hov ? "0 0 0 1px rgba(40,80,140,.4) inset" : "0 0 0 1px rgba(40,80,140,.2) inset",
          }
        : {
            ...base,
            background: "transparent",
            color: "#aebfd6",
            boxShadow: hov ? "0 0 0 1px rgba(150,180,220,.4) inset" : "0 0 0 1px rgba(120,150,200,.18) inset",
          };
    case "danger":
      return {
        ...base,
        background: islandTheme.color.danger,
        color: islandTheme.color.dangerText,
        boxShadow: hov ? "0 8px 22px -10px rgba(127,29,29,.6)" : undefined,
      };
  }
}

type IslandButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: IslandButtonVariant;
  size?: IslandButtonSize;
  light?: boolean;
};

export function IslandButton({ variant = "secondary", size = "md", light = false, style, className, children, onMouseEnter, onMouseLeave, ...props }: IslandButtonProps) {
  const [hov, setHov] = useState(false);
  const pad = size === "lg" ? "13px 22px" : size === "sm" ? "8px 13px" : "11px 17px";
  const fs = size === "lg" ? 16 : size === "sm" ? 13 : 14.5;
  return (
    <button
      {...props}
      className={`island-btn${className ? ` ${className}` : ""}`}
      onMouseEnter={(e) => { setHov(true); onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHov(false); onMouseLeave?.(e); }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: pad,
        fontSize: fs,
        fontFamily: islandTheme.font.display,
        fontWeight: 700,
        letterSpacing: "0.01em",
        ...islandButtonStyle(variant, hov, light),
        ...style
      }}
    >
      <span className="bi-sheen" aria-hidden="true" />
      {children}
    </button>
  );
}

type IslandCardProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "div" | "article";
};

export function IslandCard({ as = "section", style, ...props }: IslandCardProps) {
  const Tag = as;
  return <Tag {...props} style={{ ...islandCardStyle, ...style }} />;
}

type IslandMemberChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  selected: boolean;
};

export function IslandMemberChip({ label, selected, style, ...props }: IslandMemberChipProps) {
  return (
    <button
      {...props}
      style={{
        ...islandButtonStyle("secondary"),
        borderRadius: 999,
        background: selected ? islandTheme.color.primary : islandTheme.color.secondary,
        color: islandTheme.color.textPrimary,
        border: selected ? `1px solid ${islandTheme.color.primary}` : `1px solid ${islandTheme.color.border}`,
        padding: "0.26rem 0.62rem",
        ...style
      }}
    >
      {selected ? "✓ " : ""}
      {" "}
      {label}
    </button>
  );
}

type IslandGameCardProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  title: string;
  subtitle: string;
  imageUrl?: string | null;
  imageFallbackUrls?: string[];
  selected: boolean;
};

export function IslandGameCard({
  title,
  subtitle,
  imageUrl,
  imageFallbackUrls = [],
  selected,
  style,
  ...props
}: IslandGameCardProps) {
  const imageKey = `${imageUrl ?? ""}|${imageFallbackUrls.join("|")}`;
  const imageCandidates = useMemo(
    () =>
      Array.from(new Set([imageUrl ?? "", ...imageFallbackUrls].filter((value) => value.trim().length > 0))),
    [imageKey]
  );
  const [imageIndex, setImageIndex] = useState(0);
  const [showImageFallback, setShowImageFallback] = useState(false);
  const activeImageUrl = !showImageFallback ? imageCandidates[imageIndex] ?? null : null;

  useEffect(() => {
    setImageIndex(0);
    setShowImageFallback(false);
  }, [imageKey]);

  return (
    <button
      {...props}
      style={{
        ...islandButtonStyle("secondary"),
        textAlign: "left",
        border: selected ? `2px solid ${islandTheme.color.primaryGlow}` : `1px solid ${islandTheme.color.border}`,
        background: selected ? islandTheme.color.info : islandTheme.color.panelMutedBg,
        color: islandTheme.color.textPrimary,
        padding: 8,
        ...style
      }}
    >
      {activeImageUrl ? (
        <img
          src={activeImageUrl}
          alt={title}
          onError={() => {
            setImageIndex((current) => {
              if (current + 1 < imageCandidates.length) {
                return current + 1;
              }
              setShowImageFallback(true);
              return current;
            });
          }}
          style={{
            width: "100%",
            height: 90,
            objectFit: "cover",
            borderRadius: 6,
            border: `1px solid ${islandTheme.color.border}`
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{
            width: "100%",
            height: 90,
            borderRadius: 6,
            border: `1px solid ${islandTheme.color.border}`,
            background: islandTheme.gradient.gameArtFallback,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: islandTheme.color.textSubtle,
            fontSize: 12,
            letterSpacing: 0.2
          }}
        >
          Island art incoming
        </div>
      )}
      <div style={{ marginTop: 6, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 12, color: islandTheme.color.textSubtle }}>{subtitle}</div>
    </button>
  );
}

type IslandComingSoonTileProps = HTMLAttributes<HTMLDivElement> & {
  title?: string;
  description?: string;
};

export function IslandComingSoonTile({
  title = "Coming Soon",
  description = "Reserved for future modules.",
  style,
  ...props
}: IslandComingSoonTileProps) {
  return (
    <div
      {...props}
      aria-disabled="true"
      style={{
        width: "100%",
        minHeight: "clamp(160px, 24vw, 250px)",
        borderRadius: islandTheme.radius.surface,
        textAlign: "left",
        color: islandTheme.color.textMuted,
        padding: "1rem",
        border: `1px dashed ${islandTheme.color.border}`,
        background: islandTheme.gradient.comingSoonTile,
        boxShadow: islandTheme.shadow.tileComingSoon,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        overflow: "hidden",
        ...style
      }}
    >
      <div>
        <div
          style={{
            fontSize: "clamp(1.75rem, 3.4vw, 2.25rem)",
            fontWeight: 700,
            lineHeight: 1.05,
            marginBottom: 10,
            color: islandTheme.color.textSubtle
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 16, lineHeight: 1.3 }}>{description}</div>
      </div>
    </div>
  );
}

type IslandNewsPlaceholderCardProps = HTMLAttributes<HTMLElement> & {
  title: string;
  meta: string;
};

export function IslandNewsPlaceholderCard({ title, meta, style, ...props }: IslandNewsPlaceholderCardProps) {
  return (
    <article
      {...props}
      style={{
        border: `1px solid ${islandTheme.color.border}`,
        borderRadius: islandTheme.radius.control,
        padding: "0.7rem",
        background: islandTheme.color.panelMutedBg,
        backdropFilter: islandTheme.glass.blur,
        WebkitBackdropFilter: islandTheme.glass.blur,
        ...style
      }}
    >
      <strong>{title}</strong>
      <div style={{ fontSize: 13, color: islandTheme.color.textSubtle }}>{meta}</div>
    </article>
  );
}

type IslandActiveMemberRowProps = HTMLAttributes<HTMLDivElement> & {
  displayName: string;
  avatarUrl?: string | null;
  presenceText: string;
  inVoice?: boolean;
};

export function IslandActiveMemberRow({
  displayName,
  avatarUrl,
  presenceText,
  inVoice = false,
  style,
  ...props
}: IslandActiveMemberRowProps) {
  return (
    <div
      {...props}
      style={{
        border: `1px solid ${islandTheme.color.border}`,
        borderRadius: islandTheme.radius.control,
        padding: "0.55rem 0.7rem",
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: islandTheme.color.panelMutedBg,
        backdropFilter: islandTheme.glass.blur,
        WebkitBackdropFilter: islandTheme.glass.blur,
        ...style
      }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          style={{ width: 34, height: 34, borderRadius: "999px", border: `1px solid ${islandTheme.color.border}` }}
        />
      ) : null}
      <div>
        <div style={{ fontWeight: 700 }}>{displayName}</div>
        <div style={{ fontSize: 12, opacity: 0.9 }}>
          {presenceText}
          {inVoice ? " - in voice" : ""}
        </div>
      </div>
    </div>
  );
}

type IslandStatusPillProps = HTMLAttributes<HTMLSpanElement> & {
  tone: "success" | "danger";
  children: ReactNode;
};

export function IslandStatusPill({ tone, children, style, ...props }: IslandStatusPillProps) {
  const color = tone === "success" ? "#22c55e" : "#ef4444";
  return (
    <span
      {...props}
      className="island-mono"
      style={{
        ...islandTagStyle({ color }),
        alignSelf: "flex-end",
        ...style
      }}
    >
      {children}
    </span>
  );
}

// ── Skeletons ─────────────────────────────────────────────────────────────────
// Shimmering glass placeholders shown while data loads. The pulse animation is
// defined globally (islandSkeletonPulse) and disabled under reduced motion.

type IslandSkeletonProps = HTMLAttributes<HTMLDivElement> & {
  width?: number | string;
  height?: number | string;
  radius?: number;
};

export function IslandSkeleton({ width = "100%", height = 14, radius = 6, style, ...props }: IslandSkeletonProps) {
  return (
    <div
      {...props}
      aria-hidden="true"
      style={{
        width,
        height,
        borderRadius: radius,
        background: islandTheme.color.panelMutedBg,
        animation: "islandSkeletonPulse 1.4s ease-in-out infinite",
        ...style
      }}
    />
  );
}

/** A text-shaped skeleton row: avatar circle + two lines. */
export function IslandSkeletonRow({ style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      aria-hidden="true"
      style={{ display: "grid", gridTemplateColumns: "36px 1fr", gap: 10, alignItems: "center", ...style }}
    >
      <IslandSkeleton width={36} height={36} radius={999} />
      <div style={{ display: "grid", gap: 6 }}>
        <IslandSkeleton width="55%" height={12} />
        <IslandSkeleton width="80%" height={10} />
      </div>
    </div>
  );
}

/** A card-shaped skeleton: title line + body block. */
export function IslandSkeletonCard({ lines = 3, style, ...props }: HTMLAttributes<HTMLDivElement> & { lines?: number }) {
  return (
    <section {...props} aria-hidden="true" style={{ ...islandCardStyle, display: "grid", gap: 10, ...style }}>
      <IslandSkeleton width="40%" height={14} />
      {Array.from({ length: lines }, (_, i) => (
        <IslandSkeleton key={i} width={`${90 - i * 12}%`} height={11} />
      ))}
    </section>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
// One component for every "nothing here" moment: mascot art slot + island-
// voiced copy + optional action. Art defaults to a silhouette placeholder until
// the real nugget mascot set lands (see /public/mascot/).

export type IslandMascotPose = "wave" | "snooze" | "shrug" | "diver" | "crown";

const MASCOT_SRC: Record<IslandMascotPose, string> = {
  wave: "/mascot/nugget-wave.svg",
  snooze: "/mascot/nugget-snooze.svg",
  shrug: "/mascot/nugget-shrug.svg",
  diver: "/mascot/nugget-diver.svg",
  crown: "/mascot/nugget-crown.svg"
};

type IslandEmptyStateProps = {
  pose?: IslandMascotPose;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  style?: CSSProperties;
};

export function IslandEmptyState({ pose = "wave", title, body, action, compact = false, style }: IslandEmptyStateProps) {
  const size = compact ? 56 : 88;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 8,
        padding: compact ? "18px 16px" : "30px 20px",
        ...style
      }}
    >
      <img
        src={MASCOT_SRC[pose]}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        style={{ display: "block", opacity: 0.92 }}
        onError={(e) => {
          // Mascot art not shipped yet — hide the slot rather than show a broken image.
          e.currentTarget.style.display = "none";
        }}
      />
      <div style={{ fontSize: compact ? 13 : 15, fontWeight: 700, color: islandTheme.color.textPrimary }}>
        {title}
      </div>
      {body ? (
        <div style={{ fontSize: 13, color: islandTheme.color.textSubtle, lineHeight: 1.5, maxWidth: "46ch" }}>
          {body}
        </div>
      ) : null}
      {action ? <div style={{ marginTop: 6 }}>{action}</div> : null}
    </div>
  );
}

// ── IslandTag ─────────────────────────────────────────────────────────────────

type IslandTagTone = "default" | "primary" | "success" | "warning" | "danger" | "info";

const SEMANTIC_TAG_COLORS: Record<IslandTagTone, string> = {
  default: "#94a3b8",
  primary: "#38bdf8",
  success: "#22c55e",
  warning: "#f59e0b",
  danger:  "#ef4444",
  info:    "#22d3ee",
};

export const TAG_CATEGORY_COLORS: Record<string, string> = {
  // Editorial / news
  News: "#fb923c",
  Announcement: "#fbbf24",
  Update: "#22d3ee",
  Patch: "#22d3ee",
  Review: "#a78bfa",
  Interview: "#e879f9",
  Opinion: "#f472b6",
  Leak: "#ef4444",
  Rumor: "#fb7185",
  Trailer: "#facc15",
  // Genres
  FPS: "#ef4444",
  RPG: "#a855f7",
  Strategy: "#3b82f6",
  Horror: "#dc2626",
  Platformer: "#14b8a6",
  Survival: "#22c55e",
  "Battle Royale": "#f97316",
  MOBA: "#8b5cf6",
  Racing: "#eab308",
  Puzzle: "#06b6d4",
  Fighting: "#f43f5e",
  Sim: "#84cc16",
  MMO: "#0ea5e9",
  // Platforms
  PC: "#94a3b8",
  PlayStation: "#3b82f6",
  Xbox: "#16a34a",
  Nintendo: "#ef4444",
  Mobile: "#a78bfa",
  VR: "#06b6d4"
};

export function getTagColor(tag: string): string {
  if (TAG_CATEGORY_COLORS[tag]) return TAG_CATEGORY_COLORS[tag];
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = ((h << 5) - h + tag.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 60%, 62%)`;
}

export function islandTagStyle(opts: { color: string; active?: boolean; light?: boolean }): CSSProperties {
  const { color, active = false, light = false } = opts;
  const bgOpacity = active ? "55" : light ? "38" : "24";
  const borderOpacity = active ? "cc" : light ? "66" : "44";
  return {
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: "0.01em",
    background: `${color}${bgOpacity}`,
    border: `1px solid ${color}${borderOpacity}`,
    color: light && !active ? `color-mix(in oklab, ${color}, #000 32%)` : color,
    borderRadius: islandTheme.radius.pill,
    padding: "3px 11px",
    whiteSpace: "nowrap",
    lineHeight: 1.5,
    display: "inline-flex",
    alignItems: "center"
  };
}

type IslandTagProps = {
  children: ReactNode;
  tone?: IslandTagTone;
  color?: string;
  active?: boolean;
  light?: boolean;
  onClick?: (e: MouseEvent) => void;
  style?: CSSProperties;
};

export function IslandTag({ children, tone = "default", color, active, light = false, onClick, style }: IslandTagProps) {
  const finalColor = color ?? SEMANTIC_TAG_COLORS[tone];
  const base: CSSProperties = { ...islandTagStyle({ color: finalColor, active, light }), ...style };
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="island-mono"
        style={{ ...base, cursor: "pointer" }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.82"; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
      >
        {children}
      </button>
    );
  }
  return <span className="island-mono" style={base}>{children}</span>;
}

/**
 * Stable per-member identity color, hashed from a seed (discord id /
 * display name) into the theme's categorical avatar palette. Single source —
 * pages must not hand-roll their own palettes or the same member shifts color
 * between surfaces.
 */
export function memberColor(seed: string): string {
  const palette = islandTheme.categorical.avatars;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

/** Discord accent_color int (0xRRGGBB) → CSS hex, null-safe. */
export function accentHex(accentColor: number | null | undefined): string | null {
  if (accentColor == null || !Number.isFinite(accentColor)) return null;
  return `#${(accentColor & 0xffffff).toString(16).padStart(6, "0")}`;
}

/**
 * Header background for a profile-ish surface (crew card, islander page,
 * user menu): real Discord banner image > accent-color gradient > hashed
 * per-member gradient. Single source — the fallback chain was previously
 * duplicated inline across Community/IslanderProfile/Profile.
 */
export function bannerBackground(
  bannerUrl: string | null | undefined,
  accentColor: number | null | undefined,
  seedId: string
): string {
  if (bannerUrl) return `url("${bannerUrl}") center/cover`;
  const accent = accentHex(accentColor);
  if (accent) return `linear-gradient(135deg, ${accent}88, ${islandTheme.color.panelMutedBg})`;
  return `linear-gradient(135deg, ${memberColor(seedId)}55, ${islandTheme.color.panelMutedBg})`;
}

// ── Icon ─────────────────────────────────────────────────────────────────────
// Minimal geometric icon set shared by new primitives.

type IconName = "single" | "coop" | "pvp" | "split" | "players" | "bolt" | "plus" | "check" | "dice" | "arrow" | "voice" | "moon";

type IslandIconProps = {
  name: IconName;
  size?: number;
  color?: string;
};

export function IslandIcon({ name, size = 14, color = "currentColor" }: IslandIconProps) {
  const p: CSSProperties & Record<string, unknown> = { width: size, height: size };
  const svgProps = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, style: p };
  const paths: Record<IconName, ReactNode> = {
    single:  <circle cx={12} cy={9} r={4} />,
    coop:    <><circle cx={9} cy={9} r={3.4} /><circle cx={15} cy={9} r={3.4} /></>,
    pvp:     <><line x1={5} y1={19} x2={19} y2={5} /><line x1={5} y1={5} x2={19} y2={19} /></>,
    split:   <><rect x={3} y={6} width={7.5} height={12} rx={1.5} /><rect x={13.5} y={6} width={7.5} height={12} rx={1.5} /></>,
    players: <><circle cx={12} cy={8} r={3} /><path d="M5 19c0-3 3-5 7-5s7 2 7 5" /></>,
    bolt:    <path d="M13 3 5 14h6l-2 7 8-11h-6z" fill={color} stroke="none" />,
    plus:    <><line x1={12} y1={6} x2={12} y2={18} /><line x1={6} y1={12} x2={18} y2={12} /></>,
    check:   <path d="M5 12l4 4 10-10" />,
    dice:    <><rect x={4} y={4} width={16} height={16} rx={3} /><circle cx={12} cy={12} r={1.6} fill={color} stroke="none" /></>,
    arrow:   <><line x1={5} y1={12} x2={18} y2={12} /><path d="M12 6l6 6-6 6" /></>,
    voice:   <><rect x={9} y={4} width={6} height={11} rx={3} fill={color} stroke="none" /><path d="M6 11a6 6 0 0 0 12 0 M12 17v3" /></>,
    moon:    <path d="M20 14a8 8 0 1 1-9-9 6.5 6.5 0 0 0 9 9z" fill={color} stroke="none" />,
  };
  return <svg {...svgProps}>{paths[name]}</svg>;
}

// ── StatusDot ─────────────────────────────────────────────────────────────────
// Live dot + label. NOT a pill. Replaces IslandStatusPill everywhere.

export type StatusTone = "online" | "syncing" | "offline" | "playing" | "live";

const STATUS_COLORS: Record<StatusTone, { dot: string; track: string; text: string; textLight: string }> = {
  online:  { dot: "#34d399", track: "#34d39988", text: "#9be9c8", textLight: "#0f7a52" },
  syncing: { dot: "#fbbf24", track: "#fbbf2488", text: "#fcd98c", textLight: "#9a6a07" },
  offline: { dot: "#64748b", track: "transparent",  text: "#94a3b8", textLight: "#475569" },
  playing: { dot: "#a78bfa", track: "#a78bfa88", text: "#c9bcff", textLight: "#6d4bd8" },
  live:    { dot: "#f43f5e", track: "#f43f5e88", text: "#fda4b4", textLight: "#c01838" },
};

type StatusDotProps = {
  tone?: StatusTone;
  children?: ReactNode;
  light?: boolean;
  style?: CSSProperties;
};

export function StatusDot({ tone = "online", children, light = false, style }: StatusDotProps) {
  const c = STATUS_COLORS[tone];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: light ? c.textLight : c.text, fontFamily: islandTheme.font.body, ...style }}>
      <span
        className={tone !== "offline" ? "re-pulse-el" : undefined}
        style={{
          "--dotc": c.track,
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: c.dot,
          boxShadow: `0 0 8px ${c.dot}`,
          flexShrink: 0,
          animation: tone !== "offline" ? "re-pulse 1.8s infinite" : undefined,
          display: "inline-block",
        } as CSSProperties}
      />
      {children}
    </span>
  );
}

// ── GenreTag ──────────────────────────────────────────────────────────────────
// The one role a true pill fits: genre / editorial category decoration.
// Exported as both GenreTag (new name) and aliased through IslandTag.

type GenreTagProps = {
  children: ReactNode;
  color?: string;
  light?: boolean;
  style?: CSSProperties;
};

export function GenreTag({ children, color = islandTheme.accent.violet, light = false, style }: GenreTagProps) {
  return (
    <span style={{ ...islandTagStyle({ color, light }), ...style }}>
      {children}
    </span>
  );
}

// ── FilterChip ────────────────────────────────────────────────────────────────
// Interactive filter — squared chip (radius 10), icon + label + mono count.
// Active: filled accent gradient + check. Inactive: ghost + plus.

type FilterChipProps = {
  label: string;
  count?: number | string;
  active?: boolean;
  onClick?: () => void;
  accent?: string;
  light?: boolean;
};

export function FilterChip({ label, count, active = false, onClick, accent = islandTheme.accent.teal, light = false }: FilterChipProps) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      className="island-btn"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        borderRadius: islandTheme.radius.chip,
        padding: "7px 11px 7px 9px",
        fontSize: 13,
        fontWeight: 600,
        fontFamily: islandTheme.font.body,
        cursor: "pointer",
        border: `1px solid ${active ? "transparent" : hov ? accent : light ? "rgba(40,80,140,.22)" : "rgba(160,185,220,.18)"}`,
        color: active ? "#08121f" : light ? "#1d4068" : "#cbd9ec",
        background: active
          ? `linear-gradient(180deg, ${accent}, color-mix(in oklab, ${accent}, #000 14%))`
          : light
            ? hov ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.6)"
            : hov ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.035)",
        boxShadow: active
          ? `0 4px 14px -4px ${accent}aa, 0 1px 0 rgba(255,255,255,.4) inset`
          : light ? "0 2px 8px -5px rgba(20,50,90,.4)" : "none",
      }}
    >
      <span style={{ display: "inline-flex", opacity: active ? 1 : 0.85 }}>
        <IslandIcon name={active ? "check" : "plus"} size={14} color={active ? "#08121f" : accent} />
      </span>
      {label}
      {count != null ? (
        <span style={{
          fontFamily: islandTheme.font.mono,
          fontSize: 11,
          padding: "1px 6px",
          borderRadius: 7,
          background: active ? "rgba(8,18,31,.22)" : light ? "rgba(40,80,140,.12)" : "rgba(160,185,220,.14)",
          color: active ? "#08121f" : light ? "#3a5f88" : "#9fb2cc",
        }}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

// ── SpecStrip ─────────────────────────────────────────────────────────────────
// Capability/spec metadata as icon + label pairs with dividers.
// Replaces capabilityPills() "pill soup" in GameDetailDrawer and PosterCard.

export type SpecItem = {
  icon: IconName;
  label: string;
  color?: string;
};

type SpecStripProps = {
  items: SpecItem[];
  light?: boolean;
  style?: CSSProperties;
};

export function SpecStrip({ items, light = false, style }: SpecStripProps) {
  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      flexWrap: "wrap",
      borderRadius: islandTheme.radius.chip,
      padding: "6px 4px",
      background: light ? "rgba(255,255,255,.55)" : "rgba(8,16,30,.4)",
      border: `1px solid ${light ? "rgba(40,80,140,.16)" : "rgba(160,185,220,.12)"}`,
      ...style,
    }}>
      {items.map((item, i) => (
        <span key={item.label} style={{ display: "inline-flex", alignItems: "center" }}>
          {i > 0 && (
            <span style={{ width: 1, alignSelf: "stretch", margin: "2px 2px", background: light ? "rgba(40,80,140,.18)" : "rgba(160,185,220,.16)" }} />
          )}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 10px", fontSize: 12, fontWeight: 600, color: light ? "#1d4068" : "#c3d2e6", fontFamily: islandTheme.font.body }}>
            <IslandIcon name={item.icon} size={13} color={item.color ?? islandTheme.accent.teal} />
            {item.label}
          </span>
        </span>
      ))}
    </div>
  );
}

// ── CrewAvatar ────────────────────────────────────────────────────────────────
// Squircle avatar (32% radius), initials, optional "playing" pulse badge.
// Replaces circle avatars (borderRadius:999) across Home and other pages.

type CrewAvatarProps = {
  name: string;
  color?: string;
  playing?: boolean;
  size?: number;
  avatarUrl?: string | null;
  style?: CSSProperties;
};

export function CrewAvatar({ name, color, playing = false, size = 38, avatarUrl, style }: CrewAvatarProps) {
  const resolvedColor = color ?? memberColor(name);
  const initials = name.split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "??";
  return (
    <div title={name} style={{ position: "relative", width: size, height: size, flexShrink: 0, ...style }}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          aria-hidden="true"
          style={{ width: size, height: size, borderRadius: "32%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <div style={{
          width: size,
          height: size,
          borderRadius: "32%",
          display: "grid",
          placeItems: "center",
          fontWeight: 700,
          fontSize: size * 0.36,
          color: islandTheme.color.textDark,
          fontFamily: islandTheme.font.display,
          background: `linear-gradient(150deg, ${resolvedColor}, color-mix(in oklab, ${resolvedColor}, #fff 22%))`,
          boxShadow: `0 3px 10px -3px ${resolvedColor}99, 0 0 0 1.5px rgba(255,255,255,.12) inset`,
        }}>
          {initials}
        </div>
      )}
      {playing && (
        <span
          className="re-pulse-el"
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: islandTheme.accent.violet,
            boxShadow: `0 0 8px ${islandTheme.accent.violet}, 0 0 0 2.5px #1a0f2e`,
            animation: "re-pulse 1.8s infinite",
            "--dotc": islandTheme.accent.violet + "aa",
          } as CSSProperties}
        />
      )}
    </div>
  );
}

// ── PresenceRow ───────────────────────────────────────────────────────────────
// Member row: CrewAvatar + name/StatusDot cluster + optional Voice badge.
// Natural-width cluster — no flex:1 on text (density rule #2).

type PresenceRowProps = {
  name: string;
  avatarUrl?: string | null;
  presenceText: string;
  tone?: StatusTone;
  color?: string;
  inVoice?: boolean;
  light?: boolean;
};

export function PresenceRow({ name, avatarUrl, presenceText, tone = "online", color, inVoice = false, light = false }: PresenceRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 13,
        background: hov ? (light ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.05)") : "transparent",
        transition: "background 160ms ease",
      }}
    >
      <CrewAvatar name={name} avatarUrl={avatarUrl} color={color} size={38} playing={tone === "playing"} />
      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: light ? "#10263f" : "var(--bi-text-primary)", fontFamily: islandTheme.font.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {name}
        </span>
        <StatusDot tone={tone} light={light}>{presenceText}</StatusDot>
      </div>
      {inVoice && (
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 9px",
          borderRadius: islandTheme.radius.pill,
          fontSize: 11,
          fontWeight: 700,
          fontFamily: islandTheme.font.body,
          color: light ? "#2a7d72" : "#7be3d3",
          background: light ? "rgba(45,212,191,.16)" : "rgba(45,212,191,.14)",
          border: "1px solid rgba(45,212,191,.35)",
          flexShrink: 0,
          marginLeft: "auto",
        }}>
          <IslandIcon name="voice" size={12} color={light ? "#2a7d72" : "#7be3d3"} />
          Voice
        </span>
      )}
    </div>
  );
}

// ── ActionCard ────────────────────────────────────────────────────────────────
// Prominent home CTA card: tone accent icon chip, hover-lift, glow, sliding arrow.
// Upgrades QuickActionCard. Accepts same tone values for compat.

type ActionCardTone = "primary" | "warning" | "success" | "default";

type ActionCardProps = {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  count?: number | string;
  tone?: ActionCardTone;
  onClick?: () => void;
  light?: boolean;
};

const ACTION_TONE_COLORS: Record<ActionCardTone, string> = {
  primary: "#5b8bff",
  warning: islandTheme.accent.gold,
  success: islandTheme.accent.teal,
  default: islandTheme.accent.violet,
};

export function ActionCard({ icon, title, subtitle, count, tone = "primary", onClick, light = false }: ActionCardProps) {
  const [hov, setHov] = useState(false);
  const tc = ACTION_TONE_COLORS[tone];
  return (
    <button
      type="button"
      className="island-btn"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: 14,
        padding: "16px 18px",
        borderRadius: islandTheme.radius.card,
        background: light
          ? hov ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.72)"
          : "var(--bi-panel-bg)",
        backdropFilter: islandTheme.glass.blur,
        WebkitBackdropFilter: islandTheme.glass.blur,
        transform: hov ? "translateY(-3px)" : "none",
        boxShadow: hov
          ? `0 16px 36px -14px ${tc}88, 0 0 0 1px ${tc}66 inset`
          : light
            ? "0 4px 14px -8px rgba(20,50,90,.4), 0 0 0 1px rgba(40,80,140,.12) inset"
            : "0 6px 20px -14px rgba(0,0,0,.7), 0 0 0 1px rgba(150,180,230,.12) inset",
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        border: "none",
      }}
    >
      <span className="bi-sheen" aria-hidden="true" />
      <span style={{
        width: 46,
        height: 46,
        borderRadius: 13,
        display: "grid",
        placeItems: "center",
        fontSize: 22,
        flexShrink: 0,
        background: `linear-gradient(150deg, color-mix(in oklab, ${tc}, #fff 10%), color-mix(in oklab, ${tc}, #000 22%))`,
        boxShadow: `0 6px 16px -6px ${tc}aa, 0 1px 0 rgba(255,255,255,.4) inset`,
      }}>
        {icon}
      </span>
      <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
        <span style={{ fontFamily: islandTheme.font.display, fontWeight: 700, fontSize: 16, color: light ? "#10263f" : "#f3f7ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {title}
        </span>
        {subtitle && (
          <span style={{ fontSize: 13, color: light ? "rgba(20,45,75,.62)" : "rgba(203,217,236,.72)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {subtitle}
          </span>
        )}
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {count != null && (
          <span className="island-tnum" style={{ fontFamily: islandTheme.font.mono, fontSize: 13, fontWeight: 700, minWidth: 24, textAlign: "center", padding: "3px 8px", borderRadius: 9, color: "#08121f", background: `linear-gradient(180deg, ${tc}, color-mix(in oklab, ${tc}, #000 16%))`, boxShadow: `0 3px 10px -4px ${tc}` }}>
            {count}
          </span>
        )}
        <span style={{ display: "inline-flex", color: tc, transition: "transform .2s ease", transform: hov ? "translateX(4px)" : "none" }}>
          <IslandIcon name="arrow" size={20} color={tc} />
        </span>
      </span>
    </button>
  );
}

// ── NuggieChip ────────────────────────────────────────────────────────────────
// Characterful balance coin for the topbar/header — bevel/shine + flip animation.
// Additive: NuggieCoin (gameplay) is unchanged.

type NuggieChipProps = {
  size?: number;
  onFlip?: () => void;
  style?: CSSProperties;
};

export function NuggieChip({ size = 44, onFlip, style }: NuggieChipProps) {
  const [flipping, setFlipping] = useState(false);
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const flip = () => {
    if (flipping || reducedMotion) return;
    setFlipping(true);
    onFlip?.();
    setTimeout(() => setFlipping(false), 900);
  };
  return (
    <button
      type="button"
      className="island-btn"
      onClick={flip}
      title="Flip a Nuggie"
      style={{ width: size, height: size, perspective: 400, display: "inline-grid", placeItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0, ...style }}
    >
      <span style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        transformStyle: "preserve-3d",
        animation: flipping ? "re-flip .9s cubic-bezier(.3,.7,.4,1)" : "none",
        background: "radial-gradient(circle at 38% 32%, #ffe9a8 0%, #f7c948 42%, #e0992a 74%, #b76a14 100%)",
        boxShadow: "0 4px 12px -3px rgba(183,106,20,.7), inset -3px -4px 8px rgba(140,70,10,.5), inset 2px 3px 6px rgba(255,245,200,.6)",
        border: "2px solid #c8881f",
        fontSize: size * 0.5,
        lineHeight: 1,
      }}>
        🍗
      </span>
    </button>
  );
}

/**
 * Animate a number toward its new value (ease-out, ~600ms). Use for balances
 * and counters that change live (SSE nuggies-changed) so updates read as
 * motion instead of a snap. Skips animation under prefers-reduced-motion.
 */
export function useCountUp(target: number, durationMs = 600): number {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = target;
    if (from === target) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return display;
}
