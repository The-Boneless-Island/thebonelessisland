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
  emblem?: string;       // milestone tier emblem (falls back to emoji)
  itemType?: string;     // achievement item type ("badge", "title", ...)
};

// ── Queue hook ────────────────────────────────────────────────────────────────

export type CelebrationQueue = {
  current: CelebrationEvent | null;
  remaining: number; // total pending including the one on screen
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

  return { current: queue[0] ?? null, remaining: queue.length, enqueue, dismiss };
}

// ── Component ─────────────────────────────────────────────────────────────────

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
  remaining = 0,
}: {
  current: CelebrationEvent | null;
  onDismiss: () => void;
  remaining?: number;
}) {
  const reducedMotion = prefersReducedMotion();
  const confetti = useMemo(
    () => (current && !reducedMotion ? buildConfetti(current.id) : []),
    [current?.id, reducedMotion]
  );

  const [progress, setProgress] = useState(1);
  const pausedRef = useRef(false);

  // Let the island scene join in: one-shot flourish (shooting star) per
  // celebration. Decoupled via window event — the scene shell listens.
  useEffect(() => {
    if (!current) return;
    window.dispatchEvent(new CustomEvent("bi:scene-flourish", { detail: { kind: current.kind } }));
  }, [current?.id]);

  // Countdown that drives the dismiss + the visible progress bar. Pauses while
  // the pointer is over the card so a fast reader is never cut off mid-sentence.
  useEffect(() => {
    if (!current) return;
    pausedRef.current = false;
    setProgress(1);
    const autoMs = current.kind === "milestone" ? 5500 : 4200;
    let left = autoMs;
    const step = 50;
    const id = window.setInterval(() => {
      if (pausedRef.current) return;
      left -= step;
      setProgress(Math.max(0, left / autoMs));
      if (left <= 0) onDismiss();
    }, step);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [current?.id, onDismiss]);

  if (!current) return null;

  const isMilestone = current.kind === "milestone";
  const accent = isMilestone ? "#fbbf24" : "#a3e635";
  const accentSoft = isMilestone ? "#fde68a" : "#d9f99d";
  const accentGlow = isMilestone ? "rgba(251, 191, 36, 0.55)" : "rgba(163, 230, 53, 0.5)";
  const badgeGlyph = isMilestone ? current.emblem || current.emoji || "🏅" : current.emoji || "🏆";
  const cardWidth = isMilestone ? 472 : 412;
  const extraInQueue = Math.max(0, remaining - 1);
  const anim = (value: string) => (reducedMotion ? "none" : value);

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
        background: isMilestone ? "rgba(2, 6, 23, 0.6)" : "rgba(2, 6, 23, 0.48)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: anim("bi-celeb-backdrop 240ms ease"),
        cursor: "pointer",
      }}
    >
      <style>{`
        @keyframes bi-celeb-backdrop { from { opacity: 0; } to { opacity: 1; } }
        @keyframes bi-celeb-pop {
          0%   { opacity: 0; transform: scale(0.6) translateY(20px); }
          60%  { opacity: 1; transform: scale(1.06) translateY(0); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes bi-celeb-badge-pulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 28px var(--celeb-glow)); }
          50%      { transform: scale(1.08); filter: drop-shadow(0 0 44px var(--celeb-glow)); }
        }
        @keyframes bi-celeb-halo { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes bi-celeb-shimmer { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
        @keyframes bi-celeb-confetti {
          0%   { opacity: 0; transform: translate(0, -10vh) rotate(var(--rot-start)); }
          10%  { opacity: 1; }
          100% { opacity: 0; transform: translate(var(--drift), 110vh) rotate(var(--rot-end)); }
        }
      `}</style>

      {/* Confetti layer — over the backdrop, behind the card */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
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
        onMouseEnter={() => { pausedRef.current = true; }}
        onMouseLeave={() => { pausedRef.current = false; }}
        style={{
          ["--celeb-glow" as string]: accentGlow,
          position: "relative",
          width: `min(${cardWidth}px, calc(100vw - 32px))`,
          padding: "30px 30px 0",
          borderRadius: 22,
          overflow: "hidden",
          background: `radial-gradient(120% 90% at 50% -10%, ${isMilestone ? "rgba(251,191,36,0.16)" : "rgba(163,230,53,0.14)"}, transparent 60%), linear-gradient(160deg, ${islandTheme.color.panelBg} 0%, rgba(15, 23, 42, 0.9) 100%)`,
          border: `2px solid ${accent}`,
          boxShadow: `0 0 ${isMilestone ? 64 : 48}px ${accentGlow}, 0 24px 64px rgba(0, 0, 0, 0.55)`,
          color: islandTheme.color.textPrimary,
          textAlign: "center",
          animation: anim("bi-celeb-pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1) both"),
          cursor: "pointer",
        } as React.CSSProperties}
      >
        {/* Queue chip */}
        {extraInQueue > 0 && (
          <div
            className="island-mono"
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              padding: "3px 9px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: accentSoft,
              background: "rgba(15,23,42,0.6)",
              border: `1px solid ${accent}`,
            }}
          >
            +{extraInQueue} MORE
          </div>
        )}

        {/* Eyebrow */}
        <div
          className="island-mono"
          style={{
            fontSize: 12,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            fontWeight: 800,
            marginBottom: 2,
            color: accent,
            background: reducedMotion ? undefined : `linear-gradient(90deg, ${accent}, #fff, ${accent})`,
            backgroundSize: "200% 100%",
            WebkitBackgroundClip: reducedMotion ? undefined : "text",
            WebkitTextFillColor: reducedMotion ? undefined : "transparent",
            backgroundClip: reducedMotion ? undefined : "text",
            animation: anim("bi-celeb-shimmer 2400ms linear infinite"),
          }}
        >
          ✦ {isMilestone ? "Rank Reached" : "Achievement Unlocked"} ✦
        </div>

        {/* Badge with rotating conic halo */}
        <div style={{ position: "relative", width: isMilestone ? 140 : 120, height: isMilestone ? 140 : 120, margin: "16px auto 16px" }}>
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: -8,
              borderRadius: 999,
              background: `conic-gradient(from 0deg, transparent, ${accent}, transparent 55%)`,
              filter: "blur(2px)",
              opacity: 0.7,
              animation: anim("bi-celeb-halo 6s linear infinite"),
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 999,
              background: `radial-gradient(circle at 30% 28%, rgba(255,255,255,0.2), transparent 60%), ${islandTheme.color.panelMutedBg}`,
              border: `3px solid ${accent}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: isMilestone ? 70 : 60,
              lineHeight: 1,
              animation: anim("bi-celeb-badge-pulse 1600ms ease-in-out infinite"),
            }}
          >
            {badgeGlyph}
          </div>
        </div>

        {/* Title */}
        <div
          className="island-display"
          style={{ fontSize: isMilestone ? 28 : 24, fontWeight: 800, letterSpacing: "0.03em", lineHeight: 1.15, marginBottom: 6 }}
        >
          {current.title}
        </div>

        {/* Item-type chip (achievements) */}
        {!isMilestone && current.itemType && (
          <div
            className="island-mono"
            style={{
              display: "inline-block",
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: accentSoft,
              background: "rgba(163,230,53,0.12)",
              border: `1px solid rgba(163,230,53,0.4)`,
              marginBottom: 10,
            }}
          >
            {current.itemType}
          </div>
        )}

        {/* Description */}
        <div
          style={{
            fontSize: 14,
            color: islandTheme.color.textSubtle,
            lineHeight: 1.5,
            margin: "0 auto",
            maxWidth: 360,
          }}
        >
          {current.description}
        </div>

        {/* Bonus pill (milestones) */}
        {isMilestone && current.bonus && current.bonus > 0 && (
          <div
            className="island-mono"
            style={{
              display: "inline-block",
              padding: "8px 18px",
              borderRadius: 999,
              background: "rgba(34, 197, 94, 0.18)",
              color: "#86efac",
              border: "1px solid rgba(34, 197, 94, 0.45)",
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: "0.04em",
              marginTop: 16,
            }}
          >
            +₦{current.bonus.toLocaleString()} bonus paid
          </div>
        )}

        {/* Dismiss hint */}
        <div
          className="island-mono"
          style={{
            fontSize: 12,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: islandTheme.color.textMuted,
            opacity: 0.8,
            margin: "18px 0 22px",
          }}
        >
          Tap to dismiss · hover to hold
        </div>

        {/* Countdown progress bar */}
        <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 4, background: "rgba(255,255,255,0.08)" }}>
          <div
            style={{
              height: "100%",
              width: `${progress * 100}%`,
              background: `linear-gradient(90deg, ${accent}, ${accentSoft})`,
              boxShadow: `0 0 10px ${accentGlow}`,
              transition: "width 60ms linear",
            }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Card-scoped confetti burst ──────────────────────────────────────────────────
// Drop inside a position: relative parent. Each time `trigger` changes (after the
// first value) it fires a short-lived confetti burst scoped to the parent, then
// clears the pieces once the animation has run. Respects prefers-reduced-motion.

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function ConfettiBurst({ trigger }: { trigger: number }) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
  const prevTriggerRef = useRef(trigger);

  useEffect(() => {
    // Skip the initial value — only fire on subsequent changes.
    if (prevTriggerRef.current === trigger) return;
    prevTriggerRef.current = trigger;

    if (prefersReducedMotion()) return;

    const burst = buildConfetti(`burst-${trigger}`);
    setPieces(burst);

    // Longest piece finishes at delay + duration; clear shortly after.
    const longest = burst.reduce((max, p) => Math.max(max, p.delayMs + p.durationMs), 0);
    const t = window.setTimeout(() => setPieces([]), longest + 200);
    return () => window.clearTimeout(t);
  }, [trigger]);

  if (!pieces.length) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      {pieces.map((c, i) => (
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
      <style>{`
        @keyframes bi-celeb-confetti {
          0%   { opacity: 0; transform: translate(0, -10vh) rotate(var(--rot-start)); }
          10%  { opacity: 1; }
          100% { opacity: 0; transform: translate(var(--drift), 110vh) rotate(var(--rot-end)); }
        }
      `}</style>
    </div>
  );
}
