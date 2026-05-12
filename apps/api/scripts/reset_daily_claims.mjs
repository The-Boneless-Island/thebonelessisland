// Wipe all daily claim transactions across all members and deduct their
// totals from nuggies_balances so the ledger stays consistent. Lifetime
// earned auto-drops via SUM recompute. Resets streak detection + the
// "already claimed today" gate, so FIRST BLOOD / STREAK 7 / STREAK 30 can
// re-fire on the next claim.

import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const balanceAdj = await client.query(
      `WITH dailies AS (
         SELECT user_id, COALESCE(SUM(amount), 0)::bigint AS total
         FROM nuggies_transactions
         WHERE type = 'daily'
         GROUP BY user_id
       )
       UPDATE nuggies_balances b
       SET balance = GREATEST(0::bigint, b.balance - d.total)
       FROM dailies d
       WHERE b.user_id = d.user_id
       RETURNING b.user_id, d.total`
    );

    const tx = await client.query(
      `DELETE FROM nuggies_transactions
       WHERE type = 'daily'
       RETURNING id`
    );

    await client.query("COMMIT");

    console.log("Daily claims reset:");
    console.log(`  nuggies_balances           rows adjusted: ${balanceAdj.rowCount}`);
    console.log(`  nuggies_transactions       rows deleted:  ${tx.rowCount} (daily)`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
} catch (err) {
  console.error("Reset failed:", err);
  process.exit(1);
} finally {
  await pool.end();
}
