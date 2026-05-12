import { db } from "../db/client.js";
import { recordEvent } from "./activityEvents.js";

// Earned-tier achievements. Granted by event hooks; idempotent via the
// inventory PRIMARY KEY (user_id, item_id). Failures here must never break
// the surrounding ledger/game transaction — every helper is wrapped in
// best-effort try/catch and logs to console.

// Stable internal identifiers — decoupled from display labels. Renaming
// the user-facing badge name never touches these values; lookup goes
// through nuggies_shop_items.item_key, populated by migration 032.
//
// Naming policy:
//   - Earned achievements: concept-named (describe the trigger).
//   - Tier badges:         ordinal (milestone_rank_NN) — position is the
//                          immutable property, label is cosmetic.
export type EarnedKey =
  | "first_blood"
  | "pog_moment"
  | "cheese_strat"
  | "nerfed"
  | "the_grind"
  // Phase 4 — earned achievements
  | "streak_7"
  | "streak_30"
  | "high_roller"
  | "lucky_streak"
  | "house_special"
  | "bank_run"
  | "whale"
  | "gn_regular"
  | "gn_veteran"
  | "tournament_master"
  // Tier badges — auto-granted when crossing a milestone tier
  | "milestone_rank_01"
  | "milestone_rank_02"
  | "milestone_rank_03"
  | "milestone_rank_04"
  | "milestone_rank_05"
  | "milestone_rank_06"
  | "milestone_rank_07"
  | "milestone_rank_08";

type EarnedItemMeta = {
  id: bigint;
  name: string;
  itemType: string;
  emoji: string;
};

const itemMetaCache = new Map<EarnedKey, EarnedItemMeta>();

async function resolveEarnedItem(key: EarnedKey): Promise<EarnedItemMeta | null> {
  const cached = itemMetaCache.get(key);
  if (cached) return cached;
  const r = await db.query<{ id: string; name: string; item_type: string; item_data: { emoji?: string } }>(
    `SELECT id, name, item_type, item_data
     FROM nuggies_shop_items
     WHERE acquisition = 'earned' AND item_key = $1
     LIMIT 1`,
    [key]
  );
  const row = r.rows[0];
  if (!row) return null;
  const meta: EarnedItemMeta = {
    id: BigInt(row.id),
    name: row.name,
    itemType: row.item_type,
    emoji: row.item_data?.emoji ?? "✨",
  };
  itemMetaCache.set(key, meta);
  return meta;
}

async function resolveUserId(discordUserId: string): Promise<bigint | null> {
  const r = await db.query<{ id: string }>(
    "SELECT id FROM users WHERE discord_user_id = $1",
    [discordUserId]
  );
  return r.rows[0] ? BigInt(r.rows[0].id) : null;
}

async function resolveDiscordId(userId: bigint): Promise<string | null> {
  const r = await db.query<{ discord_user_id: string }>(
    "SELECT discord_user_id FROM users WHERE id = $1",
    [userId]
  );
  return r.rows[0]?.discord_user_id ?? null;
}

/**
 * Idempotently grant an earned title. Best-effort — errors are swallowed
 * and logged so this never poisons the surrounding transaction.
 * Returns true if a NEW row was inserted (i.e. first-time unlock). On a
 * fresh unlock it also emits an `achievement.unlocked` activity event so
 * the unlock surfaces in the community feed.
 */
export async function grantEarned(discordUserId: string, key: EarnedKey): Promise<boolean> {
  try {
    const [userId, itemMeta] = await Promise.all([
      resolveUserId(discordUserId),
      resolveEarnedItem(key),
    ]);
    if (!userId || !itemMeta) return false;
    const r = await db.query(
      `INSERT INTO nuggies_inventory (user_id, item_id, equipped)
       VALUES ($1, $2, FALSE)
       ON CONFLICT (user_id, item_id) DO NOTHING
       RETURNING user_id`,
      [userId, itemMeta.id]
    );
    const fresh = r.rowCount === 1;
    if (fresh) {
      void recordEvent({
        eventType: "achievement.unlocked",
        actorDiscordUserId: discordUserId,
        payload: {
          key,
          name: itemMeta.name,
          itemType: itemMeta.itemType,
          emoji: itemMeta.emoji,
        },
      });
    }
    return fresh;
  } catch (err) {
    console.error(`[achievements] grantEarned ${key} for ${discordUserId} failed`, err);
    return false;
  }
}

// ── Event-driven checks ──────────────────────────────────────────────────────

/**
 * After a successful daily claim. Fires FIRST BLOOD on the very first claim.
 * Detection: the daily transaction was just inserted; if exactly 1 daily
 * row exists for this user, this was the first.
 */
export async function checkFirstBlood(discordUserId: string): Promise<void> {
  try {
    const userId = await resolveUserId(discordUserId);
    if (!userId) return;
    const r = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM nuggies_transactions
       WHERE user_id = $1 AND type = 'daily'`,
      [userId]
    );
    const count = parseInt(r.rows[0]?.count ?? "0", 10);
    if (count === 1) {
      await grantEarned(discordUserId, "first_blood");
    }
  } catch (err) {
    console.error(`[achievements] checkFirstBlood failed for ${discordUserId}`, err);
  }
}

/**
 * After any positive-amount transaction. Fires THE GRIND when lifetime
 * positive ledger sum crosses ₦10,000.
 */
export async function checkTheGrind(discordUserId: string): Promise<void> {
  try {
    const userId = await resolveUserId(discordUserId);
    if (!userId) return;
    const r = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total
       FROM nuggies_transactions
       WHERE user_id = $1 AND amount > 0`,
      [userId]
    );
    const total = parseInt(r.rows[0]?.total ?? "0", 10);
    if (total >= 10_000) {
      await grantEarned(discordUserId, "the_grind");
    }
  } catch (err) {
    console.error(`[achievements] checkTheGrind failed for ${discordUserId}`, err);
  }
}

// ── Milestones ───────────────────────────────────────────────────────────────
// Mirror of the web/bot ladder. Single source of truth for the API layer.

export type MilestoneTier = {
  threshold: number;
  label: string;
  emblem: string;
  bonus: number;
  grantKey: EarnedKey;
  /** Settings key holding the Discord role ID for this tier. */
  roleSettingKey: string;
};

export const MILESTONE_TIERS: MilestoneTier[] = [
  { threshold:    500, label: "TUTORIAL ISLAND",  emblem: "🪵",   bonus:    50, grantKey: "milestone_rank_01", roleSettingKey: "milestone_role_rank_01" },
  { threshold:  2_000, label: "SIDEKICK",         emblem: "🐢",   bonus:   200, grantKey: "milestone_rank_02", roleSettingKey: "milestone_role_rank_02" },
  { threshold:  5_000, label: "REGULAR",          emblem: "🐚",   bonus:   500, grantKey: "milestone_rank_03", roleSettingKey: "milestone_role_rank_03" },
  { threshold: 15_000, label: "RISING STAR",      emblem: "🌊",   bonus:  1500, grantKey: "milestone_rank_04", roleSettingKey: "milestone_role_rank_04" },
  { threshold: 40_000, label: "A-LISTER",         emblem: "🏖️",   bonus:  4000, grantKey: "milestone_rank_05", roleSettingKey: "milestone_role_rank_05" },
  { threshold:100_000, label: "KING OF THE HILL", emblem: "⛈️",   bonus: 10000, grantKey: "milestone_rank_06", roleSettingKey: "milestone_role_rank_06" },
  { threshold:250_000, label: "BIG BOSS",         emblem: "🦑",   bonus: 25000, grantKey: "milestone_rank_07", roleSettingKey: "milestone_role_rank_07" },
  { threshold:750_000, label: "MR. WORLDWIDE",    emblem: "🔱",   bonus: 75000, grantKey: "milestone_rank_08", roleSettingKey: "milestone_role_rank_08" },
];

/**
 * After a positive-amount transaction, emit one `milestone.reached` activity
 * event per tier the user has now reached but wasn't previously credited for.
 * Tiers gate on **lifetime earned** (SUM of positive transactions) so that
 * spending/trading/losing Nuggies doesn't strip a rank — once earned, it sticks.
 *
 * On each FRESH tier crossing, three side-effects fire (in order):
 *   1. milestone.reached activity event (community feed)
 *   2. tier badge auto-granted via grantEarned (cosmetic inventory item)
 *   3. one-time Nuggie bonus paid via dynamic import of applyTransaction
 *      (lazy import avoids circular dep with nuggiesLedger.ts)
 *   4. bot_announcements outbox row inserted (bot polls this on a 30s loop
 *      to assign Discord roles + post in the configured channel)
 *
 * Idempotent: existing milestone.reached event row blocks re-emit, which
 * also short-circuits the bonus + badge + outbox writes for that tier.
 *
 * Recursion safety: the bonus payout re-enters applyTransaction, which
 * re-calls checkMilestones. The recursive call sees the just-emitted
 * milestone.reached row in `already` and skips — no infinite loop.
 */
export async function checkMilestones(discordUserId: string): Promise<void> {
  try {
    const userId = await resolveUserId(discordUserId);
    if (!userId) return;
    const lifetimeRow = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total
       FROM nuggies_transactions
       WHERE user_id = $1 AND amount > 0`,
      [userId]
    );
    const lifetime = parseInt(lifetimeRow.rows[0]?.total ?? "0", 10);
    const reached = MILESTONE_TIERS.filter((t) => lifetime >= t.threshold);
    if (reached.length === 0) return;
    const grantKeys = reached.map((t) => t.grantKey);
    // Idempotency keys off the stable grantKey, not the display label, so
    // future label renames don't cause re-fires. Migration 032 backfilled
    // payload->>'key' onto pre-existing milestone.reached rows.
    const existing = await db.query<{ key: string }>(
      `SELECT payload->>'key' AS key
       FROM activity_events
       WHERE event_type = 'milestone.reached'
         AND actor_user_id = $1
         AND payload->>'key' = ANY($2::text[])`,
      [userId, grantKeys]
    );
    const already = new Set(existing.rows.map((r) => r.key));

    // Lazy import to break the circular dependency with nuggiesLedger.ts
    // (ledger imports this module at the top-level for checkMilestones).
    const ledger = await import("./nuggiesLedger.js");

    for (const tier of reached) {
      if (already.has(tier.grantKey)) continue;

      // 1. Community feed event — payload includes both `key` (immutable
      // stable identifier, used for idempotency) and `label` (current
      // display string, may change on rename).
      await recordEvent({
        eventType: "milestone.reached",
        actorDiscordUserId: discordUserId,
        payload: {
          key: tier.grantKey,
          label: tier.label,
          threshold: tier.threshold,
          emoji: tier.emblem,
          bonus: tier.bonus,
        },
      });

      // 2. Auto-grant the tier badge (idempotent; emits achievement.unlocked)
      await grantEarned(discordUserId, tier.grantKey);

      // 3. One-time Nuggie bonus. Cap-exempt + opted-out-skipped via the
      // milestone_bonus type; never throws — wrapped in try/catch so a
      // bonus failure can't block the rest of the side-effects.
      try {
        await ledger.applyTransaction({
          discordUserId,
          amount: tier.bonus,
          type: "milestone_bonus",
          reason: `Reached ${tier.label}`,
          referenceId: tier.label,
          skipDailyCapCheck: true,
        });
      } catch (err) {
        console.error(`[achievements] milestone bonus payout failed for ${discordUserId} @ ${tier.label}`, err);
      }

      // 4. Outbox row for bot to pick up (Discord role + channel announce).
      await db.query(
        `INSERT INTO bot_announcements (kind, payload) VALUES ('milestone.reached', $1::jsonb)`,
        [
          JSON.stringify({
            discordUserId,
            label: tier.label,
            threshold: tier.threshold,
            emblem: tier.emblem,
            bonus: tier.bonus,
            roleSettingKey: tier.roleSettingKey,
          }),
        ]
      );
    }
  } catch (err) {
    console.error(`[achievements] checkMilestones failed for ${discordUserId}`, err);
  }
}

/**
 * After a blackjack hand resolves with a 'blackjack' (natural 21) result,
 * not preceded by a hit/double. Plain natural deal.
 */
export async function checkPogMoment(
  discordUserId: string,
  result: "win" | "lose" | "push" | "blackjack"
): Promise<void> {
  if (result !== "blackjack") return;
  await grantEarned(discordUserId, "pog_moment");
}

/**
 * Cheese strat: won blackjack with a double-down whose pre-double player
 * total was ≤8 (hard 8 or less).
 */
export async function checkCheeseStrat(
  discordUserId: string,
  opts: { result: "win" | "lose" | "push" | "blackjack"; doubled: boolean; preDoubleTotal: number }
): Promise<void> {
  if (!opts.doubled) return;
  if (opts.result !== "win" && opts.result !== "blackjack") return;
  if (opts.preDoubleTotal > 8) return;
  await grantEarned(discordUserId, "cheese_strat");
}

/**
 * Same as checkPogMoment / checkCheeseStrat but accepts internal user_id
 * (used from game engine which only carries bigint user ids). Also fans
 * out to the generic checkGameAchievements so HIGH ROLLER / LUCKY STREAK /
 * WHALE / TOURNAMENT MASTER / HOUSE SPECIAL fire from blackjack settles.
 */
export async function checkBlackjackEarnedByUserId(
  userId: bigint,
  opts: {
    result: "win" | "lose" | "push" | "blackjack";
    doubled: boolean;
    preDoubleTotal: number;
    bet: number;
    net: number;
  }
): Promise<void> {
  try {
    const discordId = await resolveDiscordId(userId);
    if (!discordId) return;
    await checkPogMoment(discordId, opts.result);
    await checkCheeseStrat(discordId, opts);
    await checkGameAchievements(discordId, { game: "blackjack", net: opts.net, bet: opts.bet });
  } catch (err) {
    console.error(`[achievements] checkBlackjackEarnedByUserId failed for ${userId}`, err);
  }
}

/** Generic by-user-id wrapper for coinflip / guessnumber settle paths. */
export async function checkGameAchievementsByUserId(
  userId: bigint,
  opts: { game: "blackjack" | "coinflip" | "guessnumber"; net: number; bet: number }
): Promise<void> {
  try {
    const discordId = await resolveDiscordId(userId);
    if (!discordId) return;
    await checkGameAchievements(discordId, opts);
  } catch (err) {
    console.error(`[achievements] checkGameAchievementsByUserId failed for ${userId}`, err);
  }
}

/**
 * Nerfed: any admin grant or deduct lands on a user.
 */
export async function checkNerfed(discordUserId: string): Promise<void> {
  await grantEarned(discordUserId, "nerfed");
}

// ── Phase 4: Streak / casino / loan / attendance achievements ────────────────

/**
 * Compute the user's current consecutive-day claim streak ending today.
 * Returns 0 if no daily claim today (streak only counts if today is in it).
 *
 * Strategy: pull DISTINCT claim dates (Halifax-local) for last 60 days;
 * walk back from today counting consecutive days.
 */
async function currentClaimStreak(userId: bigint): Promise<number> {
  const r = await db.query<{ d: string }>(
    `SELECT DISTINCT (created_at AT TIME ZONE 'America/Halifax')::date::text AS d
     FROM nuggies_transactions
     WHERE user_id = $1 AND type = 'daily'
       AND created_at > NOW() - INTERVAL '60 days'
     ORDER BY d DESC`,
    [userId]
  );
  const dates = new Set(r.rows.map((row) => row.d));
  if (dates.size === 0) return 0;

  // Today (Halifax)
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Halifax" });
  if (!dates.has(todayStr)) return 0;

  let streak = 0;
  const cursor = new Date(`${todayStr}T12:00:00Z`); // Z is fine; only date math
  while (true) {
    const cursorStr = cursor.toLocaleDateString("en-CA", { timeZone: "America/Halifax" });
    if (!dates.has(cursorStr)) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (streak > 60) break;
  }
  return streak;
}

/**
 * After a daily claim. Fires STREAK 7 / STREAK 30 when the running streak
 * hits 7 / 30 days. Idempotent via grantEarned.
 */
export async function checkClaimStreaks(discordUserId: string): Promise<void> {
  try {
    const userId = await resolveUserId(discordUserId);
    if (!userId) return;
    const streak = await currentClaimStreak(userId);
    if (streak >= 7) await grantEarned(discordUserId, "streak_7");
    if (streak >= 30) await grantEarned(discordUserId, "streak_30");
  } catch (err) {
    console.error(`[achievements] checkClaimStreaks failed for ${discordUserId}`, err);
  }
}

// Ledger transaction types that represent a game OUTCOME / payout row
// (positive = win, negative = loss). For blackjack, losses don't write a
// row at all (bet was already debited via `game_blackjack_bet`); only wins
// write `game_blackjack`. Coinflip + guessnumber write a single net row per
// hand (positive on win, negative on loss).
const GAME_OUTCOME_TYPES = ["game_blackjack", "game_coinflip", "game_guessnumber"];

/**
 * After a game settles. `net` is the Nuggie delta (positive = win, negative
 * or 0 = loss/push). Pass `bet` so cumulative-bet checks (WHALE) include
 * the just-settled hand. Fires HIGH ROLLER, LUCKY STREAK, WHALE,
 * TOURNAMENT MASTER, and on blackjack only also HOUSE SPECIAL.
 */
export async function checkGameAchievements(
  discordUserId: string,
  opts: { game: "blackjack" | "coinflip" | "guessnumber"; net: number; bet: number }
): Promise<void> {
  try {
    const userId = await resolveUserId(discordUserId);
    if (!userId) return;

    // HIGH ROLLER — single net win ≥ ₦400
    if (opts.net >= 400) {
      await grantEarned(discordUserId, "high_roller");
    }

    // WHALE — cumulative bet ≥ ₦10,000 across all games. Sum the absolute
    // value of negative game tx: explicit `_bet` rows for blackjack +
    // negative coinflip / guessnumber outcome rows.
    const betSum = await db.query<{ total: string }>(
      `SELECT COALESCE(ABS(SUM(amount)), 0)::text AS total
       FROM nuggies_transactions
       WHERE user_id = $1
         AND amount < 0
         AND (type LIKE 'game_%_bet'
              OR (type IN ('game_coinflip','game_guessnumber')))`,
      [userId]
    );
    const cumBet = parseInt(betSum.rows[0]?.total ?? "0", 10);
    if (cumBet >= 10_000) {
      await grantEarned(discordUserId, "whale");
    }

    if (opts.net > 0) {
      // TOURNAMENT MASTER — 100 lifetime game wins (positive outcome rows)
      const winCount = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM nuggies_transactions
         WHERE user_id = $1
           AND amount > 0
           AND type = ANY($2::text[])`,
        [userId, GAME_OUTCOME_TYPES]
      );
      const wins = parseInt(winCount.rows[0]?.count ?? "0", 10);
      if (wins >= 100) await grantEarned(discordUserId, "tournament_master");

      // LUCKY STREAK — last 3 game outcome rows were all wins. Caveat:
      // blackjack losses don't emit a row, so a string like W-L-W-W counts
      // as 3 in a row by this metric. Acceptable for an MVP "lucky" vibe.
      const last3 = await db.query<{ amount: string }>(
        `SELECT amount FROM nuggies_transactions
         WHERE user_id = $1 AND type = ANY($2::text[])
         ORDER BY created_at DESC
         LIMIT 3`,
        [userId, GAME_OUTCOME_TYPES]
      );
      if (
        last3.rows.length === 3 &&
        last3.rows.every((r) => parseInt(r.amount, 10) > 0)
      ) {
        await grantEarned(discordUserId, "lucky_streak");
      }

      // HOUSE SPECIAL — 10 lifetime blackjack wins
      if (opts.game === "blackjack") {
        const bjWins = await db.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
           FROM nuggies_transactions
           WHERE user_id = $1 AND type = 'game_blackjack' AND amount > 0`,
          [userId]
        );
        const wins = parseInt(bjWins.rows[0]?.count ?? "0", 10);
        if (wins >= 10) await grantEarned(discordUserId, "house_special");
      }
    }
  } catch (err) {
    console.error(`[achievements] checkGameAchievements failed for ${discordUserId}`, err);
  }
}

/**
 * After a loan_repay transaction settles. Fires BANK RUN if repaid before
 * the loan's due_at. Caller passes the loan's due_at (ISO string).
 */
export async function checkBankRun(
  discordUserId: string,
  loanDueAtIso: string
): Promise<void> {
  try {
    const dueAt = new Date(loanDueAtIso).getTime();
    if (!Number.isFinite(dueAt)) return;
    if (Date.now() < dueAt) {
      await grantEarned(discordUserId, "bank_run");
    }
  } catch (err) {
    console.error(`[achievements] checkBankRun failed for ${discordUserId}`, err);
  }
}

/**
 * After a game-night attendance is finalized. Fires GAME NIGHT REGULAR (5)
 * and GAME NIGHT VETERAN (25) tiered titles.
 */
export async function checkGameNightAttendance(discordUserId: string): Promise<void> {
  try {
    const userId = await resolveUserId(discordUserId);
    if (!userId) return;
    const r = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM nuggies_transactions
       WHERE user_id = $1 AND type = 'attendance'`,
      [userId]
    );
    const count = parseInt(r.rows[0]?.count ?? "0", 10);
    if (count >= 5) await grantEarned(discordUserId, "gn_regular");
    if (count >= 25) await grantEarned(discordUserId, "gn_veteran");
  } catch (err) {
    console.error(`[achievements] checkGameNightAttendance failed for ${discordUserId}`, err);
  }
}
