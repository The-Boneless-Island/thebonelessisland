import { Pool } from "pg";
import { env } from "../config.js";

// Pool tuned for a single small instance. The two node-postgres defaults that
// bite in prod are fixed here: connectionTimeoutMillis=0 (a request hangs
// forever when the pool is exhausted) and no statement timeout (a runaway query
// pins a connection indefinitely). maxLifetimeSeconds recycles connections so a
// leak or server-side staleness can't accumulate.
export const db = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  maxLifetimeSeconds: 3600,
  keepAlive: true,
  statement_timeout: 30_000,
  query_timeout: 35_000,
  idle_in_transaction_session_timeout: 30_000
});

// node-postgres emits "error" on the pool whenever an *idle* client dies
// server-side (e.g. a Postgres restart, network blip) — not just on failed
// queries. Without a listener, that event is an unhandled EventEmitter
// "error", which Node treats as an uncaught exception and crashes the
// process. Log-only here: the pool automatically drops and replaces the
// broken idle client on its next checkout, so a bounce is self-healing and
// must not take the api down with it. This listener has to exist before the
// uncaughtException/unhandledRejection handlers below start calling
// process.exit(1), or a routine idle-client error during a postgres restart
// would (correctly per the new fatal-handler contract, but wrongly here)
// kill the api.
db.on("error", (err) => {
  console.error("[db] idle client error (pool self-heals, not fatal):", err);
});
