// Sentry is dynamically imported so its SDK never lands in the boot
// waterfall for the common case (no DSN configured — local dev, most
// deploys). `initSentry()` kicks off the import only when a DSN is present;
// `captureException` is safe to call at any time (before/after/without the
// import resolving) and is a true no-op when the DSN is unset — the
// ErrorBoundary calls it unconditionally and must work in both modes.
//
// Rollup still emits a `vendor-sentry` chunk (see vite.config.ts
// manualChunks — it groups by module id, not by import style) but that
// chunk is only ever fetched when initSentry() actually decides to load it.
type SentryModule = typeof import("@sentry/react");

let sentryModule: SentryModule | null = null;

function dsn(): string | undefined {
  return import.meta.env.VITE_SENTRY_DSN?.trim() || undefined;
}

export function initSentry(): void {
  const dsnValue = dsn();
  if (!dsnValue) return;

  void import("@sentry/react").then((Sentry) => {
    sentryModule = Sentry;
    Sentry.init({
      dsn: dsnValue,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.05,
      integrations: [Sentry.browserTracingIntegration()],
    });
  });
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!dsn() || !sentryModule) return;
  sentryModule.captureException(error, context ? { extra: context } : undefined);
}
