// One-off achievement reset. Wipes earned inventory, achievement/milestone
// activity events, milestone bonus payouts, and bot announcements queue.
// Lets the achievement + milestone triggers re-fire cleanly on next action.

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

    const inv = await client.query(
      `DELETE FROM nuggies_inventory
       WHERE item_id IN (SELECT id FROM nuggies_shop_items WHERE acquisition = 'earned')
       RETURNING user_id`
    );

    const events = await client.query(
      `DELETE FROM activity_events
       WHERE event_type IN ('achievement.unlocked', 'milestone.reached')
       RETURNING id`
    );

    const tx = await client.query(
      `DELETE FROM nuggies_transactions
       WHERE type = 'milestone_bonus'
       RETURNING id`
    );

    const announcements = await client.query(
      `DELETE FROM bot_announcements
       WHERE kind = 'milestone.reached'
       RETURNING id`
    );

    await client.query("COMMIT");

    console.log("Reset complete:");
    console.log(`  nuggies_inventory          rows deleted: ${inv.rowCount}`);
    console.log(`  activity_events            rows deleted: ${events.rowCount}`);
    console.log(`  nuggies_transactions       rows deleted: ${tx.rowCount} (milestone_bonus)`);
    console.log(`  bot_announcements          rows deleted: ${announcements.rowCount}`);
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
