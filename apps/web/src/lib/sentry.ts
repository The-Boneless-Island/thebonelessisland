import * as Sentry from "@sentry/react";

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.05,
    integrations: [Sentry.browserTracingIntegration()],
  });
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!import.meta.env.VITE_SENTRY_DSN?.trim()) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export { Sentry };
