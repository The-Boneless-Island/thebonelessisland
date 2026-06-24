import { db } from "../db/client.js";
import { formatNuggiesReason, NUGGIES_TX_TYPE } from "@island/shared";
import { broadcast } from "./eventBus.js";
import { ensureSettingsLoaded, getAISetting } from "./serverSettings.js";
import {
  checkBankRun,
  checkClaimStreaks,
  checkFirstBlood,
  checkGameNightAttendance,
  checkMilestones,
  checkTheGrind,
} from "./nuggiesAchievements.js";

// ── Error Types ───────────────────────────────────────────────────────────────

export class InsufficientFundsError extends Error {
  constructor() { super("Insufficient Nuggies"); }
}

export class AlreadyClaimedError extends Error {
  constructor() { super("Daily already claimed today"); }
}

export class DailyCapError extends Error {
  constructor() { super("Daily earn cap reached"); }
}

export class OptedOutError extends Error {
  constructor() { super("User has opted out of Nuggies"); }
}

export class GameCooldownError extends Error {
  constructor(public secondsLeft: number) { super(`Game cooldown: ${secondsLeft}s remaining`); }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type Transaction = {
  id: number;
  amount: number;
  type: string;
  reason: string;
  referenceId: string | null;
  createdAt: string;
};

export type EquippedItem = {
  id: number;
  name: string;
  itemType: string;
  itemData: Record<string, unknown>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Daily-reset boundary: midnight in America/Halifax = 23:00 (11pm) ET year-round
// (Halifax is always 1h ahead of ET; both observe DST identically).
const RESET_TZ = "America/Halifax";

// Transaction types that should NOT count toward the daily earn cap. The cap
// targets system-issued payouts (daily, attendance, game wins, first_link).
// User-to-user transfers + loan/market mechanics + admin grants are exempt
// because they redistribute rather than mint Nuggies.
const CAP_EXEMPT_TYPES = new Set<string>([
  "admin_grant",
  "trade_in",
  "loan_in",
  "loan_repay",
  "loan_forfeit_in",
  "market_sell",
  "milestone_bonus",
]);

function getResetDateString(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: RESET_TZ });
}

/**
 * Whether the user already claimed their daily in the current reset window.
 * Queries the latest 'daily' transaction directly instead of scanning a
 * recent-transactions page — a busy casino day pushes the claim past any
 * LIMIT and the claim button would wrongly reappear.
 */
export async function hasClaimedDailyToday(userId: bigint): Promise<boolean> {
  const lastClaim = await db.query<{ created_at: string }>(
    `SELECT created_at FROM nuggies_transactions
     WHERE user_id = $1 AND type = 'daily'
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  if (!lastClaim.rows[0]) return false;
  const lastKey = new Date(lastClaim.rows[0].created_at)
    .toLocaleDateString("en-CA", { timeZone: RESET_TZ });
  return lastKey === getResetDateString();
}

function getSetting(key: string, fallback: number): number {
  const raw = getAISetting(key);
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

async function resolveUserId(discordUserId: string): Promise<bigint> {
  const r = await db.query<{ id: string }>(
    "SELECT id FROM users WHERE discord_user_id = $1",
    [discordUserId]
  );
  if (!r.rows[0]) throw new Error(`User not found: ${discordUserId}`);
  return BigInt(r.rows[0].id);
}

// ── Core: Apply Transaction ───────────────────────────────────────────────────

export async function applyTransaction(opts: {
  discordUserId: string;
  amount: number;
  type: string;
  reason: string;
  referenceId?: string;
  createdByDiscordUserId?: string;
  skipOptedOutCheck?: boolean;
  skipDailyCapCheck?: boolean;
}): Promise<{ newBalance: number }> {
  await ensureSettingsLoaded();

  const userId = await resolveUserId(opts.discordUserId);

  // Opted-out check
  if (!opts.skipOptedOutCheck) {
    const optedOut = await db.query<{ nuggies_opted_out: boolean }>(
      "SELECT nuggies_opted_out FROM users WHERE id = $1",
      [userId]
    );
    if (optedOut.rows[0]?.nuggies_opted_out) throw new OptedOutError();
  }

  // Resolve creator user_id
  let createdByUserId: bigint | null = null;
  if (opts.createdByDiscordUserId) {
    const cr = await db.query<{ id: string }>(
      "SELECT id FROM users WHERE discord_user_id = $1",
      [opts.createdByDiscordUserId]
    );
    createdByUserId = cr.rows[0] ? BigInt(cr.rows[0].id) : null;
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Upsert balance row
    await client.query(
      `INSERT INTO nuggies_balances (user_id, balance)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    // Lock row
    const balRow = await client.query<{ balance: string }>(
      "SELECT balance FROM nuggies_balances WHERE user_id = $1 FOR UPDATE",
      [userId]
    );
    const currentBalance = parseInt(balRow.rows[0]?.balance ?? "0", 10);

    // Daily cap check — only on system-minted earnings. Transfers + admin
    // grants are exempt (see CAP_EXEMPT_TYPES).
    if (opts.amount > 0 && !opts.skipDailyCapCheck && !CAP_EXEMPT_TYPES.has(opts.type)) {
      const cap = getSetting("nuggies_daily_cap", 600);
      const earned = await getDailyEarnedToday(userId, client);
      if (earned + opts.amount > cap) throw new DailyCapError();
    }

    // Insufficient funds check
    if (currentBalance + opts.amount < 0) throw new InsufficientFundsError();

    const newBalance = currentBalance + opts.amount;

    await client.query(
      `UPDATE nuggies_balances
       SET balance = $1,
           lifetime_earned = lifetime_earned + GREATEST($3, 0),
           updated_at = NOW()
       WHERE user_id = $2`,
      [newBalance, userId, opts.amount]
    );

    await client.query(
      `INSERT INTO nuggies_transactions
         (user_id, amount, type, reason, reference_id, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, opts.amount, opts.type, opts.reason, opts.referenceId ?? null, createdByUserId]
    );

    await client.query("COMMIT");

    // Nudge the affected member's open tabs to refetch their Nuggies balance
    // immediately (admin grant, daily claim, trade, loan, etc.) instead of
    // waiting for a manual refresh. Fire-and-forget over the SSE bus.
    broadcast("nuggies-changed", { discordUserId: opts.discordUserId, newBalance });

    // Best-effort achievement + milestone checks after the transaction
    // commits. Run outside the tx so failures here can't roll back the
    // ledger write. Both check functions are idempotent.
    if (opts.amount > 0) {
      void checkTheGrind(opts.discordUserId);
      void checkMilestones(opts.discordUserId);
    }

    return { newBalance };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Daily Claim ───────────────────────────────────────────────────────────────

export async function claimDaily(discordUserId: string): Promise<{ newBalance: number; amount: number }> {
  await ensureSettingsLoaded();

  const userId = await resolveUserId(discordUserId);

  // Check opted out
  const userRow = await db.query<{ nuggies_opted_out: boolean }>(
    "SELECT nuggies_opted_out FROM users WHERE id = $1",
    [userId]
  );
  if (userRow.rows[0]?.nuggies_opted_out) throw new OptedOutError();

  // Check if already claimed in current reset window
  if (await hasClaimedDailyToday(userId)) throw new AlreadyClaimedError();

  const amount = getSetting("nuggies_daily_amount", 75);
  const { newBalance } = await applyTransaction({
    discordUserId,
    amount,
    type: NUGGIES_TX_TYPE.daily,
    reason: formatNuggiesReason({ type: NUGGIES_TX_TYPE.daily, amount }),
    skipOptedOutCheck: true, // already checked above
    skipDailyCapCheck: true,  // daily claim is exempt from cap
  });

  // FIRST BLOOD on first-ever daily claim + STREAK 7 / STREAK 30. Best-effort.
  void checkFirstBlood(discordUserId);
  void checkClaimStreaks(discordUserId);

  return { newBalance, amount };
}

// ── Game Cooldown ─────────────────────────────────────────────────────────────

export async function checkGameCooldown(userId: bigint): Promise<void> {
  await ensureSettingsLoaded();
  const cooldownSecs = getSetting("nuggies_game_cooldown_secs", 3);

  const r = await db.query<{ created_at: string }>(
    `SELECT created_at FROM nuggies_transactions
     WHERE user_id = $1
       AND type LIKE 'game_%'
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );

  if (r.rows.length > 0) {
    const lastGame = new Date(r.rows[0].created_at).getTime();
    const elapsed = Math.floor((Date.now() - lastGame) / 1000);
    if (elapsed < cooldownSecs) {
      throw new GameCooldownError(cooldownSecs - elapsed);
    }
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getBalance(discordUserId: string): Promise<number> {
  const userId = await resolveUserId(discordUserId);
  const r = await db.query<{ balance: string }>(
    "SELECT balance FROM nuggies_balances WHERE user_id = $1",
    [userId]
  );
  return parseInt(r.rows[0]?.balance ?? "0", 10);
}

export async function getRecentTransactions(
  discordUserId: string,
  limit = 20
): Promise<Transaction[]> {
  const userId = await resolveUserId(discordUserId);
  const r = await db.query<{
    id: string; amount: string; type: string;
    reason: string; reference_id: string | null; created_at: string;
  }>(
    `SELECT id, amount, type, reason, reference_id, created_at
     FROM nuggies_transactions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return r.rows.map((row) => ({
    id: parseInt(row.id, 10),
    amount: parseInt(row.amount, 10),
    type: row.type,
    reason: row.reason,
    referenceId: row.reference_id,
    createdAt: row.created_at,
  }));
}

export async function getDailyEarnedToday(
  userId: bigint,
  client?: { query: typeof db.query }
): Promise<number> {
  const q = client ?? db;
  const todayKey = getResetDateString();
  // Convert Halifax midnight to UTC range. AST=-04:00 (winter), ADT=-03:00 (summer).
  // Widen by one hour each side to absorb DST transitions safely.
  const startUTC = new Date(`${todayKey}T00:00:00-04:00`).toISOString();
  const endUTC = new Date(`${todayKey}T23:59:59-03:00`).toISOString();

  const r = await q.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM nuggies_transactions
     WHERE user_id = $1
       AND amount > 0
       AND type NOT IN ('admin_grant', 'trade_in', 'loan_in', 'loan_repay', 'loan_forfeit_in', 'market_sell')
       AND created_at >= $2
       AND created_at <= $3`,
    [userId, startUTC, endUTC]
  );
  return parseInt(r.rows[0]?.total ?? "0", 10);
}

export async function isOptedOut(discordUserId: string): Promise<boolean> {
  const r = await db.query<{ nuggies_opted_out: boolean }>(
    "SELECT nuggies_opted_out FROM users WHERE discord_user_id = $1",
    [discordUserId]
  );
  return r.rows[0]?.nuggies_opted_out ?? false;
}

export async function getEquippedItemsByUserId(userId: bigint): Promise<EquippedItem[]> {
  const r = await db.query<{
    id: string; name: string; item_type: string; item_data: Record<string, unknown>;
  }>(
    `SELECT s.id, s.name, s.item_type, s.item_data
     FROM nuggies_inventory i
     INNER JOIN nuggies_shop_items s ON s.id = i.item_id
     WHERE i.user_id = $1 AND i.equipped = TRUE`,
    [userId]
  );
  return r.rows.map((row) => ({
    id: parseInt(row.id, 10),
    name: row.name,
    itemType: row.item_type,
    itemData: row.item_data,
  }));
}

export async function getEquippedItems(discordUserId: string): Promise<EquippedItem[]> {
  const userId = await resolveUserId(discordUserId);
  return getEquippedItemsByUserId(userId);
}

// ── Atomic Trade (with fee) ───────────────────────────────────────────────────

export async function executeTrade(opts: {
  fromDiscordUserId: string;
  toDiscordUserId: string;
  amount: number;
}): Promise<{ sent: number; received: number; fee: number }> {
  await ensureSettingsLoaded();

  const feePct = getSetting("nuggies_trade_fee_pct", 5);
  const fee = Math.max(1, Math.round(opts.amount * feePct / 100));
  const received = opts.amount - fee;

  if (received <= 0) throw new Error("Amount too small after fee");

  const fromId = await resolveUserId(opts.fromDiscordUserId);
  const toId = await resolveUserId(opts.toDiscordUserId);

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Lock both rows in consistent order (lower id first to prevent deadlock)
    const [firstId, secondId] = fromId < toId ? [fromId, toId] : [toId, fromId];
    await client.query("SELECT balance FROM nuggies_balances WHERE user_id = $1 FOR UPDATE", [firstId]);
    await client.query(
      `INSERT INTO nuggies_balances (user_id, balance) VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [toId]
    );
    await client.query("SELECT balance FROM nuggies_balances WHERE user_id = $1 FOR UPDATE", [secondId]);

    const fromBal = await client.query<{ balance: string }>(
      "SELECT balance FROM nuggies_balances WHERE user_id = $1", [fromId]
    );
    const bal = parseInt(fromBal.rows[0]?.balance ?? "0", 10);
    if (bal < opts.amount) throw new InsufficientFundsError();

    await client.query(
      "UPDATE nuggies_balances SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2",
      [opts.amount, fromId]
    );
    await client.query(
      "UPDATE nuggies_balances SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2",
      [received, toId]
    );

    const refId = `trade:${opts.toDiscordUserId}`;
    const refIdIn = `trade:${opts.fromDiscordUserId}`;

    const nameRows = await client.query<{ discord_user_id: string; name: string }>(
      `SELECT u.discord_user_id,
              COALESCE(gm.display_name, dp.username, u.discord_user_id) AS name
       FROM users u
       LEFT JOIN guild_members gm ON gm.discord_user_id = u.discord_user_id
       LEFT JOIN discord_profiles dp ON dp.user_id = u.id
       WHERE u.discord_user_id = ANY($1::text[])`,
      [[opts.fromDiscordUserId, opts.toDiscordUserId]]
    );
    const nameByDiscord = new Map(nameRows.rows.map((r) => [r.discord_user_id, r.name]));
    const toName = nameByDiscord.get(opts.toDiscordUserId) ?? "a crewmate";
    const fromName = nameByDiscord.get(opts.fromDiscordUserId) ?? "a crewmate";

    const tradeOutReason = formatNuggiesReason({
      type: NUGGIES_TX_TYPE.trade_out,
      amount: -opts.amount,
      metadata: { counterpartyName: toName, feePct },
    });
    const tradeInReason = formatNuggiesReason({
      type: NUGGIES_TX_TYPE.trade_in,
      amount: received,
      metadata: { counterpartyName: fromName },
    });

    await client.query(
      `INSERT INTO nuggies_transactions (user_id, amount, type, reason, reference_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [fromId, -opts.amount, NUGGIES_TX_TYPE.trade_out, tradeOutReason, refId]
    );
    await client.query(
      `INSERT INTO nuggies_transactions (user_id, amount, type, reason, reference_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [toId, received, NUGGIES_TX_TYPE.trade_in, tradeInReason, refIdIn]
    );

    await client.query("COMMIT");
    return { sent: opts.amount, received, fee };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Check Default Loans + Expire Stale Offers ────────────────────────────────

/** Pending loan offers older than this auto-cancel. */
const PENDING_OFFER_TTL_HOURS = 24;

export async function processDefaultedLoans(): Promise<void> {
  // Auto-cancel pending offers nobody accepted within the TTL window. No
  // collateral to seize since accept never ran.
  await db.query(
    `UPDATE nuggies_loans
     SET status = 'cancelled', resolved_at = NOW()
     WHERE status = 'pending'
       AND created_at < NOW() - ($1 || ' hours')::INTERVAL`,
    [String(PENDING_OFFER_TTL_HOURS)]
  );

  const defaulted = await db.query<{
    id: string; lender_user_id: string; borrower_user_id: string; collateral: string;
  }>(
    `SELECT id, lender_user_id, borrower_user_id, collateral
     FROM nuggies_loans
     WHERE status = 'active' AND due_at < NOW()`
  );

  for (const loan of defaulted.rows) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE nuggies_loans SET status = 'defaulted', resolved_at = NOW() WHERE id = $1",
        [loan.id]
      );
      const collateral = parseInt(loan.collateral, 10);
      if (collateral > 0) {
        // Collateral goes to lender
        await client.query(
          "UPDATE nuggies_balances SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2",
          [collateral, loan.lender_user_id]
        );
        await client.query(
          `INSERT INTO nuggies_transactions (user_id, amount, type, reason, reference_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            loan.lender_user_id,
            collateral,
            NUGGIES_TX_TYPE.loan_forfeit_in,
            formatNuggiesReason({ type: NUGGIES_TX_TYPE.loan_forfeit_in, amount: collateral }),
            `loan:${loan.id}`,
          ]
        );
        await client.query(
          `INSERT INTO nuggies_transactions (user_id, amount, type, reason, reference_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            loan.borrower_user_id,
            -collateral,
            NUGGIES_TX_TYPE.loan_forfeit_out,
            formatNuggiesReason({ type: NUGGIES_TX_TYPE.loan_forfeit_out, amount: -collateral }),
            `loan:${loan.id}`,
          ]
        );
      }
      await client.query("COMMIT");
    } catch {
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }
}
