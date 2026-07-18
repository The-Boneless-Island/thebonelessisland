import { useEffect, useState } from "react";
import { IslandButton, IslandCard, useCountUp } from "../../islandUi.js";
import { ConfettiBurst } from "../../system/celebration.js";
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
  tallyRound,
  useCooldown
} from "./casinoShared.js";

type Props = {
  startBalance: number | null;
  maxBet: number;
  cooldownSecs: number;
  initialState: GameStateResponse | null; // resume support
  onResolved: (newBalance: number) => void;
  onBack: () => void;
};

type Phase = "idle" | "starting" | "active" | "stepping" | "settled";

// One-click round loop: after a hand settles the last table stays on the felt,
// the outcome shows as a banner, and the bet controls + "Deal again" are right
// there — no intermediate "New hand" screen swap. The primary button counts
// the server cooldown down in place.
export function BlackjackGame({ startBalance, maxBet, cooldownSecs, initialState, onResolved, onBack }: Props) {
  const [bet, setBet] = useState(25);
  const [phase, setPhase] = useState<Phase>(() => (initialState && initialState.status === "active" ? "active" : "idle"));
  const [state, setState] = useState<GameStateResponse | null>(initialState);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [run, setRun] = useState(EMPTY_RUN);
  const [confetti, setConfetti] = useState(0);
  const refetchActivity = useRefetchActivity();
  const cooldown = useCooldown();

  const balanceAvail = startBalance ?? 0;
  const animatedBalance = useCountUp(balanceAvail);
  const validBet = Number.isInteger(bet) && bet >= 1 && bet <= Math.min(maxBet, balanceAvail);
  const inHand = phase === "active" || phase === "stepping";

  // Poll for state changes while active (keeps in sync if user also has bot view).
  // No document.visibilityState guard here on purpose: this interval only
  // exists while `phase === "active"` (a hand is in progress, money on the
  // table) — the effect's own early-return below already IS the "pause when
  // no hand is active" behavior other pollers get from a visibility check.
  // Skipping ticks on tab-hide would desync the balance/hand state from the
  // bot view while a bet is live, which is the one case that must keep
  // polling regardless of tab visibility.
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

  function settle(data: GameStateResponse) {
    setState(data);
    setPhase("settled");
    if (data.result?.type === "blackjack") {
      const payout = data.payout ?? 0;
      const won = data.result.result === "win" || data.result.result === "blackjack";
      setRun((prev) => tallyRound(prev, payout - data.bet, won));
      if (won) setConfetti((n) => n + 1);
    }
    if (typeof data.newBalance === "number") onResolved(data.newBalance);
    void refetchActivity();
  }

  async function deal() {
    if (!validBet || phase === "starting" || !cooldown.ready) return;
    setPhase("starting");
    setErrorMsg(null);
    cooldown.arm(cooldownSecs);
    const res = await startBlackjack(bet);
    if (!res.ok) {
      if (res.error.code === "cooldown" && res.error.secondsLeft) {
        cooldown.arm(res.error.secondsLeft);
      } else {
        setErrorMsg(res.error.error);
      }
      setPhase("idle");
      return;
    }
    if (res.data.status === "resolved") {
      settle(res.data);
    } else {
      setState(res.data);
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
      setPhase("active");
      return;
    }
    if (res.data.status === "resolved") {
      settle(res.data);
    } else {
      setState(res.data);
      setPhase("active");
    }
  }

  const settled = phase === "settled" && state?.result?.type === "blackjack";
  const dealLabel = phase === "starting"
    ? "Shuffling…"
    : !cooldown.ready
      ? `Ready in ${cooldown.secondsLeft}s`
      : settled
        ? "Deal again"
        : "Deal";

  return (
    <IslandCard style={{ display: "grid", gap: 14, padding: 18, position: "relative" }}>
      <ConfettiBurst trigger={confetti} />
      <div style={casinoHeaderStyle}>
        <div>
          <div className="island-display" style={{ fontSize: 18, fontWeight: 700 }}>Blackjack</div>
          <div style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
            Dealer stands on 17 · Blackjack pays 3:2 · Double on first 2 cards · auto-stand 60s · max bet {maxBet}
          </div>
        </div>
        <BackBtn onBack={onBack} />
      </div>

      {/* Felt table — stays up after the hand settles so the result reads. */}
      {state && (
        <div style={casinoFeltStyle}>
          <div style={seatStyle}>
            <SeatLabel>Dealer</SeatLabel>
            <CardRow
              cards={state.data.dealerHand ?? []}
              hidden={inHand ? state.data.dealerHidden ?? 0 : 0}
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
          <SessionStrip run={run} />
        </div>
      )}

      {/* Outcome banner */}
      {settled && state?.result?.type === "blackjack" && (
        <OutcomeBanner
          won={state.result.result === "win" || state.result.result === "blackjack"}
          push={state.result.result === "push"}
          headline={`${state.result.result === "blackjack" ? "🃏✨ " : ""}${blackjackResultLabel(state.result.result)}`}
          net={(state.payout ?? 0) - state.bet}
          detail={state.result.result === "push" ? "Bet refunded" : null}
        />
      )}

      {errorMsg && <div style={casinoErrorStyle}>{errorMsg}</div>}

      {/* Controls */}
      <div style={casinoControlBarStyle}>
        {inHand ? (
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
          <div style={{ display: "grid", gap: 12 }}>
            <BetControls bet={bet} setBet={setBet} balance={balanceAvail} maxBet={maxBet} disabled={phase === "starting"} />
            <IslandButton
              variant="primary"
              disabled={!validBet || phase === "starting" || !cooldown.ready}
              onClick={() => void deal()}
              style={{ alignSelf: "center", minWidth: 180 }}
            >
              {dealLabel}
            </IslandButton>
            <div style={{ fontSize: 12, color: islandTheme.color.textMuted, textAlign: "center" }}>
              Balance: ₦{animatedBalance.toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </IslandCard>
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
        fontWeight: 700,
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
