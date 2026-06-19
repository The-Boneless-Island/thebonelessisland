import { useEffect, useState } from "react";
import { IslandButton, IslandCard } from "../../islandUi.js";
import { islandTheme } from "../../theme.js";
import {
  blackjackResultLabel,
  blackjackStep,
  getActiveGameSession,
  startBlackjack,
  type Card,
  type GameStateResponse
} from "../../api/games.js";
import { useRefetchActivity } from "../../system/activityContext.js";

type Props = {
  startBalance: number | null;
  maxBet: number;
  initialState: GameStateResponse | null; // resume support
  onResolved: (newBalance: number) => void;
  onBack: () => void;
};

type Phase = "idle" | "starting" | "active" | "stepping" | "settled" | "error";

export function BlackjackGame({ startBalance, maxBet, initialState, onResolved, onBack }: Props) {
  const [bet, setBet] = useState(25);
  const [phase, setPhase] = useState<Phase>(() => (initialState && initialState.status === "active" ? "active" : "idle"));
  const [state, setState] = useState<GameStateResponse | null>(initialState);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const refetchActivity = useRefetchActivity();

  const balanceAvail = startBalance ?? 0;
  const validBet = Number.isInteger(bet) && bet >= 1 && bet <= Math.min(maxBet, balanceAvail);

  // Poll for state changes while active (keeps in sync if user also has bot view)
  useEffect(() => {
    if (phase !== "active") return;
    let cancelled = false;
    const id = setInterval(async () => {
      const res = await getActiveGameSession();
      if (cancelled) return;
      if (!res.ok) return;
      if (res.data.active === null) {
        // Hand resolved elsewhere — refresh to settled view via best-effort.
        setPhase("idle");
        setState(null);
        return;
      }
      setState(res.data.active);
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [phase]);

  async function deal() {
    if (!validBet || phase === "starting") return;
    setPhase("starting");
    setErrorMsg(null);
    const res = await startBlackjack(bet);
    if (!res.ok) {
      setErrorMsg(res.error.error);
      setPhase("error");
      return;
    }
    setState(res.data);
    if (res.data.status === "resolved") {
      setPhase("settled");
      if (typeof res.data.newBalance === "number") onResolved(res.data.newBalance);
      void refetchActivity();
    } else {
      setPhase("active");
    }
  }

  async function step(action: "hit" | "stand" | "double") {
    if (!state || phase === "stepping") return;
    setPhase("stepping");
    setErrorMsg(null);
    const res = await blackjackStep(state.sessionId, action);
    if (!res.ok) {
      setErrorMsg(res.error.error);
      setPhase("error");
      return;
    }
    setState(res.data);
    if (res.data.status === "resolved") {
      setPhase("settled");
      if (typeof res.data.newBalance === "number") onResolved(res.data.newBalance);
      void refetchActivity();
    } else {
      setPhase("active");
    }
  }

  function reset() {
    setPhase("idle");
    setState(null);
    setErrorMsg(null);
  }

  return (
    <IslandCard style={{ display: "grid", gap: 14, padding: 18 }}>
      <div style={headerStyle}>
        <div>
          <div className="island-display" style={{ fontSize: 18, fontWeight: 800 }}>Blackjack</div>
          <div style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
            Dealer stands on 17 · Blackjack pays 3:2 · Double on first 2 cards · auto-stand 60s · max bet {maxBet}
          </div>
        </div>
        <BackBtn onBack={onBack} />
      </div>

      {/* Felt table */}
      {state && (
        <div style={feltStyle}>
          <div style={seatStyle}>
            <SeatLabel>Dealer</SeatLabel>
            <CardRow
              cards={state.data.dealerHand ?? []}
              hidden={phase === "active" || phase === "stepping" ? state.data.dealerHidden ?? 0 : 0}
              total={
                state.status === "resolved"
                  ? state.data.dealerTotal
                  : state.data.dealerVisibleTotal
              }
              isDealer
            />
          </div>
          <div style={feltDividerStyle} aria-hidden="true" />
          <div style={seatStyle}>
            <SeatLabel>You</SeatLabel>
            <CardRow
              cards={state.data.playerHand ?? []}
              hidden={0}
              total={state.data.playerTotal}
            />
            {typeof state.bet === "number" && state.bet > 0 && (
              <div style={betChipStyle}>
                <span aria-hidden="true">🪙</span> Bet ₦{state.bet.toLocaleString()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Outcome banner */}
      {phase === "settled" && state?.result?.type === "blackjack" && (
        <div className="casino-result-enter" style={outcomeStyle(state.result.result)}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>
            {state.result.result === "blackjack" && "🃏✨ "}
            {blackjackResultLabel(state.result.result)}
          </div>
          <div style={{ fontSize: 12, color: islandTheme.color.textSubtle, marginTop: 4 }}>
            {payoutNote(state)}
            {state.newBalance != null && ` · balance now ₦${state.newBalance.toLocaleString()}`}
          </div>
        </div>
      )}

      {phase === "error" && errorMsg && <div style={errorStyle}>{errorMsg}</div>}

      {/* Controls */}
      <div style={controlBarStyle}>
        {phase === "idle" || phase === "error" ? (
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ ...labelStyle, textAlign: "center" }}>Bet (Nuggies)</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
              <input
                type="number"
                min={1}
                max={Math.min(maxBet, balanceAvail)}
                value={bet}
                onChange={(e) => setBet(parseInt(e.target.value, 10) || 0)}
                style={{ ...inputStyle, width: 130, textAlign: "center" }}
              />
              {[10, 25, 50, 100].map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setBet(Math.min(amount, maxBet, balanceAvail))}
                  style={chipPresetStyle}
                  disabled={amount > balanceAvail || amount > maxBet}
                >
                  {amount}
                </button>
              ))}
              <IslandButton variant="primary" disabled={!validBet} onClick={() => void deal()} style={{ minWidth: 120 }}>
                Deal
              </IslandButton>
            </div>
            <div style={{ fontSize: 12, color: islandTheme.color.textMuted, textAlign: "center" }}>
              Balance: ₦{balanceAvail.toLocaleString()}
            </div>
          </div>
        ) : phase === "starting" ? (
          <div style={{ fontSize: 13, color: islandTheme.color.textMuted, textAlign: "center" }}>
            Shuffling…
          </div>
        ) : phase === "active" || phase === "stepping" ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <IslandButton
              variant="primary"
              disabled={phase === "stepping"}
              onClick={() => void step("hit")}
              style={{ flex: "1 1 110px", maxWidth: 180 }}
            >
              {phase === "stepping" ? "…" : "Hit"}
            </IslandButton>
            <IslandButton
              variant="secondary"
              disabled={phase === "stepping"}
              onClick={() => void step("stand")}
              style={{ flex: "1 1 110px", maxWidth: 180 }}
            >
              Stand
            </IslandButton>
            {state?.data.canDouble && (state?.data.playerHand?.length ?? 0) === 2 ? (
              <IslandButton
                variant="secondary"
                disabled={phase === "stepping" || balanceAvail < (state?.data.originalBet ?? state?.bet ?? 0)}
                onClick={() => void step("double")}
                style={{ flex: "1 1 110px", maxWidth: 180 }}
              >
                Double
              </IslandButton>
            ) : null}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <IslandButton variant="primary" onClick={reset}>New hand</IslandButton>
            <IslandButton variant="secondary" onClick={onBack}>Back to lobby</IslandButton>
          </div>
        )}
      </div>
    </IslandCard>
  );
}

function payoutNote(state: GameStateResponse): string {
  const payout = state.payout ?? 0;
  if (payout > state.bet) return `+${payout - state.bet} Nuggies`;
  if (payout === state.bet) return `bet refunded`;
  return `-${state.bet - payout} Nuggies`;
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

function CardRow({
  cards,
  hidden,
  total,
  isDealer = false
}: {
  cards: Card[];
  hidden: number;
  total?: number;
  isDealer?: boolean;
}) {
  const showTotal = typeof total === "number" && total > 0;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {cards.map((c, i) => <CardView key={`${c.rank}${c.suit}-${i}`} card={c} />)}
        {Array.from({ length: hidden }).map((_, i) => <CardView key={`hidden-${i}`} hidden />)}
      </div>
      {showTotal && <ScoreChip total={total!} isDealer={isDealer} />}
    </div>
  );
}

function ScoreChip({ total, isDealer }: { total: number; isDealer: boolean }) {
  const bust = total > 21;
  const blackjack = total === 21;
  const color = bust
    ? islandTheme.color.dangerSoft
    : blackjack
      ? "#fde68a"
      : isDealer
        ? islandTheme.color.nuggieGold
        : islandTheme.color.textPrimary;
  const bg = bust
    ? "rgba(239, 68, 68, 0.20)"
    : blackjack
      ? "rgba(250, 204, 21, 0.18)"
      : "rgba(0, 0, 0, 0.45)";
  const border = bust
    ? "rgba(239, 68, 68, 0.55)"
    : blackjack
      ? "rgba(250, 204, 21, 0.55)"
      : "rgba(255, 255, 255, 0.14)";
  return (
    <div
      className="island-mono"
      style={{
        minWidth: 48,
        padding: "6px 14px",
        borderRadius: 999,
        fontSize: 14,
        fontWeight: 800,
        letterSpacing: "0.06em",
        textAlign: "center",
        color,
        background: bg,
        border: `1px solid ${border}`,
        boxShadow: "0 4px 14px rgba(0,0,0,0.35)"
      }}
    >
      {total}{bust ? " · BUST" : blackjack ? " · 21" : ""}
    </div>
  );
}

function CardView({ card, hidden }: { card?: Card; hidden?: boolean }) {
  if (hidden || !card) {
    return <div className="casino-card hidden casino-card-enter">??</div>;
  }
  const isRed = card.suit === "♥" || card.suit === "♦";
  return (
    <div className={`casino-card ${isRed ? "red" : ""} casino-card-enter`}>
      <span className="rank">{card.rank}</span>
      <span className="suit">{card.suit}</span>
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

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12
};

const feltStyle: React.CSSProperties = {
  position: "relative",
  padding: "26px 18px 30px",
  borderRadius: 18,
  background:
    "radial-gradient(120% 90% at 50% 0%, rgba(20, 110, 80, 0.55) 0%, rgba(10, 60, 48, 0.85) 55%, rgba(6, 30, 26, 0.95) 100%)",
  border: "1px solid rgba(34, 197, 94, 0.28)",
  boxShadow:
    "inset 0 0 80px rgba(0, 0, 0, 0.55), inset 0 0 0 1px rgba(255, 255, 255, 0.04), 0 8px 24px rgba(0, 0, 0, 0.35)",
  display: "grid",
  gap: 18
};

const seatStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10
};

const feltDividerStyle: React.CSSProperties = {
  height: 1,
  width: "60%",
  margin: "0 auto",
  background:
    "linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.18), transparent)"
};

const betChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 12px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  fontFamily: "var(--island-mono, monospace)",
  color: "#fde68a",
  background: "rgba(250, 204, 21, 0.10)",
  border: "1px solid rgba(250, 204, 21, 0.35)",
  letterSpacing: "0.04em"
};

const controlBarStyle: React.CSSProperties = {
  padding: "12px 14px",
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

function outcomeStyle(result: "win" | "lose" | "push" | "blackjack"): React.CSSProperties {
  const win = result === "win" || result === "blackjack";
  const push = result === "push";
  return {
    padding: "12px 14px",
    borderRadius: 10,
    background: win ? "rgba(34, 197, 94, 0.12)" : push ? "rgba(245, 158, 11, 0.10)" : "rgba(239, 68, 68, 0.10)",
    border: `1px solid ${win ? "rgba(34, 197, 94, 0.30)" : push ? "rgba(245, 158, 11, 0.30)" : "rgba(239, 68, 68, 0.30)"}`
  };
}
