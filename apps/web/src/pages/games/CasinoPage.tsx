import { useEffect, useState } from "react";
import { IslandCard, IslandTag, islandTagStyle } from "../../islandUi.js";
import { NuggieCoin } from "../../components/NuggieCoin.js";
import { islandTheme } from "../../theme.js";
import { apiFetch } from "../../api/client.js";
import { useNuggiesSignal } from "../../system/nuggiesSignal.js";
import { getActiveGameSession, type GameStateResponse } from "../../api/games.js";
import { CoinflipGame } from "./CoinflipGame.js";
import { GuessNumberGame } from "./GuessNumberGame.js";
import { BlackjackGame } from "./BlackjackGame.js";
import "./games.css";

type View = "lobby" | "coinflip" | "guessnumber" | "blackjack";

const GAME_CARDS: Array<{
  view: Exclude<View, "lobby">;
  title: string;
  emoji: string;
  blurb: string;
  accent: string;
  payoutBlurb: string;
}> = [
  {
    view: "coinflip",
    title: "Coinflip",
    emoji: "🪙",
    blurb: "Heads or tails. Quick flip, quick payoff.",
    accent: "#fbbf24",
    payoutBlurb: "1.9× on win"
  },
  {
    view: "guessnumber",
    title: "Hi-Lo",
    emoji: "🎯",
    blurb: "Pick 1–10. Hit the secret number for a big multiplier.",
    accent: "#38bdf8",
    payoutBlurb: "8× on win"
  },
  {
    view: "blackjack",
    title: "Blackjack",
    emoji: "🃏",
    blurb: "Beat the dealer to 21 without busting.",
    accent: "#22c55e",
    payoutBlurb: "Up to 2.5×"
  }
];

const DEFAULT_MAX_BET = 500;
const DEFAULT_COOLDOWN_SECS = 3;

export function CasinoPage() {
  const [view, setView] = useState<View>("lobby");
  const [balance, setBalance] = useState<number | null>(null);
  const [maxBet, setMaxBet] = useState<number>(DEFAULT_MAX_BET);
  const [cooldownSecs, setCooldownSecs] = useState<number>(DEFAULT_COOLDOWN_SECS);
  const [active, setActive] = useState<GameStateResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Initial fetch: balance + active session
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [meRes, activeRes] = await Promise.all([
        apiFetch("/nuggies/me"),
        getActiveGameSession()
      ]);
      if (cancelled) return;

      if (meRes.ok) {
        const me = (await meRes.json()) as { balance?: number };
        setBalance(me.balance ?? 0);
      }
      if (activeRes.ok && activeRes.data.active) {
        setActive(activeRes.data.active);
        // Resume directly into the active game's view
        const t = activeRes.data.active.gameType;
        if (t === "coinflip" || t === "guessnumber" || t === "blackjack") {
          setView(t);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Live balance: refetch when the SSE bus reports this member's Nuggies changed
  // (e.g. a blackjack hand played on the Discord bot while the arcade is open).
  const nuggiesSignal = useNuggiesSignal();
  useEffect(() => {
    if (nuggiesSignal === 0) return;
    let cancelled = false;
    void (async () => {
      const meRes = await apiFetch("/nuggies/me");
      if (cancelled || !meRes.ok) return;
      const me = (await meRes.json()) as { balance?: number };
      setBalance(me.balance ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [nuggiesSignal]);

  // Pull max-bet config from server-settings via the public catalog (best
  // effort — fall back to default).
  useEffect(() => {
    void apiFetch("/settings").then(async (r) => {
      if (!r.ok) return;
      const data = (await r.json()) as { settings?: Array<{ key: string; value: string }> };
      const mb = data.settings?.find((s) => s.key === "nuggies_max_bet");
      if (mb?.value) {
        const n = parseInt(mb.value, 10);
        if (Number.isFinite(n) && n > 0) setMaxBet(n);
      }
      const cd = data.settings?.find((s) => s.key === "nuggies_game_cooldown_secs");
      if (cd?.value) {
        const n = parseInt(cd.value, 10);
        if (Number.isFinite(n) && n >= 0) setCooldownSecs(n);
      }
    }).catch(() => {});
  }, []);

  function handleResolved(newBalance: number) {
    setBalance(newBalance);
    setActive(null);
  }

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <h1 className="island-display" style={{ margin: 0, fontSize: "clamp(24px, 3vw, 32px)" }}>
          Nuggie Casino
        </h1>
        <div style={{ fontSize: 14, color: islandTheme.color.textMuted }}>Loading…</div>
      </div>
    );
  }

  if (view === "coinflip") {
    return (
      <CoinflipGame
        startBalance={balance}
        maxBet={maxBet}
        onResolved={handleResolved}
        onBack={() => setView("lobby")}
      />
    );
  }
  if (view === "guessnumber") {
    return (
      <GuessNumberGame
        startBalance={balance}
        maxBet={maxBet}
        onResolved={handleResolved}
        onBack={() => setView("lobby")}
      />
    );
  }
  if (view === "blackjack") {
    return (
      <BlackjackGame
        startBalance={balance}
        maxBet={maxBet}
        initialState={active && active.gameType === "blackjack" ? active : null}
        onResolved={handleResolved}
        onBack={() => setView("lobby")}
      />
    );
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* Header */}
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          className="island-mono"
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: islandTheme.color.textMuted,
            display: "inline-flex",
            alignItems: "center",
            gap: 6
          }}
        >
          <NuggieCoin size={14} /> Nuggies · Nuggie Casino
        </span>
        <h1 className="island-display" style={{ margin: 0, fontSize: "clamp(28px, 4vw, 38px)", fontWeight: 700 }}>
          Nuggie Casino
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            lineHeight: 1.5,
            color: islandTheme.color.textSubtle,
            maxWidth: 640
          }}
        >
          Same games as Discord — play-money only, bragging rights optional.
          One game at a time across web and bot.
        </p>
      </header>

      {/* Balance + active-game banner */}
      <BalanceStrip balance={balance} maxBet={maxBet} cooldownSecs={cooldownSecs} />

      {active && (
        <ResumeBanner
          active={active}
          onResume={() => {
            const t = active.gameType;
            if (t === "coinflip" || t === "guessnumber" || t === "blackjack") setView(t);
          }}
        />
      )}

      {/* Game grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14
        }}
      >
        {GAME_CARDS.map((g) => (
          <GameTile key={g.view} card={g} onClick={() => setView(g.view)} disabled={!!active && active.gameType !== g.view} />
        ))}
      </div>
    </div>
  );
}

function BalanceStrip({ balance, maxBet, cooldownSecs }: { balance: number | null; maxBet: number; cooldownSecs: number }) {
  return (
    <IslandCard
      style={{
        padding: "12px 16px",
        display: "flex",
        gap: 14,
        alignItems: "center",
        flexWrap: "wrap",
        background: `linear-gradient(135deg, rgba(251,191,119,0.12) 0%, ${islandTheme.color.panelBg} 100%)`,
        border: `1px solid rgba(251,191,119,0.20)`
      }}
    >
      <div>
        <div className="island-mono" style={{ fontSize: 12, color: islandTheme.color.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Balance
        </div>
        <div className="island-display" style={{ fontSize: 22, fontWeight: 700, color: islandTheme.color.nuggieGold }}>
          ₦{balance == null ? "—" : balance.toLocaleString()}
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <IslandTag tone="warning">Max bet ₦{maxBet}</IslandTag>
        <IslandTag tone="default">Cooldown {cooldownSecs}s</IslandTag>
      </div>
    </IslandCard>
  );
}

function ResumeBanner({ active, onResume }: { active: GameStateResponse; onResume: () => void }) {
  return (
    <IslandCard
      style={{
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "rgba(56, 189, 248, 0.10)",
        border: "1px solid rgba(56, 189, 248, 0.35)"
      }}
    >
      <span style={{ fontSize: 18 }}>⚠</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: islandTheme.color.textPrimary }}>
          You have a {active.gameType} game in progress
        </div>
        <div style={{ fontSize: 12, color: islandTheme.color.textMuted, marginTop: 2 }}>
          Bet ₦{active.bet} · auto-resolves at {new Date(active.expiresAt).toLocaleTimeString()}
        </div>
      </div>
      <button
        type="button"
        onClick={onResume}
        className="island-mono"
        style={{
          ...islandTagStyle({ color: "#38bdf8", active: true }),
          padding: "6px 14px",
          fontSize: 12,
          cursor: "pointer"
        }}
      >
        Resume →
      </button>
    </IslandCard>
  );
}

function GameTile({ card, onClick, disabled }: { card: typeof GAME_CARDS[number]; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        textAlign: "left",
        padding: 16,
        borderRadius: 14,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        // Felt-table base under each game's accent — reads "casino", not
        // another glass panel. Pairs with the felt-green scene tint.
        background: `radial-gradient(ellipse at 30% 20%, ${card.accent}26 0%, transparent 55%), linear-gradient(150deg, rgba(20,83,45,0.34) 0%, rgba(13,53,30,0.22) 55%, ${islandTheme.color.panelBg} 100%)`,
        color: islandTheme.color.textPrimary,
        cursor: disabled ? "not-allowed" : "pointer",
        font: "inherit",
        opacity: disabled ? 0.5 : 1,
        transition: "transform 140ms ease, border-color 140ms ease",
        display: "grid",
        gap: 8
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.borderColor = card.accent;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = islandTheme.color.cardBorder;
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: `${card.accent}33`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22
        }}
      >
        {card.emoji}
      </div>
      <div className="island-display" style={{ fontSize: 16, fontWeight: 700 }}>
        {card.title}
      </div>
      <div style={{ fontSize: 12, color: islandTheme.color.textSubtle, lineHeight: 1.45 }}>
        {card.blurb}
      </div>
      <div className="island-mono" style={{ fontSize: 12, color: card.accent, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {card.payoutBlurb} →
      </div>
    </button>
  );
}
