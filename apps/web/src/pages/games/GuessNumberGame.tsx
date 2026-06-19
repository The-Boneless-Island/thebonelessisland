import { useState } from "react";
import { IslandButton, IslandCard, islandTagStyle } from "../../islandUi.js";
import { islandTheme } from "../../theme.js";
import { startGuessNumber, type GameStateResponse } from "../../api/games.js";
import { useRefetchActivity } from "../../system/activityContext.js";

type Props = {
  startBalance: number | null;
  maxBet: number;
  onResolved: (newBalance: number) => void;
  onBack: () => void;
};

export function GuessNumberGame({ startBalance, maxBet, onResolved, onBack }: Props) {
  const [bet, setBet] = useState(10);
  const [guess, setGuess] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "rolling" | "settled" | "error">("idle");
  const [result, setResult] = useState<GameStateResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const refetchActivity = useRefetchActivity();

  const balanceAvail = startBalance ?? 0;
  const validBet = Number.isInteger(bet) && bet >= 1 && bet <= Math.min(maxBet, balanceAvail);
  const canSubmit = validBet && guess !== null && phase !== "rolling";

  async function play() {
    if (!canSubmit || guess === null) return;
    setPhase("rolling");
    setErrorMsg(null);
    setResult(null);

    const res = await startGuessNumber(bet, guess);
    await wait(1000);

    if (!res.ok) {
      setErrorMsg(res.error.error);
      setPhase("error");
      return;
    }
    setResult(res.data);
    setPhase("settled");
    if (typeof res.data.newBalance === "number") onResolved(res.data.newBalance);
    void refetchActivity();
  }

  function reset() {
    setPhase("idle");
    setResult(null);
    setErrorMsg(null);
    setGuess(null);
  }

  const r = result?.result?.type === "guessnumber" ? result.result : null;
  const showOutcome = phase === "settled" && r;

  return (
    <IslandCard style={{ display: "grid", gap: 14, padding: 18 }}>
      <div style={headerStyle}>
        <div>
          <div className="island-display" style={{ fontSize: 18, fontWeight: 800 }}>Hi-Lo</div>
          <div style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
            8× on win · pick 1–10 · max bet {maxBet}
          </div>
        </div>
        <BackBtn onBack={onBack} />
      </div>

      {/* Felt stage */}
      <div style={feltStyle}>
        <SeatLabel>{phase === "rolling" ? "Rolling…" : showOutcome ? "Secret" : "Awaiting roll"}</SeatLabel>
        {phase === "rolling" ? (
          <div className="casino-dice-rolling" style={dieStyle("#94a3b8")}>?</div>
        ) : showOutcome && r ? (
          <div className="casino-result-enter" style={dieStyle(r.won ? "#22c55e" : "#ef4444")}>
            {r.secret}
          </div>
        ) : (
          <div style={dieStyle("#475569")}>?</div>
        )}
        {phase !== "settled" && guess !== null && (
          <div style={callTagStyle}>You guessed <strong style={{ color: "#7dd3fc" }}>{guess}</strong></div>
        )}
      </div>

      {showOutcome && r && (
        <div className="casino-result-enter" style={outcomeStyle(r.won)}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {r.won ? "🎯 Bullseye!" : "🎯 Not this time"}
          </div>
          <div style={{ fontSize: 12, color: islandTheme.color.textSubtle, marginTop: 4 }}>
            Secret was <strong>{r.secret}</strong> · you guessed <strong>{r.guess}</strong>
            {" · "}
            {r.won ? `+${result!.payout! - result!.bet} Nuggies` : `-${result!.bet} Nuggies`}
            {result?.newBalance != null && ` · balance now ₦${result.newBalance.toLocaleString()}`}
          </div>
        </div>
      )}

      {phase === "error" && errorMsg && (
        <div style={errorStyle}>{errorMsg}</div>
      )}

      <div style={controlBarStyle}>
        {phase !== "settled" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ ...labelStyle, textAlign: "center" }}>Bet (Nuggies)</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
                <input
                  type="number"
                  min={1}
                  max={Math.min(maxBet, balanceAvail)}
                  value={bet}
                  onChange={(e) => setBet(parseInt(e.target.value, 10) || 0)}
                  disabled={phase === "rolling"}
                  style={{ ...inputStyle, width: 130, textAlign: "center" }}
                />
                {[10, 25, 50, 100].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setBet(Math.min(amount, maxBet, balanceAvail))}
                    disabled={phase === "rolling" || amount > balanceAvail || amount > maxBet}
                    style={chipPresetStyle}
                  >
                    {amount}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: islandTheme.color.textMuted, textAlign: "center" }}>
                Balance: ₦{balanceAvail.toLocaleString()}
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <label style={labelStyle}>Pick a number</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setGuess(n)}
                    disabled={phase === "rolling"}
                    style={numberBtnStyle(guess === n, phase === "rolling")}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <IslandButton
              variant="primary"
              disabled={!canSubmit}
              onClick={() => void play()}
              style={{ alignSelf: "center", minWidth: 220 }}
            >
              {phase === "rolling" ? "Rolling…" : guess === null ? "Pick a number" : `Guess ${guess} for ₦${bet}`}
            </IslandButton>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <IslandButton variant="primary" onClick={reset}>Play again</IslandButton>
            <IslandButton variant="secondary" onClick={onBack}>Back to lobby</IslandButton>
          </div>
        )}
      </div>
    </IslandCard>
  );
}

function SeatLabel({ children }: { children: React.ReactNode }) {
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

function BackBtn({ onBack }: { onBack: () => void }) {
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
      ← Lobby
    </button>
  );
}

function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function dieStyle(accent: string): React.CSSProperties {
  return {
    width: 90,
    height: 90,
    borderRadius: 16,
    background: `linear-gradient(155deg, ${accent}30 0%, ${accent}10 100%)`,
    border: `2px solid ${accent}`,
    color: accent,
    fontFamily: "var(--island-mono, monospace)",
    fontSize: 44,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: `0 0 24px ${accent}40, 0 8px 18px rgba(0, 0, 0, 0.4)`
  };
}

function numberBtnStyle(selected: boolean, disabled: boolean): React.CSSProperties {
  return {
    ...islandTagStyle({ color: "#38bdf8", active: selected }),
    padding: "10px 0",
    fontSize: 14,
    fontWeight: 800,
    fontFamily: "var(--island-mono, monospace)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    justifyContent: "center"
  };
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: islandTheme.color.textMuted,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontFamily: "var(--island-mono, monospace)"
};

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${islandTheme.color.cardBorder}`,
  background: islandTheme.color.panelMutedBg,
  color: islandTheme.color.textPrimary,
  fontSize: 14,
  font: "inherit"
};

const errorStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  background: "rgba(239, 68, 68, 0.10)",
  border: "1px solid rgba(239, 68, 68, 0.35)",
  color: "#fca5a5",
  fontSize: 13
};

function outcomeStyle(won: boolean): React.CSSProperties {
  return {
    padding: "12px 14px",
    borderRadius: 10,
    background: won ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.10)",
    border: `1px solid ${won ? "rgba(34, 197, 94, 0.30)" : "rgba(239, 68, 68, 0.30)"}`,
    textAlign: "center"
  };
}

const feltStyle: React.CSSProperties = {
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

const callTagStyle: React.CSSProperties = {
  fontSize: 12,
  color: islandTheme.color.textMuted,
  letterSpacing: "0.04em",
  fontFamily: "var(--island-mono, monospace)"
};

const controlBarStyle: React.CSSProperties = {
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
  fontWeight: 800,
  fontSize: 12,
  fontFamily: "var(--island-mono, monospace)",
  cursor: "pointer",
  letterSpacing: "0.04em"
};
