import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { env } from "../config.js";
import { log } from "../lib/structuredLog.js";

// Resolve relative to this module, not process.cwd() — the API can be
// launched from the repo root, apps/api, or inside the container, and the
// migrations must be found in all three.
const migrationDir = resolve(dirname(fileURLToPath(import.meta.url)), "migrations");

// Advisory lock key for the migration run. Fixed, arbitrary, namespaced
// alongside the existing news-pipeline lock (737001) so both live in the
// same small "this box, this app" range instead of colliding with a
// randomly-chosen id from some future feature.
const MIGRATION_LOCK_ID = 737_002;

function sha256Hex(contents: string): string {
  return createHash("sha256").update(contents, "utf8").digest("hex");
}

export async function runMigrations(): Promise<{ applied: number; skipped: number }> {
  // This runs on every boot, before the api serves a single request, so it
  // needs a connection whose session state (SET ..., the advisory lock)
  // survives for the whole run — and one with NO timeouts. A client checked
  // out of the shared pool would still carry the pool's `query_timeout`
  // (node-side: pg rejects the query promise after 35s even though the
  // server keeps executing) — `SET statement_timeout = 0` can't undo that,
  // so a long backfill/index build would "fail" at 35s and crash-loop the
  // boot while Postgres happily finishes the work. A standalone Client has
  // neither the pool's statement_timeout nor its query_timeout.
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  let locked = false;
  try {
    // Migrations can legitimately run long (backfills over large tables).
    // statement_timeout=0 is the server-side belt to the standalone-client
    // suspenders above — explicit in case a DB-level default ever appears.
    // lock_timeout stays short: if the run can't acquire a row/table lock
    // promptly (e.g. a stuck transaction left open by a previous crashed
    // boot), fail fast and loud instead of hanging the boot indefinitely.
    await client.query("SET statement_timeout = 0");
    await client.query("SET lock_timeout = '10s'");

    // Session-scoped advisory lock: blocks (rather than fails) if another
    // process is mid-migration-run, so two api replicas booting at once
    // serialize instead of racing on the same schema changes. Held for the
    // duration of the run on this dedicated client and released in finally
    // — pg_advisory_lock is tied to the session that took it, so it must
    // not be released from (or re-acquired on) a different pooled client.
    await client.query("SELECT pg_advisory_lock($1::bigint)", [MIGRATION_LOCK_ID]);
    locked = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // sha256 of each migration file's bytes at apply time, so a file edited
    // after it already shipped (should never happen — migrations are
    // append-only — but has happened via a bad rebase/cherry-pick) is
    // detectable. Warn-only by design (see the mismatch check below): a
    // false positive here must never block boot on a schema that's
    // otherwise fine.
    await client.query(`ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT`);

    const { rows: appliedRows } = await client.query<{ filename: string; checksum: string | null }>(
      "SELECT filename, checksum FROM schema_migrations"
    );
    const appliedChecksums = new Map(appliedRows.map((r) => [r.filename, r.checksum]));

    const files = (await readdir(migrationDir))
      .filter((name) => name.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    // First run: schema_migrations empty but DB may already be set up.
    // Detect by checking for a table from migration 017 (general_news).
    if (appliedChecksums.size === 0) {
      const { rows } = await client.query<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'general_news'
        ) AS exists
      `);
      if (rows[0]?.exists) {
        const seed = files.filter((f) => f < "018");
        for (const file of seed) {
          const sql = await readFile(resolve(migrationDir, file), "utf8");
          await client.query(
            "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [file, sha256Hex(sql)]
          );
          appliedChecksums.set(file, sha256Hex(sql));
        }
        console.log(`[migrations] Seeded tracker with ${seed.length} pre-018 migrations.`);
      }
    }

    let count = 0;
    let skipped = 0;
    for (const file of files) {
      const path = resolve(migrationDir, file);

      if (appliedChecksums.has(file)) {
        skipped++;
        const storedChecksum = appliedChecksums.get(file);
        const sql = await readFile(path, "utf8");
        const currentChecksum = sha256Hex(sql);
        if (storedChecksum === null) {
          // Applied before the checksum column existed — backfill on sight
          // rather than leaving it NULL forever.
          await client.query("UPDATE schema_migrations SET checksum = $1 WHERE filename = $2", [
            currentChecksum,
            file,
          ]);
        } else if (storedChecksum !== currentChecksum) {
          // Warn-only (see PR2 plan / BACKLOG "checksum enforcement deferred"):
          // an applied migration's on-disk bytes no longer match what was
          // actually run. That schema is already live — refusing to boot
          // over it would take down a fine api for a cosmetic drift (e.g. a
          // comment edited after the fact). Surface it loudly instead so a
          // human investigates.
          log.warn("migrations", "checksum mismatch for already-applied migration", {
            file,
            storedChecksum,
            currentChecksum,
          });
        }
        continue;
      }

      const sql = await readFile(path, "utf8");
      const checksum = sha256Hex(sql);

      // Each migration applies in its own transaction: the file's SQL, then
      // the tracker insert, commit together or roll back together. Without
      // this, a migration that fails partway through (e.g. statement 3 of 5)
      // could leave real schema changes applied but untracked — the next
      // boot would try to re-run the same file against a schema that's
      // already half-migrated. DO $$ ... $$ blocks (used throughout this
      // migration set for conditional DDL) run fine inside this wrapper —
      // they execute within the current transaction, they don't open their
      // own. Verified: no migration file contains an explicit top-level
      // BEGIN/COMMIT/VACUUM/CREATE INDEX CONCURRENTLY, all of which are
      // illegal or a no-op inside a wrapping transaction.
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [file, checksum]
        );
        await client.query("COMMIT");
      } catch (err) {
        // Swallow a rollback failure (e.g. the connection itself died) so it
        // can't mask the original migration error.
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }

      console.log(`[migrations] apply ${file}`);
      count++;
    }

    return { applied: count, skipped };
  } finally {
    if (locked) {
      // pg_advisory_unlock, like the lock itself, is scoped to this
      // session — it must run on this same client. (client.end() below would
      // also release it implicitly; explicit is cheaper than relying on that.)
      await client.query("SELECT pg_advisory_unlock($1::bigint)", [MIGRATION_LOCK_ID]).catch((err) => {
        console.error("[migrations] failed to release advisory lock:", err);
      });
    }
    await client.end().catch(() => {});
  }
}

// CLI entry: `tsx src/db/runMigrations.ts`
const isMain = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") ?? "");

if (isMain) {
  // runMigrations owns (and closes) its standalone client, so there's no
  // pool to drain here — the process can exit as soon as it returns.
  runMigrations()
    .then(({ applied, skipped }) => {
      console.log(applied === 0 ? "Nothing new to apply." : `\nApplied ${applied} migration(s).`);
      console.log(`(skipped ${skipped})`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
