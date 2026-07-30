import { useEffect, useState } from "react";
import { IslandButton, IslandCard, islandTagStyle, useCountUp } from "../../islandUi.js";
import { NuggieCoin } from "../../components/NuggieCoin.js";
import { ConfettiBurst } from "../../system/celebration.js";
import { islandTheme } from "../../theme.js";
import { startCoinflip, type GameStateResponse } from "../../api/games.js";
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

// One-click round loop: the controls never unmount. Bet and call persist
// across rounds, the outcome shows as a banner above them, and the primary
// button counts the server cooldown down in place — so a 10-round run is
// literally 10 clicks of the same button.
export function CoinflipGame({ startBalance, maxBet, cooldownSecs, onResolved, onBack }: Props) {
  const [bet, setBet] = useState(10);
  const [call, setCall] = useState<"heads" | "tails">("heads");
  const [phase, setPhase] = useState<"idle" | "flipping" | "settled">("idle");
  const [result, setResult] = useState<GameStateResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [run, setRun] = useState(EMPTY_RUN);
  const [confetti, setConfetti] = useState(0);
  const refetchActivity = useRefetchActivity();
  const cooldown = useCooldown();

  const balanceAvail = startBalance ?? 0;
  const animatedBalance = useCountUp(balanceAvail);
  const validBet = Number.isInteger(bet) && bet >= 1 && bet <= Math.min(maxBet, balanceAvail);
  const busy = phase === "flipping";

  async function flip() {
    if (!validBet || busy || !cooldown.ready) return;
    setPhase("flipping");
    setErrorMsg(null);
    setResult(null);
    // The server counts the cooldown from the start call — arm now so the
    // button's countdown matches reality instead of erroring on a fast replay.
    cooldown.arm(cooldownSecs);

    const res = await startCoinflip(bet, call);

    // Hold on the spinning animation a beat for drama.
    await wait(1200);

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
    const r = res.data.result?.type === "coinflip" ? res.data.result : null;
    if (r) {
      const net = r.won ? (res.data.payout ?? 0) - res.data.bet : -res.data.bet;
      setRun((prev) => tallyRound(prev, net, r.won));
      if (r.won) setConfetti((n) => n + 1);
    }
    if (typeof res.data.newBalance === "number") onResolved(res.data.newBalance);
    void refetchActivity();
  }

  const r = result?.result?.type === "coinflip" ? result.result : null;
  const showOutcome = phase === "settled" && r;

  const buttonLabel = busy
    ? "Flipping…"
    : !cooldown.ready
      ? `Ready in ${cooldown.secondsLeft}s`
      : showOutcome
        ? `Flip again for ₦${bet}`
        : `Flip for ₦${bet}`;

  return (
    <IslandCard style={{ display: "grid", gap: 14, padding: 18, position: "relative" }}>
      <ConfettiBurst trigger={confetti} />
      <div style={casinoHeaderStyle}>
        <div>
          <div className="island-display" style={{ fontSize: 18, fontWeight: 700 }}>Coinflip</div>
          <div style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
            1.9× on win · 5% house edge · max bet {maxBet}
          </div>
        </div>
        <BackBtn onBack={onBack} />
      </div>

      {/* Felt stage */}
      <div style={casinoFeltStyle}>
        <SeatLabel>{busy ? "Flipping…" : showOutcome ? "Result" : "Coin"}</SeatLabel>
        <Coin face={showOutcome ? r!.outcome : "heads"} spinning={busy} landed={!!showOutcome} won={showOutcome ? r!.won : false} />
        <div style={callTagStyle}>
          You call <strong style={{ color: "#fde68a" }}>{call}</strong>
        </div>
        <SessionStrip run={run} />
      </div>

      {/* Outcome banner */}
      {showOutcome && r && (
        <OutcomeBanner
          won={r.won}
          headline={r.won ? "🎉 You won!" : "😕 You lost"}
          net={r.won ? result!.payout! - result!.bet : -result!.bet}
          detail={
            <>
              Coin landed on <strong>{r.outcome}</strong> · you called <strong>{r.call}</strong>
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
            <label style={{ ...casinoLabelStyle, textAlign: "center" }}>Your call</label>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <CallChip active={call === "heads"} onClick={() => setCall("heads")} disabled={busy}>
                🪙 Heads
              </CallChip>
              <CallChip active={call === "tails"} onClick={() => setCall("tails")} disabled={busy}>
                🥏 Tails
              </CallChip>
            </div>
          </div>

          <IslandButton
            variant="primary"
            disabled={!validBet || busy || !cooldown.ready}
            onClick={() => void flip()}
            style={{ alignSelf: "center", minWidth: 210 }}
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

function Coin({ face, spinning, landed, won }: { face: "heads" | "tails"; spinning: boolean; landed: boolean; won: boolean }) {
  const [tickFace, setTickFace] = useState<"heads" | "tails">(face);

  useEffect(() => {
    if (!spinning) {
      setTickFace(face);
      return;
    }
    const id = setInterval(() => {
      setTickFace((prev) => (prev === "heads" ? "tails" : "heads"));
    }, 130);
    return () => clearInterval(id);
  }, [spinning, face]);

  const shown = spinning ? tickFace : face;
  const className = spinning ? "casino-coin-spinning" : landed ? "casino-coin-land" : "";

  return (
    <div
      className={className}
      style={{
        width: 128,
        height: 128,
        borderRadius: "50%",
        boxShadow: landed && won
          ? "0 0 40px rgba(251, 191, 36, 0.6), 0 12px 28px rgba(0, 0, 0, 0.55), inset 0 0 0 2px rgba(120, 53, 15, 0.55)"
          : "0 0 24px rgba(251, 191, 36, 0.35), 0 12px 28px rgba(0, 0, 0, 0.55), inset 0 0 0 2px rgba(120, 53, 15, 0.55)"
      }}
    >
      <NuggieCoin face={shown} size={128} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

function CallChip({ active, disabled, onClick, children }: { active: boolean; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...islandTagStyle({ color: "#fbbf24", active }),
        padding: "6px 14px",
        fontSize: 12,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1
      }}
      className="island-mono"
    >
      {children}
    </button>
  );
}

const callTagStyle: React.CSSProperties = {
  fontSize: 12,
  color: islandTheme.color.textMuted,
  letterSpacing: "0.04em",
  fontFamily: "var(--island-mono, monospace)"
};
