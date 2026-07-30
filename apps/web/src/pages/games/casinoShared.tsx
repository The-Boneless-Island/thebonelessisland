// casinoShared.tsx — primitives shared by the three casino games.
//
// The design goal is a one-click round loop: controls never unmount between
// rounds, the bet and call/guess persist, and the server's start cooldown is
// surfaced as a live countdown on the primary button instead of a post-click
// error. Each game keeps its own felt stage; everything around it lives here.

import { useEffect, useState } from "react";
import { islandTheme } from "../../theme.js";

// ── Cooldown ─────────────────────────────────────────────────────────────────

/**
 * Deadline-based cooldown for the game-start endpoints. Arm it when a round
 * starts (the server counts from the start call, not the resolve), or from a
 * `cooldown` error's secondsLeft. Deadline is an absolute timestamp so a
 * throttled background tab can't stretch the wait.
 */
export function useCooldown() {
  const [readyAt, setReadyAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (readyAt <= Date.now()) return;
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= readyAt) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [readyAt]);

  const left = Math.max(0, readyAt - now);
  return {
    ready: left === 0,
    secondsLeft: Math.ceil(left / 1000),
    arm(secs: number) {
      const n = Date.now();
      setNow(n);
      setReadyAt((prev) => Math.max(prev, n + secs * 1000));
    }
  };
}

// ── Per-run session tally ────────────────────────────────────────────────────

export type RunStats = { rounds: number; net: number; streak: number };

export const EMPTY_RUN: RunStats = { rounds: 0, net: 0, streak: 0 };

/** Fold one resolved round into the run. `net` is payout minus bet (negative on a loss). */
export function tallyRound(run: RunStats, net: number, won: boolean): RunStats {
  return {
    rounds: run.rounds + 1,
    net: run.net + net,
    streak: won ? run.streak + 1 : 0
  };
}

export function SessionStrip({ run }: { run: RunStats }) {
  if (run.rounds === 0) return null;
  const up = run.net >= 0;
  return (
    <div
      className="island-mono casino-session-strip"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        fontSize: 12,
        letterSpacing: "0.06em",
        color: islandTheme.color.textMuted,
        textTransform: "uppercase"
      }}
    >
      <span>This run · {run.rounds} {run.rounds === 1 ? "round" : "rounds"}</span>
      <span style={{ fontWeight: 700, color: up ? islandTheme.color.successAccent : islandTheme.color.dangerSoft }}>
        {up ? "+" : "−"}₦{Math.abs(run.net).toLocaleString()}
      </span>
      {run.streak >= 3 && (
        <span className="casino-streak-flame" style={{ color: "#fbbf24", fontWeight: 700 }}>
          🔥 {run.streak} streak
        </span>
      )}
    </div>
  );
}

// ── Bet controls ─────────────────────────────────────────────────────────────

export function BetControls({
  bet,
  setBet,
  balance,
  maxBet,
  disabled
}: {
  bet: number;
  setBet: (n: number) => void;
  balance: number;
  maxBet: number;
  disabled: boolean;
}) {
  const cap = Math.min(maxBet, balance);
  const clamp = (n: number) => Math.max(1, Math.min(n, cap));
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label style={{ ...casinoLabelStyle, textAlign: "center" }}>Bet (Nuggies)</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
        <input
          type="number"
          min={1}
          max={cap}
          value={bet}
          onChange={(e) => setBet(parseInt(e.target.value, 10) || 0)}
          disabled={disabled}
          style={{ ...casinoInputStyle, width: 110, textAlign: "center" }}
        />
        {[10, 25, 50, 100].map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => setBet(clamp(amount))}
            disabled={disabled || amount > cap}
            className="casino-chip-btn"
            style={chipPresetStyle}
          >
            {amount}
          </button>
        ))}
        <button type="button" onClick={() => setBet(clamp(Math.floor(bet / 2)))} disabled={disabled} className="casino-chip-btn" style={chipModStyle}>
          ½
        </button>
        <button type="button" onClick={() => setBet(clamp(bet * 2))} disabled={disabled} className="casino-chip-btn" style={chipModStyle}>
          2×
        </button>
        <button type="button" onClick={() => setBet(cap)} disabled={disabled} className="casino-chip-btn" style={chipModStyle}>
          Max
        </button>
      </div>
    </div>
  );
}

// ── Small shared pieces ──────────────────────────────────────────────────────

export function SeatLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="island-mono"
      style={{
        fontSize: 12,
        color: islandTheme.color.textMuted,
        textTransform: "uppercase",
        letterSpacing: "0.16em",
        textAlign: "center"
      }}
    >
      {children}
    </div>
  );
}

export function BackBtn({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="island-mono"
      style={{
        background: "transparent",
        border: "none",
        color: islandTheme.color.textMuted,
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        cursor: "pointer",
        font: "inherit"
      }}
    >
      ← Casino
    </button>
  );
}

/**
 * Big win/lose banner. `headline` is the punchy line, `net` drives the large
 * signed amount, `detail` is the small print underneath.
 */
export function OutcomeBanner({
  won,
  push = false,
  headline,
  net,
  detail
}: {
  won: boolean;
  push?: boolean;
  headline: string;
  net: number;
  detail: React.ReactNode;
}) {
  const accent = push ? "#f59e0b" : won ? "#22c55e" : "#ef4444";
  return (
    <div
      className={won ? "casino-banner-pop casino-banner-win" : "casino-banner-pop"}
      style={{
        padding: "14px 16px",
        borderRadius: 12,
        background: push
          ? "rgba(245, 158, 11, 0.10)"
          : won
            ? "rgba(34, 197, 94, 0.14)"
            : "rgba(239, 68, 68, 0.10)",
        border: `1px solid ${accent}55`,
        textAlign: "center",
        display: "grid",
        gap: 2
      }}
    >
      <div className="island-display" style={{ fontSize: 18, fontWeight: 700 }}>{headline}</div>
      {!push && (
        <div
          className="island-mono"
          style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.01em", color: accent }}
        >
          {net >= 0 ? "+" : "−"}₦{Math.abs(net).toLocaleString()}
        </div>
      )}
      <div style={{ fontSize: 12, color: islandTheme.color.textSubtle }}>{detail}</div>
    </div>
  );
}

export function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ── Shared styles ────────────────────────────────────────────────────────────

export const casinoHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12
};

export const casinoLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: islandTheme.color.textMuted,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontFamily: "var(--island-mono, monospace)"
};

export const casinoInputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${islandTheme.color.cardBorder}`,
  background: islandTheme.color.panelMutedBg,
  color: islandTheme.color.textPrimary,
  fontSize: 14,
  font: "inherit"
};

export const casinoErrorStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  background: "rgba(239, 68, 68, 0.10)",
  border: "1px solid rgba(239, 68, 68, 0.35)",
  color: "#fca5a5",
  fontSize: 13,
  textAlign: "center"
};

export const casinoFeltStyle: React.CSSProperties = {
  position: "relative",
  padding: "26px 18px 30px",
  borderRadius: 18,
  background:
    "radial-gradient(120% 90% at 50% 0%, rgba(20, 110, 80, 0.55) 0%, rgba(10, 60, 48, 0.85) 55%, rgba(6, 30, 26, 0.95) 100%)",
  border: "1px solid rgba(34, 197, 94, 0.28)",
  boxShadow:
    "inset 0 0 80px rgba(0, 0, 0, 0.55), inset 0 0 0 1px rgba(255, 255, 255, 0.04), 0 8px 24px rgba(0, 0, 0, 0.35)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 14
};

export const casinoControlBarStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 14,
  background: "rgba(8, 16, 22, 0.55)",
  border: `1px solid ${islandTheme.color.cardBorder}`
};

const chipPresetStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(250, 204, 21, 0.35)",
  background: "rgba(250, 204, 21, 0.08)",
  color: "#fde68a",
  fontWeight: 700,
  fontSize: 12,
  fontFamily: "var(--island-mono, monospace)",
  cursor: "pointer",
  letterSpacing: "0.04em"
};

const chipModStyle: React.CSSProperties = {
  ...chipPresetStyle,
  border: `1px solid ${islandTheme.color.cardBorder}`,
  background: "rgba(148, 163, 184, 0.08)",
  color: islandTheme.color.textSubtle
};
