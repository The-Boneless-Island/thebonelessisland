/**
 * Operational logging (stdout) — distinct from:
 * - Audit logs: Postgres append-only tables (activity_events, nuggies_transactions)
 * - Error tracking: Sentry when SENTRY_DSN is configured
 */

import { Sentry } from "./sentry.js";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export type StructuredLogFields = Record<string, unknown>;

function emit(level: LogLevel, component: string, msg: string, fields?: StructuredLogFields): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    component,
    msg,
    ...fields,
  });
  switch (level) {
    case "debug":
      console.debug(line);
      break;
    case "info":
      console.info(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "fatal":
    case "error":
      console.error(line);
      break;
  }
}

export const log = {
  debug: (component: string, msg: string, fields?: StructuredLogFields) => emit("debug", component, msg, fields),
  info: (component: string, msg: string, fields?: StructuredLogFields) => emit("info", component, msg, fields),
  warn: (component: string, msg: string, fields?: StructuredLogFields) => emit("warn", component, msg, fields),
  error: (component: string, msg: string, fields?: StructuredLogFields) => emit("error", component, msg, fields),
  fatal: (component: string, msg: string, fields?: StructuredLogFields) => emit("fatal", component, msg, fields),
};

// An uncaught exception or unhandled rejection means the process is in an
// undefined state — continuing to serve requests risks corrupting data or
// wedging silently rather than failing visibly. Node's own default behavior
// for uncaughtException is to exit anyway; the previous version of this
// handler just logged and let the process limp on, which for
// unhandledRejection meant the crash never surfaced at all. Now both paths
// report to Sentry, flush that report over the network (bounded — a hung
// network call must not block the exit indefinitely), then exit(1) so the
// container's restart policy recovers cleanly.
//
// Prerequisite: db/client.ts must install a pool "error" listener (it does)
// before any idle-client error can reach here — without that listener, a
// routine idle-client error during a Postgres restart would surface as an
// unhandledRejection/uncaughtException and this handler would now (correctly
// per this new exit(1) behavior, but wrongly for that specific case) take
// the api down over a self-healing pool event.
async function terminateFatally(component: string, kind: string, err: unknown): Promise<never> {
  log.fatal(component, kind, {
    err: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  try {
    Sentry.captureException(err);
    await Sentry.flush(2000);
  } catch (flushErr) {
    // Sentry itself is down or misconfigured — don't let that block the exit.
    console.error("[fatal] Sentry capture/flush failed:", flushErr);
  }
  process.exit(1);
}

export function installProcessFatalHandlers(component: string): void {
  process.on("unhandledRejection", (reason) => {
    void terminateFatally(component, "unhandledRejection", reason);
  });
  process.on("uncaughtException", (err) => {
    void terminateFatally(component, "uncaughtException", err);
  });
}
