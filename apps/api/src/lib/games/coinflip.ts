import {
  formatNuggiesReason,
  NUGGIES_TX_TYPE,
  type NuggiesTxMetadata,
} from "@island/shared";
import {
  InvalidGameInputError,
  type GameHandler,
  type GameState,
  gameInternals
} from "../nuggiesGames.js";
import { checkGameAchievementsByUserId } from "../nuggiesAchievements.js";

type CoinflipInput = { call: "heads" | "tails" };

export const coinflipHandler: GameHandler<CoinflipInput> = {
  type: "coinflip",
  isStateful: false,

  validateInput(raw: unknown): CoinflipInput {
    if (!raw || typeof raw !== "object") {
      throw new InvalidGameInputError("Coinflip input must be an object");
    }
    const obj = raw as Record<string, unknown>;
    if (obj.call !== "heads" && obj.call !== "tails") {
      throw new InvalidGameInputError("Coinflip 'call' must be 'heads' or 'tails'");
    }
    return { call: obj.call };
  },

  async start(ctx, input, bet, sessionId) {
    // RNG happens here — server is the only source of randomness.
    const outcome: "heads" | "tails" = Math.random() < 0.5 ? "heads" : "tails";
    const won = outcome === input.call;
    const payout = won ? Math.floor(bet * 1.9) : 0;
    const net = payout - bet;

    const { newBalance } = await gameInternals.applyLedger(ctx.client, {
      userId: ctx.userId,
      amount: net,
      type: NUGGIES_TX_TYPE.game_coinflip,
      reason: formatNuggiesReason({
        type: NUGGIES_TX_TYPE.game_coinflip,
        amount: net,
        metadata: { call: input.call, outcome, bet, payout, won },
      }),
      referenceId: `game:${sessionId}`,
    });

    // Stateless game: clear the active-game slot inside the same txn.
    await gameInternals.deleteActiveGame(ctx.client, sessionId);

    // Phase 4 achievements (HIGH ROLLER / LUCKY STREAK / WHALE / etc.)
    void checkGameAchievementsByUserId(ctx.userId, { game: "coinflip", net, bet });

    const state: GameState = {
      sessionId,
      gameType: "coinflip",
      bet,
      status: "resolved",
      data: {},
      result: { type: "coinflip", call: input.call, outcome, won },
      payout,
      newBalance,
      expiresAt: new Date().toISOString()
    };
    return state;
  }
};
