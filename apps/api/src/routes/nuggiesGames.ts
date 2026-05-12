import { Router, type Request, type Response } from "express";
import { requireBotOrSession } from "../lib/auth.js";
import {
  GameAlreadyActiveError,
  GameCooldownError,
  GameDisabledError,
  GameExpiredError,
  GameNotFoundError,
  InsufficientFundsError,
  InvalidGameInputError,
  OptedOutError,
  getActiveGame,
  listGames,
  startGame,
  stepGame,
  withIdempotency,
  type Surface
} from "../lib/nuggiesGames.js";
import { db } from "../db/client.js";

export const nuggiesGamesRouter = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

async function resolveInternalUserId(discordUserId: string): Promise<bigint | null> {
  const r = await db.query<{ id: string }>(
    "SELECT id FROM users WHERE discord_user_id = $1",
    [discordUserId]
  );
  return r.rows[0] ? BigInt(r.rows[0].id) : null;
}

function pickSurface(req: Request): Surface {
  return req.get("x-island-bot-secret") ? "bot" : "web";
}

function requireIdempotencyKey(req: Request, res: Response): string | null {
  const key = req.get("idempotency-key");
  if (!key || key.length < 8 || key.length > 200) {
    res.status(400).json({ error: "Idempotency-Key header is required (8-200 chars)" });
    return null;
  }
  return key;
}

function mapGameError(err: unknown, res: Response): boolean {
  if (err instanceof GameDisabledError) {
    res.status(503).json({ error: err.message });
    return true;
  }
  if (err instanceof GameAlreadyActiveError) {
    res.status(409).json({ error: err.message, code: "game_active" });
    return true;
  }
  if (err instanceof GameCooldownError) {
    res.status(409).json({ error: err.message, code: "cooldown", secondsLeft: err.secondsLeft });
    return true;
  }
  if (err instanceof GameNotFoundError) {
    res.status(404).json({ error: err.message });
    return true;
  }
  if (err instanceof GameExpiredError) {
    res.status(410).json({ error: err.message });
    return true;
  }
  if (err instanceof InvalidGameInputError) {
    res.status(400).json({ error: err.message });
    return true;
  }
  if (err instanceof InsufficientFundsError) {
    res.status(422).json({ error: err.message });
    return true;
  }
  if (err instanceof OptedOutError) {
    res.status(403).json({ error: err.message });
    return true;
  }
  return false;
}

// ── GET /nuggies/games ──────────────────────────────────────────────────────
// Catalog: which games are registered. Lobby UI uses this to render cards.

nuggiesGamesRouter.get("/", requireBotOrSession, (_req, res) => {
  res.json({ games: listGames() });
});

// ── GET /nuggies/games/active ────────────────────────────────────────────────

nuggiesGamesRouter.get("/active", requireBotOrSession, async (_req, res) => {
  const discordUserId = String(res.locals.userId);
  try {
    const state = await getActiveGame(discordUserId);
    res.json({ active: state });
  } catch (err) {
    if (mapGameError(err, res)) return;
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// ── POST /nuggies/games/:gameType/start ──────────────────────────────────────

nuggiesGamesRouter.post("/:gameType/start", requireBotOrSession, async (req, res) => {
  const idempotencyKey = requireIdempotencyKey(req, res);
  if (!idempotencyKey) return;

  const discordUserId = String(res.locals.userId);
  const userId = await resolveInternalUserId(discordUserId);
  if (!userId) { res.status(404).json({ error: "User not found" }); return; }

  const gameType = String(req.params.gameType ?? "");
  const bet = Number(req.body?.bet);
  const input = req.body?.input ?? {};
  const surface = pickSurface(req);

  try {
    const result = await withIdempotency({
      key: idempotencyKey,
      userId,
      endpoint: `start:${gameType}`,
      fn: async () => {
        try {
          const state = await startGame({
            discordUserId,
            surface,
            gameType,
            bet,
            input
          });
          return { body: state, statusCode: 200 };
        } catch (err) {
          // Translate to a wrapped response so we don't cache failures
          // but still pass them out cleanly.
          throw err;
        }
      }
    });
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    if (mapGameError(err, res)) return;
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

// ── POST /nuggies/games/:sessionId/step ──────────────────────────────────────

nuggiesGamesRouter.post("/:sessionId/step", requireBotOrSession, async (req, res) => {
  const idempotencyKey = requireIdempotencyKey(req, res);
  if (!idempotencyKey) return;

  const discordUserId = String(res.locals.userId);
  const userId = await resolveInternalUserId(discordUserId);
  if (!userId) { res.status(404).json({ error: "User not found" }); return; }

  const sessionId = parseInt(String(req.params.sessionId ?? ""), 10);
  if (!Number.isInteger(sessionId)) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  const action = req.body?.action;
  if (action !== "hit" && action !== "stand" && action !== "double") {
    res.status(400).json({ error: "action must be 'hit', 'stand', or 'double'" });
    return;
  }

  try {
    const result = await withIdempotency({
      key: idempotencyKey,
      userId,
      endpoint: `step:${sessionId}:${action}`,
      fn: async () => {
        const state = await stepGame({ discordUserId, sessionId, action });
        return { body: state, statusCode: 200 };
      }
    });
    res.status(result.statusCode).json(result.body);
  } catch (err) {
    if (mapGameError(err, res)) return;
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});
