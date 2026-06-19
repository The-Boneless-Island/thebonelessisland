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
