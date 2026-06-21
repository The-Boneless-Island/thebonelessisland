/**
 * Operational logging (stdout) — distinct from:
 * - Audit logs: Postgres append-only tables (activity_events, nuggies_transactions)
 * - Error tracking: Sentry when SENTRY_DSN is configured
 */

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

export function installProcessFatalHandlers(component: string): void {
  process.on("unhandledRejection", (reason) => {
    log.fatal(component, "unhandledRejection", {
      err: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
  process.on("uncaughtException", (err) => {
    log.fatal(component, "uncaughtException", { err: err.message, stack: err.stack });
  });
}
