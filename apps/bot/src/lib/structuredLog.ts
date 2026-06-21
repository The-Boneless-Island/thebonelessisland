export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

function emit(level: LogLevel, component: string, msg: string, fields?: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, component, msg, ...fields });
  if (level === "error" || level === "fatal") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  error: (component: string, msg: string, fields?: Record<string, unknown>) => emit("error", component, msg, fields),
  fatal: (component: string, msg: string, fields?: Record<string, unknown>) => emit("fatal", component, msg, fields),
};

export function installProcessFatalHandlers(component: string): void {
  process.on("unhandledRejection", (reason) => {
    log.fatal(component, "unhandledRejection", {
      err: reason instanceof Error ? reason.message : String(reason),
    });
  });
  process.on("uncaughtException", (err) => {
    log.fatal(component, "uncaughtException", { err: err.message, stack: err.stack });
  });
}
