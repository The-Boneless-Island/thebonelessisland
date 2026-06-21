# Observability on Boneless Island

Three channels — keep them separate:

| Channel | Storage | Purpose |
|---------|---------|---------|
| **Audit** | Postgres (`activity_events`, `nuggies_transactions`) | Who did what, when — user-facing history + admin review |
| **Operational** | Docker stdout (JSON via `structuredLog`) | Boot, cron jobs, Web Vitals, CSP reports |
| **Errors** | Sentry (optional) | Stack traces and client render failures |

## Environment variables

| Variable | App | When set |
|----------|-----|----------|
| `SENTRY_DSN` | API, bot | Enables `@sentry/node` |
| `VITE_SENTRY_DSN` | Web | Enables `@sentry/react` |

When DSN is unset, Sentry init is a no-op — safe for local dev.

## Client errors

React render errors hit `ErrorBoundary` → `POST /client-errors` (session required, same as `/vitals`). Logged via structured ops log and forwarded to Sentry when configured.

## Nuggies ledger copy

User-facing transaction text lives in `packages/shared/src/nuggiesTransactionCopy.ts`. Internal `type` codes (e.g. `game_blackjack_bet`) stay in the DB for queries; UI never shows them.

Historical rows were backfilled once at boot (`backfillNuggiesTransactionReasons`), tracked in `server_settings.nuggies_reason_backfill_v1`.

## Admin audit log (Entra-style)

Parent-only endpoint: `GET /activity/admin/audit`

| Query | Purpose |
|-------|---------|
| `scope` | `admin` (default), `economy`, `moderation`, `community`, `all` |
| `q` | Free-text search (event type, payload, mod notes) |
| `since` / `until` | ISO timestamps |
| `eventType` | Exact activity event type (admin scope) |
| `cursor` | `{createdAt}\|{id}` pagination |
| `limit` | 1–100 (default 50) |

UI: Admin → System → Audit — scope tabs, filters, expandable detail rows, CSV export, filtered Nuggies ledger.

**Recorded admin actions** (via `recordEvent` or `forum_mod_log`):

- Settings changes (`admin.settings_changed`, secrets masked)
- Drift log publish/update/archive
- Game night admin update/delete
- Nuggies grant/deduct, attendance batch, shop item create/update
- Onboarding reset-all
- Forum moderation (mod log table)

## Do not

- Send ledger rows or audit payloads to Sentry
- Use stdout for compliance-style audit (logs rotate)
- Re-introduce raw type codes in the transaction log UI
