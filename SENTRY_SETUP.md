# Sentry Setup

Error tracking + performance for all three apps (`web`, `api`, `bot`). One
Sentry project per app. Sentry is **opt-in**: with no DSN set, every app runs
exactly as before (`initSentry()` returns early).

## Architecture decisions

- **3 projects:** `boneless-web`, `boneless-api`, `boneless-bot`. Clean per-app
  issue streams, alerts, and release health.
- **Source maps:** only the **web** image needs them (Vite minifies). `api`/`bot`
  run their TypeScript directly via `tsx`, so stack frames already point at the
  original `.ts` files — no upload needed. Web maps are uploaded by
  `@sentry/vite-plugin` during the Docker build stage, then deleted so Caddy
  never serves `.map` files. The build-time auth token lives only in the web
  Dockerfile's build stage and is discarded with it (final Caddy image is clean).
- **Release = commit SHA.** Runtime apps read `SENTRY_RELEASE` (compose sets it
  from `IMAGE_TAG`); web bakes `VITE_SENTRY_RELEASE` at build (CI passes
  `github.sha`). Ties issues + release health to a deployable commit.
- **PII off everywhere** (`sendDefaultPii: false`) + a `beforeSend` scrubber that
  redacts any env secret value that appears in an event.

## Required config (you set these once)

### Local `.env` (dev — optional, usually leave blank)
`SENTRY_DSN_API`, `SENTRY_DSN_BOT`, `VITE_SENTRY_DSN` — set only for dev events.

### Production secret placement
- **env-file mode:** put `SENTRY_DSN_API`, `SENTRY_DSN_BOT`, and `VITE_SENTRY_DSN`
  in the box's `.env`. api and bot are separate Sentry projects, so each reads
  its own var (both fall back to a shared `SENTRY_DSN` if you'd rather run one
  project).
- **SSM mode:** add `/boneless/prod/SENTRY_DSN_API` + `/SENTRY_DSN_BOT` (the
  secrets loader must map them). `VITE_SENTRY_DSN` is build-time only, never SSM.

### GitHub Actions (web source-map upload)
- Variables: `VITE_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_WEB_PROJECT` (=`boneless-web`)
- Secret: `SENTRY_AUTH_TOKEN` (scope `project:releases`)

All optional — unset just skips the upload.

## Verify (after DSNs are set)

1. **api:** hit a route that throws, or `throw new Error("sentry-test-api")` in a
   temp route → event appears in `boneless-api` with a readable TS stack.
2. **bot:** `throw new Error("sentry-test-bot")` in `ClientReady` → `boneless-bot`.
3. **web:** temporary `throw` in a component → `boneless-web`, stack de-minified
   to original `.tsx` (proves source-map upload worked). Confirm `release` =
   commit SHA and `environment` = production.
4. Confirm process-fatal capture: an unhandled rejection now reaches Sentry
   (previously stdout only).

## Phase 5 — ops config (driven via Sentry API with the auth token)

- [ ] Issue alerts → Discord webhook (new issue, regression, high-frequency).
- [ ] Cron monitors: bot announcement poll (30s), api scheduled sweeps
      (members 60s, news 4h, digest weekly, etc.).
- [ ] Release health + deploy markers.
- [ ] Server-side data-scrubbing rules (defense in depth over `beforeSend`).
- [ ] Spike protection / rate-limit + quota alerts.
- [ ] Dashboard per app (error rate, p95 latency, top issues).

## Files touched

- `apps/{api,bot,web}/src/lib/sentry.ts` — release tag (+ web PII pin).
- `apps/{api,bot}/src/lib/structuredLog.ts` — fatal handlers now capture to Sentry.
- `apps/web/vite.config.ts` — source maps + `@sentry/vite-plugin` (token-gated).
- `apps/web/Dockerfile` — Sentry build args, map upload in build stage only.
- `infra/docker-compose.yml` — `SENTRY_RELEASE` (api/bot), web Sentry build args.
- `.github/workflows/deploy.yml` — web build args + auth secret.
- `.env.example` — Sentry section.
