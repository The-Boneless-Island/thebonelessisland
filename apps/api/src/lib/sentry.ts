import * as Sentry from "@sentry/node";

const SECRET_KEY_PATTERN = /(_TOKEN|_SECRET|_KEY|_PASSWORD)$/i;

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  const scrub = (text: string): string => {
    let out = text;
    for (const [key, value] of Object.entries(process.env)) {
      if (!value || value.length < 12 || !SECRET_KEY_PATTERN.test(key)) continue;
      if (out.includes(value)) out = out.split(value).join("[REDACTED]");
    }
    return out;
  };

  if (event.message) event.message = scrub(String(event.message));
  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value) ex.value = scrub(ex.value);
    }
  }
  return event;
}

export function initSentry(service: "api" | "bot"): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: service === "api" ? 0.05 : 0.1,
    // Never attach request headers, cookies, body, or client IP to events. This
    // is Sentry's default, but pin it explicitly so a future SDK default flip
    // can't start shipping session cookies / PII to the error backend.
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    ignoreTransactions: ["/vitals", "/client-errors", "/health"],
  });
}

export { Sentry };
