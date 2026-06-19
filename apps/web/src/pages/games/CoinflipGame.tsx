import { useEffect, useState } from "react";
import { IslandButton, IslandCard, IslandTag, islandTagStyle } from "../../islandUi.js";
import { NuggieCoin } from "../../components/NuggieCoin.js";
import { islandTheme } from "../../theme.js";
import { startCoinflip, type GameStateResponse } from "../../api/games.js";
import { useRefetchActivity } from "../../system/activityContext.js";

type Props = {
  startBalance: number | null;
  maxBet: number;
  onResolved: (newBalance: number) => void;
  onBack: () => void;
};

export function CoinflipGame({ startBalance, maxBet, onResolved, onBack }: Props) {
  const [bet, setBet] = useState(10);
  const [call, setCall] = useState<"heads" | "tails">("heads");
  const [phase, setPhase] = useState<"idle" | "flipping" | "settled" | "error">("idle");
  const [result, setResult] = useState<GameStateResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const refetchActivity = useRefetchActivity();

  const balanceAvail = startBalance ?? 0;
  const validBet = Number.isInteger(bet) && bet >= 1 && bet <= Math.min(maxBet, balanceAvail);

  async function flip() {
    if (!validBet || phase === "flipping") return;
    setPhase("flipping");
    setErrorMsg(null);
    setResult(null);

    const res = await startCoinflip(bet, call);

    // Hold on the spinning animation a beat for drama.
    await wait(1200);

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
  }

  const r = result?.result?.type === "coinflip" ? result.result : null;
  const showOutcome = phase === "settled" && r;

  return (
    <IslandCard style={{ display: "grid", gap: 14, padding: 18 }}>
      <div style={headerStyle}>
        <div>
          <div className="island-display" style={{ fontSize: 18, fontWeight: 800 }}>Coinflip</div>
          <div style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
            1.9× on win · 5% house edge · max bet {maxBet}
          </div>
        </div>
        <BackBtn onBack={onBack} />
      </div>

      {/* Felt stage */}
      <div style={feltStyle}>
        <SeatLabel>{phase === "flipping" ? "Flipping…" : showOutcome ? "Result" : "Coin"}</SeatLabel>
        <Coin
          face={showOutcome ? r!.outcome : "heads"}
          spinning={phase === "flipping"}
        />
        {phase !== "settled" && (
          <div style={callTagStyle}>You called <strong style={{ color: "#fde68a" }}>{call}</strong></div>
        )}
      </div>

      {/* Outcome banner */}
      {showOutcome && r && (
        <div className="casino-result-enter" style={outcomeStyle(r.won)}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {r.won ? "🎉 You won!" : "😕 You lost"}
          </div>
          <div style={{ fontSize: 12, color: islandTheme.color.textSubtle, marginTop: 4 }}>
            Coin landed on <strong>{r.outcome}</strong> · you called <strong>{r.call}</strong>
            {" · "}
            {r.won ? `+${result!.payout! - result!.bet} Nuggies` : `-${result!.bet} Nuggies`}
            {result?.newBalance != null && ` · balance now ₦${result.newBalance.toLocaleString()}`}
          </div>
        </div>
      )}

      {phase === "error" && errorMsg && (
        <div style={errorStyle}>{errorMsg}</div>
      )}

      {/* Controls */}
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
                  disabled={phase === "flipping"}
                  style={{ ...inputStyle, width: 130, textAlign: "center" }}
                />
                {[10, 25, 50, 100].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setBet(Math.min(amount, maxBet, balanceAvail))}
                    disabled={phase === "flipping" || amount > balanceAvail || amount > maxBet}
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
              <label style={labelStyle}>Your call</label>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <CallChip active={call === "heads"} onClick={() => setCall("heads")} disabled={phase === "flipping"}>
                  🪙 Heads
                </CallChip>
                <CallChip active={call === "tails"} onClick={() => setCall("tails")} disabled={phase === "flipping"}>
                  🥏 Tails
                </CallChip>
              </div>
            </div>

            <IslandButton
              variant="primary"
              disabled={!validBet || phase === "flipping"}
              onClick={() => void flip()}
              style={{ alignSelf: "center", minWidth: 200 }}
            >
              {phase === "flipping" ? "Flipping…" : `Flip for ₦${bet}`}
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

function Coin({ face, spinning }: { face: "heads" | "tails"; spinning: boolean }) {
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

  return (
    <div
      className={spinning ? "casino-coin-spinning" : ""}
      style={{
        width: 128,
        height: 128,
        borderRadius: "50%",
        boxShadow:
          "0 0 24px rgba(251, 191, 36, 0.35), 0 12px 28px rgba(0, 0, 0, 0.55), inset 0 0 0 2px rgba(120, 53, 15, 0.55)"
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

// Suppress TS unused-import noise
void IslandTag;
