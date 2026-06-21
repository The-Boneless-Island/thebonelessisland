import {
  formatNuggiesReason,
  NUGGIES_TX_TYPE,
} from "@island/shared";
import {
  InvalidGameInputError,
  type GameHandler,
  type GameState,
  gameInternals
} from "../nuggiesGames.js";
import { checkGameAchievementsByUserId } from "../nuggiesAchievements.js";

type GuessNumberInput = { guess: number };

const MIN = 1;
const MAX = 10;
const PAYOUT_MULTIPLIER = 8;

export const guessNumberHandler: GameHandler<GuessNumberInput> = {
  type: "guessnumber",
  isStateful: false,

  validateInput(raw: unknown): GuessNumberInput {
    if (!raw || typeof raw !== "object") {
      throw new InvalidGameInputError("Guess number input must be an object");
    }
    const obj = raw as Record<string, unknown>;
    const guess = typeof obj.guess === "number" ? obj.guess : NaN;
    if (!Number.isInteger(guess) || guess < MIN || guess > MAX) {
      throw new InvalidGameInputError(`Guess must be an integer ${MIN}-${MAX}`);
    }
    return { guess };
  },

  async start(ctx, input, bet, sessionId) {
    const secret = Math.floor(Math.random() * MAX) + MIN; // 1..MAX inclusive
    const won = secret === input.guess;
    const payout = won ? bet * PAYOUT_MULTIPLIER : 0;
    const net = payout - bet;

    const { newBalance } = await gameInternals.applyLedger(ctx.client, {
      userId: ctx.userId,
      amount: net,
      type: NUGGIES_TX_TYPE.game_guessnumber,
      reason: formatNuggiesReason({
        type: NUGGIES_TX_TYPE.game_guessnumber,
        amount: net,
        metadata: { guess: input.guess, secret, bet, payout, won },
      }),
      referenceId: `game:${sessionId}`,
    });

    await gameInternals.deleteActiveGame(ctx.client, sessionId);

    void checkGameAchievementsByUserId(ctx.userId, { game: "guessnumber", net, bet });

    const state: GameState = {
      sessionId,
      gameType: "guessnumber",
      bet,
      status: "resolved",
      data: {},
      result: { type: "guessnumber", guess: input.guess, secret, won },
      payout,
      newBalance,
      expiresAt: new Date().toISOString()
    };
    return state;
  }
};
