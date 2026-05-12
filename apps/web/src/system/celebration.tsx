import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { islandTheme } from "../theme.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CelebrationKind = "achievement" | "milestone";

export type CelebrationEvent = {
  id: string;            // unique per activity event row
  kind: CelebrationKind;
  emoji: string;         // big icon shown in the badge
  title: string;         // "STREAK 7" or "Reached APEX TIDELORD"
  description: string;   // subtitle line
  bonus?: number;        // milestone tier bonus in Nuggies
};

// ── Queue hook ────────────────────────────────────────────────────────────────

export type CelebrationQueue = {
  current: CelebrationEvent | null;
  enqueue: (event: CelebrationEvent) => void;
  dismiss: () => void;
};

export function useCelebrationQueue(): CelebrationQueue {
  const [queue, setQueue] = useState<CelebrationEvent[]>([]);
  const seenRef = useRef<Set<string>>(new Set());

  const enqueue = useCallback((event: CelebrationEvent) => {
    if (seenRef.current.has(event.id)) return;
    seenRef.current.add(event.id);
    setQueue((prev) => [...prev, event]);
  }, []);

  const dismiss = useCallback(() => {
    setQueue((prev) => prev.slice(1));
  }, []);

  return { current: queue[0] ?? null, enqueue, dismiss };
}

// ── Component ─────────────────────────────────────────────────────────────────

const AUTO_DISMISS_MS = 4000;
const CONFETTI_COUNT = 28;
const CONFETTI_EMOJIS = ["🎉", "✨", "⭐", "🌟", "💫", "🎊", "🥳", "🍗"];

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

type ConfettiPiece = {
  emoji: string;
  leftPct: number;
  delayMs: number;
  durationMs: number;
  sizeRem: number;
  rotateStart: number;
  rotateEnd: number;
  drift: number;
};

function buildConfetti(seed: string): ConfettiPiece[] {
  // seed is unused for true randomness per mount; keep arg for memoization key.
  void seed;
  return Array.from({ length: CONFETTI_COUNT }).map(() => ({
    emoji: CONFETTI_EMOJIS[Math.floor(Math.random() * CONFETTI_EMOJIS.length)],
    leftPct: rand(0, 100),
    delayMs: rand(0, 600),
    durationMs: rand(1800, 3200),
    sizeRem: rand(1.0, 2.2),
    rotateStart: rand(-180, 180),
    rotateEnd: rand(-720, 720),
    drift: rand(-120, 120),
  }));
}

export function AchievementCelebration({
  current,
  onDismiss,
}: {
  current: CelebrationEvent | null;
  onDismiss: () => void;
}) {
  const confetti = useMemo(() => (current ? buildConfetti(current.id) : []), [current?.id]);

  useEffect(() => {
    if (!current) return;
    const t = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [current, onDismiss]);

  if (!current) return null;

  const isMilestone = current.kind === "milestone";
  const accent = isMilestone ? "#fbbf24" : "#a3e635";
  const accentGlow = isMilestone ? "rgba(251, 191, 36, 0.55)" : "rgba(163, 230, 53, 0.55)";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isMilestone ? "Rank reached" : "Achievement unlocked"}
      onClick={onDismiss}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(2, 6, 23, 0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: "bi-celeb-backdrop 240ms ease",
        cursor: "pointer",
      }}
    >
      <style>{`
        @keyframes bi-celeb-backdrop {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes bi-celeb-pop {
          0%   { opacity: 0; transform: scale(0.6) translateY(20px); }
          60%  { opacity: 1; transform: scale(1.06) translateY(0); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes bi-celeb-badge-pulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 28px var(--celeb-glow)); }
          50%      { transform: scale(1.08); filter: drop-shadow(0 0 44px var(--celeb-glow)); }
        }
        @keyframes bi-celeb-shimmer {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes bi-celeb-confetti {
          0%   { opacity: 0; transform: translate(0, -10vh) rotate(var(--rot-start)); }
          10%  { opacity: 1; }
          100% { opacity: 0; transform: translate(var(--drift), 110vh) rotate(var(--rot-end)); }
        }
      `}</style>

      {/* Confetti layer — sits over the backdrop, behind the card */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        {confetti.map((c, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              top: 0,
              left: `${c.leftPct}%`,
              fontSize: `${c.sizeRem}rem`,
              animation: `bi-celeb-confetti ${c.durationMs}ms ${c.delayMs}ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards`,
              ["--rot-start" as string]: `${c.rotateStart}deg`,
              ["--rot-end" as string]: `${c.rotateEnd}deg`,
              ["--drift" as string]: `${c.drift}px`,
              willChange: "transform, opacity",
            } as React.CSSProperties}
          >
            {c.emoji}
          </span>
        ))}
      </div>

      {/* Card */}
      <div
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        style={{
          ["--celeb-glow" as string]: accentGlow,
          position: "relative",
          width: "min(440px, calc(100vw - 32px))",
          padding: "28px 28px 24px",
          borderRadius: 20,
          background: `linear-gradient(160deg, ${islandTheme.color.panelBg} 0%, rgba(15, 23, 42, 0.85) 100%)`,
          border: `2px solid ${accent}`,
          boxShadow: `0 0 48px ${accentGlow}, 0 24px 64px rgba(0, 0, 0, 0.55)`,
          color: islandTheme.color.textPrimary,
          textAlign: "center",
          animation: "bi-celeb-pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
          cursor: "pointer",
        } as React.CSSProperties}
      >
        {/* Eyebrow */}
        <div
          className="island-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: accent,
            fontWeight: 800,
            marginBottom: 4,
            background: `linear-gradient(90deg, ${accent}, #fff, ${accent})`,
            backgroundSize: "200% 100%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            animation: "bi-celeb-shimmer 2400ms linear infinite",
          }}
        >
          ✦ {isMilestone ? "Rank Reached" : "Achievement Unlocked"} ✦
        </div>

        {/* Big badge */}
        <div
          style={{
            margin: "10px auto 14px",
            width: 124,
            height: 124,
            borderRadius: 999,
            background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.18), transparent 60%), ${islandTheme.color.panelMutedBg}`,
            border: `3px solid ${accent}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 64,
            lineHeight: 1,
            animation: "bi-celeb-badge-pulse 1600ms ease-in-out infinite",
          }}
        >
          {current.emoji || "🏆"}
        </div>

        {/* Title */}
        <div
          className="island-display"
          style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: "0.04em",
            lineHeight: 1.15,
            marginBottom: 6,
          }}
        >
          {current.title}
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: 14,
            color: islandTheme.color.textSubtle,
            lineHeight: 1.5,
            marginBottom: isMilestone && current.bonus ? 14 : 18,
            maxWidth: 360,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {current.description}
        </div>

        {/* Bonus pill (milestones only) */}
        {isMilestone && current.bonus && current.bonus > 0 && (
          <div
            className="island-mono"
            style={{
              display: "inline-block",
              padding: "6px 14px",
              borderRadius: 999,
              background: "rgba(34, 197, 94, 0.18)",
              color: "#86efac",
              border: "1px solid rgba(34, 197, 94, 0.45)",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.06em",
              marginBottom: 16,
            }}
          >
            +₦{current.bonus.toLocaleString()} bonus paid
          </div>
        )}

        {/* Dismiss hint */}
        <div
          className="island-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: islandTheme.color.textMuted,
            opacity: 0.85,
          }}
        >
          Tap anywhere to dismiss
        </div>
      </div>
    </div>,
    document.body
  );
}
