import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./client.js";

// Resolve relative to this module, not process.cwd() — the API can be
// launched from the repo root, apps/api, or inside the container, and the
// migrations must be found in all three.
const migrationDir = resolve(dirname(fileURLToPath(import.meta.url)), "migrations");

export async function runMigrations(): Promise<{ applied: number; skipped: number }> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const { rows: applied } = await db.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations"
  );
  const appliedSet = new Set(applied.map((r) => r.filename));

  const files = (await readdir(migrationDir))
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  // First run: schema_migrations empty but DB may already be set up.
  // Detect by checking for a table from migration 017 (general_news).
  if (appliedSet.size === 0) {
    const { rows } = await db.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'general_news'
      ) AS exists
    `);
    if (rows[0]?.exists) {
      const seed = files.filter((f) => f < "018");
      for (const file of seed) {
        await db.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
          [file]
        );
        appliedSet.add(file);
      }
      console.log(`[migrations] Seeded tracker with ${seed.length} pre-018 migrations.`);
    }
  }

  let count = 0;
  let skipped = 0;
  for (const file of files) {
    if (appliedSet.has(file)) {
      skipped++;
      continue;
    }
    const sql = await readFile(resolve(migrationDir, file), "utf8");
    await db.query(sql);
    // Idempotent: under tsx-watch a stale `appliedSet` snapshot taken before a
    // concurrent restart applied a row can race with this insert. Don't crash
    // the whole boot for a duplicate tracker entry — the SQL above is also
    // expected to be safe to re-run (CREATE … IF NOT EXISTS / DO $$ guards).
    await db.query(
      "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
      [file]
    );
    console.log(`[migrations] apply ${file}`);
    count++;
  }

  return { applied: count, skipped };
}

// CLI entry: `tsx src/db/runMigrations.ts`
const isMain = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") ?? "");

if (isMain) {
  runMigrations()
    .then(async ({ applied, skipped }) => {
      console.log(applied === 0 ? "Nothing new to apply." : `\nApplied ${applied} migration(s).`);
      console.log(`(skipped ${skipped})`);
      await db.end();
    })
    .catch(async (err) => {
      console.error(err);
      await db.end();
      process.exit(1);
    });
}
