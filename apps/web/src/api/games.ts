import { apiFetch } from "./client.js";

// ── Shared types ────────────────────────────────────────────────────────────

export type Card = {
  rank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
  suit: "♠" | "♥" | "♦" | "♣";
};

export type GameStatus = "active" | "resolved";

export type GameResult =
  | { type: "coinflip"; call: "heads" | "tails"; outcome: "heads" | "tails"; won: boolean }
  | { type: "guessnumber"; guess: number; secret: number; won: boolean }
  | {
      type: "blackjack";
      playerHand: Card[];
      dealerHand: Card[];
      result: "win" | "lose" | "push" | "blackjack";
    };

export type GameStateResponse = {
  sessionId: number;
  gameType: string;
  bet: number;
  status: GameStatus;
  data: {
    playerHand?: Card[];
    dealerHand?: Card[];
    dealerHidden?: number;
    playerTotal?: number;
    dealerVisibleTotal?: number;
    dealerTotal?: number;
    canDouble?: boolean;
    doubled?: boolean;
    originalBet?: number;
  };
  result?: GameResult;
  payout?: number;
  newBalance?: number;
  expiresAt: string;
};

export type GameError = {
  status: number;
  error: string;
  code?: "cooldown" | "game_active";
  secondsLeft?: number;
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: GameError };

// ── Idempotency-key helper ──────────────────────────────────────────────────

function newIdempotencyKey(prefix: string): string {
  // crypto.randomUUID is available in all modern browsers + Node 19+
  const uuid = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `web-${prefix}-${uuid}`;
}

// ── Wire helpers ────────────────────────────────────────────────────────────

async function postWithKey<T>(path: string, body: unknown, prefix: string): Promise<ApiResult<T>> {
  const key = newIdempotencyKey(prefix);
  const res = await apiFetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": key
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data as { error?: string; code?: "cooldown" | "game_active"; secondsLeft?: number } | null;
    return {
      ok: false,
      error: {
        status: res.status,
        error: err?.error ?? "Request failed",
        code: err?.code,
        secondsLeft: err?.secondsLeft
      }
    };
  }
  return { ok: true, data: data as T };
}

// ── Public API ──────────────────────────────────────────────────────────────

export type GameCatalogEntry = { type: string; isStateful: boolean };

export async function getGameCatalog(): Promise<ApiResult<{ games: GameCatalogEntry[] }>> {
  const res = await apiFetch("/nuggies/games");
  if (!res.ok) {
    return { ok: false, error: { status: res.status, error: "Failed to load catalog" } };
  }
  const data = (await res.json()) as { games: GameCatalogEntry[] };
  return { ok: true, data };
}

export async function getActiveGameSession(): Promise<ApiResult<{ active: GameStateResponse | null }>> {
  const res = await apiFetch("/nuggies/games/active");
  if (!res.ok) {
    return { ok: false, error: { status: res.status, error: "Failed to load active game" } };
  }
  const data = (await res.json()) as { active: GameStateResponse | null };
  return { ok: true, data };
}

export function startCoinflip(bet: number, call: "heads" | "tails") {
  return postWithKey<GameStateResponse>(
    "/nuggies/games/coinflip/start",
    { bet, input: { call } },
    "cf-start"
  );
}

export function startGuessNumber(bet: number, guess: number) {
  return postWithKey<GameStateResponse>(
    "/nuggies/games/guessnumber/start",
    { bet, input: { guess } },
    "gn-start"
  );
}

export function startBlackjack(bet: number) {
  return postWithKey<GameStateResponse>(
    "/nuggies/games/blackjack/start",
    { bet, input: {} },
    "bj-start"
  );
}

export function blackjackStep(sessionId: number, action: "hit" | "stand" | "double") {
  return postWithKey<GameStateResponse>(
    `/nuggies/games/${sessionId}/step`,
    { action },
    `bj-${action}`
  );
}

// ── Pretty-print helpers (UI shared) ────────────────────────────────────────

export function formatCard(c: Card): string {
  return `${c.rank}${c.suit}`;
}

export function blackjackResultLabel(r: "win" | "lose" | "push" | "blackjack"): string {
  switch (r) {
    case "blackjack": return "Blackjack!";
    case "win":      return "You win";
    case "push":     return "Push";
    case "lose":     return "You lose";
  }
}
