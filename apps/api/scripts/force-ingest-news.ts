import { db } from "../src/db/client.js";
import { loadSettings, getGuildId } from "../src/lib/serverSettings.js";
import { ingestNewsForApps } from "../src/lib/gameNewsIngestion.js";
import { curateUncuratedNews } from "../src/lib/newsCurator.js";

async function main() {
  await loadSettings();
  const guildId = getGuildId();
  if (!guildId) {
    console.error("[force-ingest] no guild_id configured");
    process.exit(1);
  }

  const ranked = await db.query<{ app_id: number }>(
    `
      SELECT g.app_id
      FROM games g
      INNER JOIN user_games ug ON ug.app_id = g.app_id
      INNER JOIN users u ON u.id = ug.user_id
      INNER JOIN guild_members gm
        ON gm.discord_user_id = u.discord_user_id
       AND gm.guild_id = $1
       AND gm.in_guild = TRUE
      GROUP BY g.app_id
      ORDER BY COUNT(DISTINCT u.id) DESC, g.app_id ASC
      LIMIT 50
    `,
    [guildId]
  );

  const appIds = ranked.rows.map((r) => r.app_id);
  console.log(`[force-ingest] ${appIds.length} apps in scope`);

  const start = Date.now();
  const result = await ingestNewsForApps(appIds, { maxApps: 50 });
  console.log(`[force-ingest] ingested ${result.ingestedItems} items across ${result.ingestedApps} apps in ${((Date.now() - start) / 1000).toFixed(1)}s`);

  const curated = await curateUncuratedNews(appIds);
  console.log(`[force-ingest] curated ${curated} items`);

  process.exit(0);
}

main().catch((err) => {
  console.error("[force-ingest] fatal:", err);
  process.exit(1);
});
