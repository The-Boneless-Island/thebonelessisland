import { Sentry } from "./sentry.js";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

function emit(level: LogLevel, component: string, msg: string, fields?: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, component, msg, ...fields });
  if (level === "error" || level === "fatal") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (component: string, msg: string, fields?: Record<string, unknown>) => emit("debug", component, msg, fields),
  info: (component: string, msg: string, fields?: Record<string, unknown>) => emit("info", component, msg, fields),
  warn: (component: string, msg: string, fields?: Record<string, unknown>) => emit("warn", component, msg, fields),
  error: (component: string, msg: string, fields?: Record<string, unknown>) => emit("error", component, msg, fields),
  fatal: (component: string, msg: string, fields?: Record<string, unknown>) => emit("fatal", component, msg, fields),
};

// Fatal process errors: log, forward to Sentry (no-op safe when DSN unset —
// see lib/sentry.ts), flush the Sentry transport, then exit. A crashed event
// loop or corrupted client state isn't safe to keep running on — better to
// die loudly and let the container's `restart: unless-stopped` + the new
// heartbeat healthcheck bring up a clean process than log-and-continue with
// undefined behavior (mirrors the same contract landing API-side in PR2).
async function crashOut(component: string, kind: string, err: unknown): Promise<void> {
  log.fatal(component, kind, {
    err: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  try {
    Sentry.captureException(err);
    await Sentry.flush(2000);
  } catch {
    // Never let Sentry itself block process exit.
  }
  process.exit(1);
}

export function installProcessFatalHandlers(component: string): void {
  process.on("unhandledRejection", (reason) => {
    void crashOut(component, "unhandledRejection", reason);
  });
  process.on("uncaughtException", (err) => {
    void crashOut(component, "uncaughtException", err);
  });
}
