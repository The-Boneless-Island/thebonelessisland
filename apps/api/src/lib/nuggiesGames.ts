// Server-authoritative Nuggies games engine.
//
// Single source of truth for RNG, game state, bet debit, payout credit, and
// concurrent-play prevention across all surfaces (web, Discord bot).
//
// Critical invariants:
//   1. RNG happens here — clients never declare an outcome.
//   2. UNIQUE(user_id) on nuggies_active_games is the universal mutex; one
//      game in flight per user across web AND bot.
//   3. Bet debit + active-game insert + cooldown read all happen in one DB
//      transaction. If the active-game insert fails (409), nothing else moved.
//   4. Idempotency-Key header → cached response for 1 hour. Retried mutating
//      requests are safe.
//   5. Stateful games (blackjack) auto-resolve when expires_at lapses;
//      sweepExpiredGames runs on an interval and on every fresh start.

import type { PoolClient } from "pg";
import { db } from "../db/client.js";
import { broadcast } from "./eventBus.js";
import { ensureSettingsLoaded, getAISetting } from "./serverSettings.js";
import {
  GameCooldownError,
  InsufficientFundsError,
  OptedOutError
} from "./nuggiesLedger.js";

// ── Error types ──────────────────────────────────────────────────────────────

export class GameAlreadyActiveError extends Error {
  constructor() { super("User already has a game in progress"); }
}

export class GameNotFoundError extends Error {
  constructor() { super("Game session not found"); }
}

export class GameExpiredError extends Error {
  constructor() { super("Game session expired"); }
}

export class InvalidGameInputError extends Error {
  constructor(msg: string) { super(msg); }
}

export class GameDisabledError extends Error {
  constructor() { super("Nuggies games are disabled"); }
}

// ── Public types ─────────────────────────────────────────────────────────────

export type Surface = "web" | "bot";

export type ActiveGameRow = {
  id: number;
  userId: bigint;
  gameType: string;
  bet: number;
  state: Record<string, unknown>;
  startedAt: string;
  expiresAt: string;
  surface: Surface;
};

export type GameStatus = "active" | "resolved";

export type GameState = {
  sessionId: number;
  gameType: string;
  bet: number;
  status: GameStatus;
  data: Record<string, unknown>;
  result?: GameResult;
  payout?: number;
  newBalance?: number;
  expiresAt: string;
};

export type GameResult =
  | {
      type: "coinflip";
      call: "heads" | "tails";
      outcome: "heads" | "tails";
      won: boolean;
    }
  | {
      type: "guessnumber";
      guess: number;
      secret: number;
      won: boolean;
    }
  | {
      type: "blackjack";
      playerHand: BlackjackCard[];
      dealerHand: BlackjackCard[];
      result: "win" | "lose" | "push" | "blackjack";
    };

export type BlackjackCard = {
  rank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
  suit: "♠" | "♥" | "♦" | "♣";
};

// ── GameContext ──────────────────────────────────────────────────────────────
// Passed to handler.start() / handler.step() / handler.autoResolve().
// All DB mutations done by handlers go through this client so they stay in
// the engine's transaction.

export type GameContext = {
  client: PoolClient;
  userId: bigint;
  surface: Surface;
};

// ── GameHandler ──────────────────────────────────────────────────────────────

export type StepAction = "hit" | "stand" | "double";

export type GameHandler<TInput = unknown> = {
  type: string;
  isStateful: boolean;
  validateInput: (raw: unknown) => TInput;
  start: (ctx: GameContext, input: TInput, bet: number, sessionId: number) => Promise<GameState>;
  step?: (ctx: GameContext, session: ActiveGameRow, action: StepAction) => Promise<GameState>;
  autoResolve?: (ctx: GameContext, session: ActiveGameRow) => Promise<GameState>;
  // Convert stored row state → public client view. Required for stateful games
  // so internal data (deck contents, dealer hole card) never leaks to clients
  // via /active polling. Stateless games typically don't persist a row past
  // resolution, but a safe default is provided in getActiveGame.
  viewActive?: (session: ActiveGameRow) => GameState;
};

export const gameRegistry = new Map<string, GameHandler<unknown>>();

export function registerGame(handler: GameHandler<unknown>) {
  gameRegistry.set(handler.type, handler);
}

export function listGames(): Array<{ type: string; isStateful: boolean }> {
  return [...gameRegistry.values()].map((h) => ({ type: h.type, isStateful: h.isStateful }));
}

// ── Settings helpers ─────────────────────────────────────────────────────────

function getNumberSetting(key: string, fallback: number): number {
  const raw = getAISetting(key);
  if (raw == null) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function maxBetFor(gameType: string): number {
  const override = getNumberSetting(`nuggies_max_bet_${gameType}`, NaN);
  if (Number.isFinite(override)) return override;
  return getNumberSetting("nuggies_max_bet", 500);
}

function cooldownSecsFor(gameType: string): number {
  const override = getNumberSetting(`nuggies_game_cooldown_secs_${gameType}`, NaN);
  if (Number.isFinite(override)) return override;
  return getNumberSetting("nuggies_game_cooldown_secs", 3);
}

function gamesEnabled(): boolean {
  const raw = getAISetting("nuggies_enabled");
  if (raw == null) return true;
  return raw === "true";
}

// ── Resolve user_id ──────────────────────────────────────────────────────────

async function resolveUserId(discordUserId: string): Promise<bigint> {
  const r = await db.query<{ id: string; nuggies_opted_out: boolean }>(
    "SELECT id, nuggies_opted_out FROM users WHERE discord_user_id = $1",
    [discordUserId]
  );
  if (!r.rows[0]) throw new Error(`User not found: ${discordUserId}`);
  if (r.rows[0].nuggies_opted_out) throw new OptedOutError();
  return BigInt(r.rows[0].id);
}

// ── Internal: write balance + ledger in caller's transaction ─────────────────
// Used by game handlers to apply bet debits and payout credits without leaving
// the engine's transaction. Mirrors applyTransaction() but takes an existing
// client.

async function applyLedgerInTx(client: PoolClient, opts: {
  userId: bigint;
  amount: number;
  type: string;
  reason: string;
  referenceId?: string;
}): Promise<{ newBalance: number }> {
  // Upsert balance row
  await client.query(
    `INSERT INTO nuggies_balances (user_id, balance)
     VALUES ($1, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [opts.userId]
  );

  // Pessimistic lock on balance row
  const balRow = await client.query<{ balance: string }>(
    "SELECT balance FROM nuggies_balances WHERE user_id = $1 FOR UPDATE",
    [opts.userId]
  );
  const currentBalance = parseInt(balRow.rows[0]?.balance ?? "0", 10);

  if (currentBalance + opts.amount < 0) {
    throw new InsufficientFundsError();
  }

  const newBalance = currentBalance + opts.amount;

  await client.query(
    "UPDATE nuggies_balances SET balance = $1, updated_at = NOW() WHERE user_id = $2",
    [newBalance, opts.userId]
  );

  await client.query(
    `INSERT INTO nuggies_transactions
       (user_id, amount, type, reason, reference_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [opts.userId, opts.amount, opts.type, opts.reason, opts.referenceId ?? null]
  );

  return { newBalance };
}

// ── Cooldown check inside transaction ────────────────────────────────────────

async function checkCooldownInTx(client: PoolClient, userId: bigint, gameType: string): Promise<void> {
  const cooldownSecs = cooldownSecsFor(gameType);
  const r = await client.query<{ created_at: string }>(
    `SELECT created_at FROM nuggies_transactions
     WHERE user_id = $1 AND type LIKE 'game_%'
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  if (r.rows.length === 0) return;
  const lastGame = new Date(r.rows[0].created_at).getTime();
  const elapsed = Math.floor((Date.now() - lastGame) / 1000);
  if (elapsed < cooldownSecs) {
    throw new GameCooldownError(cooldownSecs - elapsed);
  }
}

// ── Active-game row helpers ──────────────────────────────────────────────────

const STATEFUL_TIMEOUT_SECS = 60;
const STATELESS_TIMEOUT_SECS = 30;

function rowToActiveGame(row: {
  id: string | number;
  user_id: string;
  game_type: string;
  bet: string;
  state: Record<string, unknown>;
  started_at: string;
  expires_at: string;
  surface: Surface;
}): ActiveGameRow {
  return {
    id: typeof row.id === "string" ? parseInt(row.id, 10) : row.id,
    userId: BigInt(row.user_id),
    gameType: row.game_type,
    bet: parseInt(row.bet, 10),
    state: row.state ?? {},
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    surface: row.surface
  };
}

async function insertActiveGame(client: PoolClient, opts: {
  userId: bigint;
  gameType: string;
  bet: number;
  state: Record<string, unknown>;
  surface: Surface;
  isStateful: boolean;
}): Promise<{ id: number; expiresAt: string }> {
  const timeoutSecs = opts.isStateful ? STATEFUL_TIMEOUT_SECS : STATELESS_TIMEOUT_SECS;
  const r = await client.query<{ id: string; expires_at: string }>(
    `INSERT INTO nuggies_active_games
       (user_id, game_type, bet, state, expires_at, surface)
     VALUES ($1, $2, $3, $4, NOW() + ($5 || ' seconds')::interval, $6)
     ON CONFLICT (user_id) DO NOTHING
     RETURNING id, expires_at`,
    [opts.userId, opts.gameType, opts.bet, opts.state, String(timeoutSecs), opts.surface]
  );
  if (r.rows.length === 0) {
    throw new GameAlreadyActiveError();
  }
  return {
    id: parseInt(r.rows[0].id, 10),
    expiresAt: r.rows[0].expires_at
  };
}

async function deleteActiveGame(client: PoolClient, sessionId: number): Promise<void> {
  await client.query("DELETE FROM nuggies_active_games WHERE id = $1", [sessionId]);
}

async function lockActiveGame(client: PoolClient, sessionId: number): Promise<ActiveGameRow | null> {
  const r = await client.query(
    "SELECT * FROM nuggies_active_games WHERE id = $1 FOR UPDATE",
    [sessionId]
  );
  if (r.rows.length === 0) return null;
  return rowToActiveGame(r.rows[0]);
}

async function lockActiveGameByUser(client: PoolClient, userId: bigint): Promise<ActiveGameRow | null> {
  const r = await client.query(
    "SELECT * FROM nuggies_active_games WHERE user_id = $1 FOR UPDATE",
    [userId]
  );
  if (r.rows.length === 0) return null;
  return rowToActiveGame(r.rows[0]);
}

async function updateActiveGame(client: PoolClient, sessionId: number, state: Record<string, unknown>, extendTimeout: boolean): Promise<string> {
  const r = await client.query<{ expires_at: string }>(
    extendTimeout
      ? `UPDATE nuggies_active_games
           SET state = $2, expires_at = NOW() + ($3 || ' seconds')::interval
         WHERE id = $1
         RETURNING expires_at`
      : `UPDATE nuggies_active_games
           SET state = $2
         WHERE id = $1
         RETURNING expires_at`,
    extendTimeout
      ? [sessionId, state, String(STATEFUL_TIMEOUT_SECS)]
      : [sessionId, state]
  );
  return r.rows[0]?.expires_at ?? "";
}

// ── Idempotency wrapper ──────────────────────────────────────────────────────

export type IdempotencyResult<T> = {
  body: T;
  statusCode: number;
  replayed: boolean;
};

export async function withIdempotency<T>(opts: {
  key: string;
  userId: bigint;
  endpoint: string;
  fn: () => Promise<{ body: T; statusCode: number }>;
}): Promise<IdempotencyResult<T>> {
  // Cache lookup
  const cached = await db.query<{ response: T; status_code: number }>(
    "SELECT response, status_code FROM api_idempotency WHERE key = $1 AND user_id = $2 AND endpoint = $3 AND expires_at > NOW()",
    [opts.key, opts.userId, opts.endpoint]
  );
  if (cached.rows.length > 0) {
    return {
      body: cached.rows[0].response,
      statusCode: cached.rows[0].status_code,
      replayed: true
    };
  }

  // Run the work
  const { body, statusCode } = await opts.fn();

  // Cache success responses (any 2xx). Failures aren't cached so the user
  // can retry after fixing the input.
  if (statusCode >= 200 && statusCode < 300) {
    await db.query(
      `INSERT INTO api_idempotency (key, user_id, endpoint, response, status_code)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (key) DO NOTHING`,
      [opts.key, opts.userId, opts.endpoint, body, statusCode]
    );
  }

  return { body, statusCode, replayed: false };
}

// ── Public API: startGame ────────────────────────────────────────────────────

export async function startGame(opts: {
  discordUserId: string;
  surface: Surface;
  gameType: string;
  bet: number;
  input: unknown;
}): Promise<GameState> {
  await ensureSettingsLoaded();

  if (!gamesEnabled()) throw new GameDisabledError();

  const handler = gameRegistry.get(opts.gameType);
  if (!handler) throw new InvalidGameInputError(`Unknown game type: ${opts.gameType}`);

  // Validate input shape (per-handler)
  const validatedInput = handler.validateInput(opts.input);

  // Validate bet
  if (!Number.isInteger(opts.bet) || opts.bet <= 0) {
    throw new InvalidGameInputError("Bet must be a positive integer");
  }
  const max = maxBetFor(opts.gameType);
  if (opts.bet > max) {
    throw new InvalidGameInputError(`Bet exceeds max (${max})`);
  }

  // Resolve user (also enforces opted-out)
  const userId = await resolveUserId(opts.discordUserId);

  // Sweep expired sessions opportunistically before checking active-game
  // UNIQUE constraint, so a stale row doesn't 409 us forever.
  await sweepUserExpiredSession(userId);

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    await checkCooldownInTx(client, userId, opts.gameType);

    // Reserve the active-game slot. Fails 409 if another game is in flight.
    const initialState: Record<string, unknown> = {};
    const { id: sessionId } = await insertActiveGame(client, {
      userId,
      gameType: opts.gameType,
      bet: opts.bet,
      state: initialState,
      surface: opts.surface,
      isStateful: handler.isStateful
    });

    const ctx: GameContext = { client, userId, surface: opts.surface };
    const result = await handler.start(ctx, validatedInput, opts.bet, sessionId);

    await client.query("COMMIT");
    // Bet debit committed — nudge the player's web tabs to refresh their balance.
    broadcast("nuggies-changed", { discordUserId: opts.discordUserId });
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Public API: stepGame ─────────────────────────────────────────────────────

export async function stepGame(opts: {
  discordUserId: string;
  sessionId: number;
  action: StepAction;
}): Promise<GameState> {
  await ensureSettingsLoaded();
  if (!gamesEnabled()) throw new GameDisabledError();

  const userId = await resolveUserId(opts.discordUserId);

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const session = await lockActiveGame(client, opts.sessionId);
    if (!session) throw new GameNotFoundError();
    if (session.userId !== userId) throw new GameNotFoundError();

    if (new Date(session.expiresAt).getTime() < Date.now()) {
      // Auto-resolve expired session and surface as 410
      const handler = gameRegistry.get(session.gameType);
      if (handler?.autoResolve) {
        const ctx: GameContext = { client, userId, surface: session.surface };
        await handler.autoResolve(ctx, session);
      }
      await client.query("COMMIT");
      // Auto-resolve of an expired session may have settled the balance.
      broadcast("nuggies-changed", { discordUserId: opts.discordUserId });
      throw new GameExpiredError();
    }

    const handler = gameRegistry.get(session.gameType);
    if (!handler?.step) throw new InvalidGameInputError(`Game does not support step: ${session.gameType}`);

    const ctx: GameContext = { client, userId, surface: session.surface };
    const result = await handler.step(ctx, session, opts.action);

    await client.query("COMMIT");
    // Step committed (a stand/bust settles the payout) — refresh the player's balance.
    broadcast("nuggies-changed", { discordUserId: opts.discordUserId });
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Public API: getActiveGame ────────────────────────────────────────────────

export async function getActiveGame(discordUserId: string): Promise<GameState | null> {
  const userId = await resolveUserId(discordUserId).catch(() => null);
  if (userId == null) return null;

  // Lazy sweep
  await sweepUserExpiredSession(userId);

  const r = await db.query(
    "SELECT * FROM nuggies_active_games WHERE user_id = $1",
    [userId]
  );
  if (r.rows.length === 0) return null;
  const row = rowToActiveGame(r.rows[0]);

  // Hand off to handler for masking. Raw state contains private data (deck
  // contents, dealer hole card, etc.) that must never leak to clients.
  const handler = gameRegistry.get(row.gameType);
  if (handler?.viewActive) {
    return handler.viewActive(row);
  }
  // Safe default: minimal envelope, no internal state.
  return {
    sessionId: row.id,
    gameType: row.gameType,
    bet: row.bet,
    status: "active",
    data: {},
    expiresAt: row.expiresAt
  };
}

// ── Public API: sweepExpiredGames ────────────────────────────────────────────

export async function sweepExpiredGames(): Promise<{ resolved: number }> {
  const expired = await db.query<{ id: string }>(
    "SELECT id FROM nuggies_active_games WHERE expires_at <= NOW()"
  );
  let resolved = 0;
  for (const row of expired.rows) {
    try {
      await sweepSessionById(parseInt(row.id, 10));
      resolved += 1;
    } catch {
      // Best-effort; another sweep will pick up next round.
    }
  }
  return { resolved };
}

async function sweepUserExpiredSession(userId: bigint): Promise<void> {
  const r = await db.query<{ id: string }>(
    "SELECT id FROM nuggies_active_games WHERE user_id = $1 AND expires_at <= NOW()",
    [userId]
  );
  if (r.rows.length === 0) return;
  await sweepSessionById(parseInt(r.rows[0].id, 10));
}

async function sweepSessionById(sessionId: number): Promise<void> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const session = await lockActiveGame(client, sessionId);
    if (!session) {
      await client.query("ROLLBACK");
      return;
    }
    if (new Date(session.expiresAt).getTime() > Date.now()) {
      await client.query("ROLLBACK");
      return;
    }
    const handler = gameRegistry.get(session.gameType);
    if (handler?.autoResolve) {
      const ctx: GameContext = { client, userId: session.userId, surface: session.surface };
      await handler.autoResolve(ctx, session);
    } else {
      // No autoResolve (stateless games shouldn't get here, but if they do,
      // just delete).
      await deleteActiveGame(client, session.id);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ── Helpers exposed to handlers ──────────────────────────────────────────────

export const gameInternals = {
  applyLedger: applyLedgerInTx,
  insertActiveGame,
  deleteActiveGame,
  lockActiveGame,
  lockActiveGameByUser,
  updateActiveGame,
  rowToActiveGame
};

// Re-export error types game handlers may throw
export { OptedOutError, InsufficientFundsError, GameCooldownError } from "./nuggiesLedger.js";
