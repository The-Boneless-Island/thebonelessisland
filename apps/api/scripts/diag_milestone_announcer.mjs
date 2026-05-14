import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const settings = await pool.query(
    `SELECT key, value FROM server_settings
     WHERE key IN ('milestone_announcements_enabled','milestone_channel_id')
        OR key LIKE 'milestone_role_%'
     ORDER BY key`
  );
  console.log("Settings:");
  for (const r of settings.rows) {
    console.log(`  ${r.key} = '${r.value}'`);
  }

  const recent = await pool.query(
    `SELECT id, kind, payload->>'discordUserId' AS discord_user_id,
            payload->>'label' AS label, created_at, processed_at
     FROM bot_announcements
     ORDER BY created_at DESC
     LIMIT 10`
  );
  console.log(`\nRecent bot_announcements (${recent.rowCount}):`);
  for (const r of recent.rows) {
    console.log(`  #${r.id} ${r.kind} ${r.label ?? ""} user=${r.discord_user_id ?? "?"} created=${r.created_at?.toISOString?.() ?? r.created_at} processed=${r.processed_at?.toISOString?.() ?? r.processed_at ?? "PENDING"}`);
  }

  const recentMilestoneEvents = await pool.query(
    `SELECT id, payload->>'label' AS label, payload->>'key' AS key, created_at
     FROM activity_events
     WHERE event_type = 'milestone.reached'
     ORDER BY created_at DESC LIMIT 5`
  );
  console.log(`\nRecent milestone.reached activity events (${recentMilestoneEvents.rowCount}):`);
  for (const r of recentMilestoneEvents.rows) {
    console.log(`  #${r.id} ${r.key} ${r.label} created=${r.created_at?.toISOString?.() ?? r.created_at}`);
  }
} catch (err) {
  console.error("Diag failed:", err);
  process.exit(1);
} finally {
  await pool.end();
}
