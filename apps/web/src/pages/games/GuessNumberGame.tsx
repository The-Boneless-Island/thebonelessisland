import { useEffect, useState } from "react";
import { IslandButton, IslandCard, islandTagStyle, useCountUp } from "../../islandUi.js";
import { ConfettiBurst } from "../../system/celebration.js";
import { islandTheme } from "../../theme.js";
import { startGuessNumber, type GameStateResponse } from "../../api/games.js";
import { useRefetchActivity } from "../../system/activityContext.js";
import {
  BackBtn,
  BetControls,
  EMPTY_RUN,
  OutcomeBanner,
  SeatLabel,
  SessionStrip,
  casinoControlBarStyle,
  casinoErrorStyle,
  casinoFeltStyle,
  casinoHeaderStyle,
  casinoLabelStyle,
  tallyRound,
  useCooldown,
  wait
} from "./casinoShared.js";

type Props = {
  startBalance: number | null;
  maxBet: number;
  cooldownSecs: number;
  onResolved: (newBalance: number) => void;
  onBack: () => void;
};

// One-click round loop: controls stay mounted, the last guess stays selected
// (the old flow cleared it every round, forcing a re-pick), and the primary
// button counts the server cooldown down in place.
export function GuessNumberGame({ startBalance, maxBet, cooldownSecs, onResolved, onBack }: Props) {
  const [bet, setBet] = useState(10);
  const [guess, setGuess] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "rolling" | "settled">("idle");
  const [result, setResult] = useState<GameStateResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [run, setRun] = useState(EMPTY_RUN);
  const [confetti, setConfetti] = useState(0);
  const refetchActivity = useRefetchActivity();
  const cooldown = useCooldown();

  const balanceAvail = startBalance ?? 0;
  const animatedBalance = useCountUp(balanceAvail);
  const validBet = Number.isInteger(bet) && bet >= 1 && bet <= Math.min(maxBet, balanceAvail);
  const busy = phase === "rolling";
  const canSubmit = validBet && guess !== null && !busy && cooldown.ready;

  async function play() {
    if (!canSubmit || guess === null) return;
    setPhase("rolling");
    setErrorMsg(null);
    setResult(null);
    cooldown.arm(cooldownSecs);

    const res = await startGuessNumber(bet, guess);
    await wait(1000);

    if (!res.ok) {
      if (res.error.code === "cooldown" && res.error.secondsLeft) {
        cooldown.arm(res.error.secondsLeft);
      } else {
        setErrorMsg(res.error.error);
      }
      setPhase("idle");
      return;
    }
    setResult(res.data);
    setPhase("settled");
    const r = res.data.result?.type === "guessnumber" ? res.data.result : null;
    if (r) {
      const net = r.won ? (res.data.payout ?? 0) - res.data.bet : -res.data.bet;
      setRun((prev) => tallyRound(prev, net, r.won));
      if (r.won) setConfetti((n) => n + 1);
    }
    if (typeof res.data.newBalance === "number") onResolved(res.data.newBalance);
    void refetchActivity();
  }

  const r = result?.result?.type === "guessnumber" ? result.result : null;
  const showOutcome = phase === "settled" && r;

  const buttonLabel = busy
    ? "Rolling…"
    : !cooldown.ready
      ? `Ready in ${cooldown.secondsLeft}s`
      : guess === null
        ? "Pick a number"
        : showOutcome
          ? `Roll again · ${guess} for ₦${bet}`
          : `Guess ${guess} for ₦${bet}`;

  return (
    <IslandCard style={{ display: "grid", gap: 14, padding: 18, position: "relative" }}>
      <ConfettiBurst trigger={confetti} />
      <div style={casinoHeaderStyle}>
        <div>
          <div className="island-display" style={{ fontSize: 18, fontWeight: 700 }}>Hi-Lo</div>
          <div style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
            8× on win · pick 1–10 · max bet {maxBet}
          </div>
        </div>
        <BackBtn onBack={onBack} />
      </div>

      {/* Felt stage */}
      <div style={casinoFeltStyle}>
        <SeatLabel>{busy ? "Rolling…" : showOutcome ? "Secret" : "Awaiting roll"}</SeatLabel>
        {busy ? (
          <RollingDie />
        ) : showOutcome && r ? (
          <div className="casino-banner-pop" style={dieStyle(r.won ? "#22c55e" : "#ef4444")}>
            {r.secret}
          </div>
        ) : (
          <div style={dieStyle("#475569")}>?</div>
        )}
        {guess !== null && (
          <div style={callTagStyle}>
            Your number: <strong style={{ color: "#7dd3fc" }}>{guess}</strong>
          </div>
        )}
        <SessionStrip run={run} />
      </div>

      {showOutcome && r && (
        <OutcomeBanner
          won={r.won}
          headline={r.won ? "🎯 Bullseye!" : "🎯 Not this time"}
          net={r.won ? result!.payout! - result!.bet : -result!.bet}
          detail={
            <>
              Secret was <strong>{r.secret}</strong> · you guessed <strong>{r.guess}</strong>
            </>
          }
        />
      )}

      {errorMsg && <div style={casinoErrorStyle}>{errorMsg}</div>}

      {/* Controls — always mounted so a replay is a single click. */}
      <div style={casinoControlBarStyle}>
        <div style={{ display: "grid", gap: 12 }}>
          <BetControls bet={bet} setBet={setBet} balance={balanceAvail} maxBet={maxBet} disabled={busy} />

          <div style={{ display: "grid", gap: 8 }}>
            <label style={casinoLabelStyle}>Pick a number</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setGuess(n)}
                  disabled={busy}
                  style={numberBtnStyle(guess === n, busy)}
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
            style={{ alignSelf: "center", minWidth: 230 }}
          >
            {buttonLabel}
          </IslandButton>

          <div style={{ fontSize: 12, color: islandTheme.color.textMuted, textAlign: "center" }}>
            Balance: ₦{animatedBalance.toLocaleString()}
          </div>
        </div>
      </div>
    </IslandCard>
  );
}

// Slot-machine feel while the server round-trips: the die cycles digits
// instead of sitting on a static "?".
function RollingDie() {
  const [shown, setShown] = useState(1);
  useEffect(() => {
    const id = setInterval(() => {
      setShown((prev) => (prev % 10) + 1);
    }, 90);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="casino-dice-rolling" style={dieStyle("#94a3b8")}>
      {shown}
    </div>
  );
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
    fontWeight: 700,
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
    fontWeight: 700,
    fontFamily: "var(--island-mono, monospace)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    justifyContent: "center"
  };
}

const callTagStyle: React.CSSProperties = {
  fontSize: 12,
  color: islandTheme.color.textMuted,
  letterSpacing: "0.04em",
  fontFamily: "var(--island-mono, monospace)"
};
