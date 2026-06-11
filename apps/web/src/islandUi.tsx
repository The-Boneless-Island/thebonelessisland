import { useEffect, useMemo, useState, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { islandTheme } from "./theme.js";

export type IslandButtonVariant = "primary" | "secondary" | "danger";

const baseButtonStyle: CSSProperties = {
  borderRadius: islandTheme.radius.control,
  border: `1px solid ${islandTheme.color.border}`,
  padding: "0.48rem 0.75rem",
  cursor: "pointer",
  fontWeight: 600
};

const buttonVariantStyles: Record<IslandButtonVariant, CSSProperties> = {
  primary: {
    background: islandTheme.color.primary,
    borderColor: islandTheme.color.primary,
    color: islandTheme.color.primaryText
  },
  secondary: {
    background: islandTheme.color.secondary,
    color: islandTheme.color.textSecondary
  },
  danger: {
    background: islandTheme.color.danger,
    borderColor: islandTheme.color.danger,
    color: islandTheme.color.dangerText
  }
};

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

export function islandButtonStyle(variant: IslandButtonVariant): CSSProperties {
  return { ...baseButtonStyle, ...buttonVariantStyles[variant] };
}

type IslandButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: IslandButtonVariant;
};

export function IslandButton({ variant = "secondary", style, className, ...props }: IslandButtonProps) {
  return <button {...props} className={`island-btn${className ? ` ${className}` : ""}`} style={{ ...islandButtonStyle(variant), ...style }} />;
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
      <div style={{ fontSize: 12, opacity: 0.95 }}>{subtitle}</div>
    </button>
  );
}

type IslandGameBladeProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  subtitle: string;
  meta?: string;
  tags?: string[];
  imageUrl?: string | null;
  imageFallbackUrls?: string[];
  selected: boolean;
  hovered?: boolean;
  isVoting?: boolean;
  justVoted?: boolean;
  voteFlashLabel?: string;
  voteFlashTone?: "up" | "neutral" | "down";
  currentUserVote?: number | null;
  onSelect?: () => void;
  onVote?: (vote: -1 | 0 | 1) => void;
};

export function IslandGameBlade({
  title,
  subtitle,
  meta,
  tags = [],
  imageUrl,
  imageFallbackUrls = [],
  selected,
  hovered = false,
  isVoting = false,
  justVoted = false,
  voteFlashLabel,
  voteFlashTone = "up",
  currentUserVote = null,
  onSelect,
  onVote,
  style,
  ...props
}: IslandGameBladeProps) {
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
    <div
      {...props}
      onClick={() => onSelect?.()}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.();
        }
      }}
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: islandTheme.radius.control,
        border: selected ? `1px solid ${islandTheme.color.primaryGlow}` : `1px solid ${islandTheme.color.border}`,
        minHeight: 98,
        background: islandTheme.color.panelBg,
        boxShadow: hovered ? islandTheme.shadow.bladeHover : islandTheme.shadow.cardIdle,
        transform: hovered ? "translateY(-2px) scale(1.01)" : "translateY(0) scale(1)",
        transition: "transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease",
        animation: justVoted ? "islandBladePulse 700ms ease-out" : undefined,
        ...style
      }}
    >
      {justVoted && voteFlashLabel ? (
        <div
          style={{
            position: "absolute",
            right: 8,
            top: 8,
            zIndex: 3,
            borderRadius: 999,
            padding: "0.2rem 0.46rem",
            fontSize: 12,
            fontWeight: 700,
            border:
              voteFlashTone === "up"
                ? `1px solid ${islandTheme.color.voteUp}`
                : voteFlashTone === "down"
                  ? `1px solid ${islandTheme.color.voteDown}`
                  : `1px solid ${islandTheme.color.voteMaybe}`,
            background:
              voteFlashTone === "up" ? "rgba(8,47,73,0.9)" : voteFlashTone === "down" ? "rgba(69,10,10,0.9)" : "rgba(66,32,6,0.9)",
            color: voteFlashTone === "up" ? "#bae6fd" : voteFlashTone === "down" ? "#fee2e2" : "#fef9c3",
            animation: "islandVoteBadgePop 700ms ease-out"
          }}
        >
          {voteFlashLabel}
        </div>
      ) : null}
      {activeImageUrl ? (
        <>
          <img
            src={activeImageUrl}
            alt=""
            aria-hidden="true"
            onError={() => {
              setImageIndex((current) => {
                if (current + 1 < imageCandidates.length) {
                  return current + 1;
                }
                setShowImageFallback(true);
                return current;
              });
            }}
            style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
          />
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `linear-gradient(100deg, rgba(8,16,34,0.82), rgba(8,16,34,0.46)), url("${activeImageUrl}")`,
              backgroundPosition: "center",
              backgroundSize: hovered ? "112%" : "106%",
              transition: "background-size 180ms ease"
            }}
          />
        </>
      ) : (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: islandTheme.gradient.gameArtFallback
          }}
        />
      )}

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: 10,
          padding: "0.58rem 0.62rem"
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
          <div style={{ fontSize: 12, opacity: 0.95 }}>{subtitle}</div>
          {meta ? <div style={{ fontSize: 12, opacity: 0.84 }}>{meta}</div> : null}
          <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {tags.slice(0, 2).map((tag) => (
              <span key={tag} className="island-mono" style={islandTagStyle({ color: getTagColor(tag) })}>
                {tag}
              </span>
            ))}
            <span
              style={{
                fontSize: 12,
                borderRadius: 999,
                border: `1px solid ${selected ? islandTheme.color.primaryGlow : "rgba(203,213,225,0.42)"}`,
                padding: "0.12rem 0.42rem",
                color: selected ? islandTheme.color.primaryText : islandTheme.color.textSubtle,
                background: selected ? islandTheme.color.primary : "rgba(2,6,23,0.25)"
              }}
            >
              {selected ? "Selected" : "Pick for finalize"}
            </span>
            <span
              style={{
                fontSize: 12,
                borderRadius: 999,
                border: "1px solid rgba(203,213,225,0.42)",
                padding: "0.12rem 0.42rem",
                background: "rgba(2,6,23,0.25)"
              }}
            >
              {currentUserVote === 1 ? "Your vote: +1" : currentUserVote === 0 ? "Your vote: 0" : currentUserVote === -1 ? "Your vote: -1" : "Not voted"}
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onVote?.(1);
            }}
            disabled={isVoting}
            style={{ ...islandButtonStyle("primary"), padding: "0.26rem 0.58rem", marginRight: 0, fontSize: 12 }}
          >
            Hype +1
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onVote?.(0);
            }}
            disabled={isVoting}
            style={{ ...islandButtonStyle("secondary"), padding: "0.24rem 0.58rem", marginRight: 0, fontSize: 12 }}
          >
            Maybe 0
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onVote?.(-1);
            }}
            disabled={isVoting}
            style={{ ...islandButtonStyle("danger"), padding: "0.24rem 0.58rem", marginRight: 0, fontSize: 12 }}
          >
            Skip -1
          </button>
        </div>
      </div>
    </div>
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
            fontWeight: 800,
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
        ...style
      }}
    >
      <strong>{title}</strong>
      <div style={{ fontSize: 13, opacity: 0.85 }}>{meta}</div>
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

export function islandTagStyle(opts: { color: string; active?: boolean }): CSSProperties {
  const { color, active = false } = opts;
  return {
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    background: active ? `${color}55` : `${color}22`,
    border: `1px solid ${active ? color : `${color}44`}`,
    color,
    borderRadius: islandTheme.radius.chip,
    padding: "1px 7px",
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
  onClick?: (e: MouseEvent) => void;
  style?: CSSProperties;
};

export function IslandTag({ children, tone = "default", color, active, onClick, style }: IslandTagProps) {
  const finalColor = color ?? SEMANTIC_TAG_COLORS[tone];
  const base: CSSProperties = { ...islandTagStyle({ color: finalColor, active }), ...style };
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
