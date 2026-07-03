# Hardening Plan — 2026-07 audit remediation

**Status: living plan doc. Retire (delete) once every PR below has merged**, per repo
convention (salvage leftovers into `BACKLOG.md` / rationale into `DESIGN_NOTES.md`).

Origin: 2026-07-02 five-track audit (API security, infra/ops, DB, web, bot). This doc
is the build contract: each item has a spec and acceptance criteria so build agents do
not improvise. Workflow: plan authored by Fable, built by Sonnet agents, reviewed by
Fable per PR (10-80-10).

## Execution rules

- Work in the `silly-mirzakhani-e1b7ab` worktree. One branch per PR, **branched off
  `upstream/main`**, built sequentially in the order below (PR1 → PR7). Push to
  `origin` (fork), PR against `The-Boneless-Island/thebonelessisland` `main`.
- Branch names: `claude/hardening-0N-<slug>`.
- **Migration numbers are reserved here to prevent races**: `085` = PR3 (nuggies
  lifetime_earned backfill), `086` = PR5 (bot_announcements delivery tracking).
  Note: `070` is duplicated historically (two files) — never renumber applied files.
- Gate per PR: `npm run lint` + `npm run build` green locally, then CI
  (lint-build-scan) green. No test framework exists; do not introduce one (except the
  CI boot-smoke in PR7, which is a workflow job, not a framework).
- **No scope creep.** If a builder finds an adjacent problem, note it in the PR body,
  don't fix it.
- Invariants that must survive every PR: Discord-only auth works everywhere; crew
  reads go through `shareable_*` views; no voting UI; news classification stays
  AI-authoritative; Friends Online stays top-right; no em dashes / maker-"we" in any
  user-facing or README copy.
- Items marked **[verify-first]** = the builder must confirm the stated assumption in
  code before implementing; if the assumption is wrong, stop and report, don't adapt
  silently.

---

## PR1 — `claude/hardening-01-infra-critical`: stop losing data, make deploys honest

All infra: `infra/docker-compose.yml`, `infra/Caddyfile`, `apps/api/Dockerfile`,
`.github/workflows/deploy.yml`, new `scripts/ops/`, `DEPLOY.md`. Commits this plan doc too.

1. **Uploads volume.** `infra/docker-compose.yml` api service: add
   `volumes: [boneless_uploads:/app/apps/api/data/uploads]` + declare `boneless_uploads`
   in top-level volumes. `apps/api/Dockerfile`: create `data/uploads` and `chown node`
   **before** `USER node` so the named volume inherits writable ownership.
   **[verify-first]** WORKDIR is `/app/apps/api` at runtime (cwd basis of
   `forumUploads.ts:16`).
   Acceptance: compose config validates (`docker compose -f infra/docker-compose.yml config` parses); path matches `FORUM_UPLOAD_DIR` default exactly.
2. **api healthcheck + honest deploy.** compose api service healthcheck:
   `node -e "fetch('http://localhost:3000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`,
   interval 15s, timeout 5s, retries 5, start_period 90s (migrations run on boot).
   web service: add `/healthz` respond 200 in `infra/Caddyfile` (internal, before other
   handlers on :80) and healthcheck `wget -qO- http://localhost/healthz` (busybox wget
   exists in caddy image — **[verify-first]** check base image in `apps/web/Dockerfile`).
   `bot`/`web` `depends_on: api: condition: service_healthy`.
   `deploy.yml` remote script: `docker compose ... up -d --wait --wait-timeout 240`; on
   failure print `docker compose ps` + last 100 api log lines, exit non-zero.
   Acceptance: a migration that exits 1 now fails the Actions job.
3. **Memory limits.** compose: `mem_limit` api `768m`, bot `256m`, postgres `640m`,
   web `128m`; `NODE_OPTIONS=--max-old-space-size=512` (api) / `192` (bot) via
   environment. Leaves ~250m host headroom on 2GB.
4. **Backup as infrastructure.** New `scripts/ops/pg-backup.sh` (committed, POSIX):
   pg_dump via `docker exec boneless-postgres` → gzip → `aws s3 cp`, then tar the
   uploads volume (`docker run --rm -v boneless_uploads:...`) → s3, then optional
   `curl -fsS "$BACKUP_PING_URL"` (healthchecks.io) on success. Config via env file
   `/etc/boneless-backup.env` (bucket, ping URL). New `scripts/ops/install-backup-cron.sh`
   that writes `/etc/cron.d/boneless-backup` (03:15 UTC daily). `DEPLOY.md` §7 rewritten
   to reference the committed scripts + add restore-test instructions
   (`gunzip | docker exec -i ... psql` into a scratch DB) + S3 lifecycle note.
5. **Rollback doc.** `DEPLOY.md` new short section: rollback = re-run the SSM deploy
   command with `IMAGE_TAG=<previous good SHA>` (GHCR retains SHAs); one command block.
6. **deploy.yml hygiene** (same file as #2): SSM wait replaced with a poll loop on
   `aws ssm get-command-invocation` until terminal status (cap ~10 min);
   `git config --global --replace-all safe.directory ...` instead of `--add`;
   `paths-ignore: ["**.md", "docs/**", ".cursor/**"]` on the push trigger.
7. **Caddy api block:** add `encode zstd gzip` and `request_body max_size 10MB`.
8. **Uploads rescue note** in `DEPLOY.md`: before first deploy of this PR, run
   `docker cp boneless-api:/app/apps/api/data/uploads ./uploads-rescue` on the box,
   then after deploy `docker cp` back into the new volume path (exact commands).

## PR2 — `claude/hardening-02-lifecycle`: fail-closed boot, safe migrations, graceful shutdown

Files: `apps/api/src/config.ts`, `apps/api/src/server.ts`,
`apps/api/src/db/runMigrations.ts`, `apps/api/src/db/client.ts`,
`apps/api/src/lib/structuredLog.ts`.

1. **SESSION_SECRET fail-closed.** Keep the zod default (dev convenience). In
   `server.ts`, **after secrets hydration and before session middleware**: if
   `NODE_ENV === "production"` and (secret === "dev-secret" || length < 32) → log
   fatal + `process.exit(1)`. **[verify-first]** confirm SSM hydration completes
   before this point in the boot order.
   ⚠ Deploy note (goes in PR body + `DEPLOY.md` caveat): verify the prod secret is
   strong **before** merging, or the api will (correctly) refuse to boot.
2. **Migration runner rewrite** (`runMigrations.ts`): dedicated `db.connect()` client
   for the whole run; `SET statement_timeout = 0` + `SET lock_timeout = '10s'` on it;
   `SELECT pg_advisory_lock(<fixed key>)` around the run (session lock on the
   dedicated client, `pg_advisory_unlock` + release in `finally`); per file:
   `BEGIN` → file SQL → `INSERT INTO <tracker>` → `COMMIT`, rollback on error.
   Add `checksum` column to the tracker (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
   at runner start); store sha256 per file; on mismatch for an applied file, **warn
   loudly** (structured log), do not fail.
   **[verify-first]** grep all migrations for explicit `BEGIN`/`COMMIT`/`VACUUM`/
   `CREATE INDEX CONCURRENTLY` (can't run inside a tx). If any exist, run those
   specific files outside the wrapper tx (flag by content sniff) — report which.
3. **Fatal handlers exit + reach Sentry.** `apps/api/src/lib/structuredLog.ts`
   uncaughtException/unhandledRejection: `Sentry.captureException` (no-op safe when
   DSN unset) → `await Sentry.flush(2000)` → `process.exit(1)`.
   **Required pairing:** add `db.on("error", ...)` log-only listener in
   `db/client.ts` first — today idle pg client errors during a postgres bounce are
   only survived because the fatal handler swallows; with exit(1) they'd kill the api.
4. **Graceful shutdown (api).** Capture `const server = app.listen(...)`. On
   SIGTERM/SIGINT: stop intervals (collect every `setInterval` handle created in
   `server.ts` boot into an array — **discover during build**: news refresh, sweeps,
   orphan-upload, session revocation), `server.close()`, end open SSE responses
   (**discover**: the `/events` subscriber registry in server.ts or lib), session
   store `.close()` if connect-pg-simple exposes it, `await db.end()`, `process.exit(0)`;
   10s failsafe force-exit timer (`unref()`d).
   Acceptance: `docker stop` (or Ctrl-C under tsx) exits 0 promptly, no ECONNRESET spam.

## PR3 — `claude/hardening-03-economy`: nuggies race guards — **migration 085**

Files: `apps/api/src/routes/nuggies.ts`, `apps/api/src/lib/nuggiesLedger.ts` (names
approximate — locate), migration `085_nuggies_lifetime_earned_backfill.sql`.

1. **Loan accept** (`nuggies.ts:~837`): move the whole accept into one tx:
   `UPDATE nuggies_loans SET status='active', accepted_at=now() WHERE id=$1 AND
   status='pending' RETURNING *` as the **first** statement — 0 rows → rollback →
   409 "loan no longer available". Then lock both balances `FOR UPDATE` in ascending
   user-id order (copy `executeTrade`'s pattern), re-check lender balance, friendly
   400 `InsufficientFundsError` path instead of CHECK-violation 500.
2. **Market buy** (`:~1230`): same pattern — `UPDATE ... SET status='sold',
   buyer_user_id=$1, sold_at=now() WHERE id=$2 AND status='active' RETURNING *` first,
   0 rows → 409 "already sold".
3. **Shop buy** (`:~496`): **[verify-first]** inspect the owned-items table for a
   unique constraint on (user, item). If present: insert-first with
   `ON CONFLICT DO NOTHING RETURNING`, 0 rows → 409 "already owned", charge only
   after the insert returns. If absent: `SELECT ... FOR UPDATE` on the balance row
   first, then ownership check inside the tx (do **not** add a migration for this —
   085 is taken; note a follow-up instead if a constraint is genuinely needed).
4. **Defaulted-loan sweep** (`nuggiesLedger.ts:~469`): `UPDATE ... SET
   status='defaulted' WHERE id=$1 AND status='active' RETURNING id`, skip row if 0;
   remove the balance-less `loan_forfeit_out` ledger row **or** write it with
   amount 0 and copy that marks it informational (pick: remove — the `loan_out` at
   accept already records the outflow; keep ledger-sum == balance true). Replace
   `catch {}` with structured error log.
5. **lifetime_earned single source.** Decision: the denormalized column wins.
   Migration `085`: one-shot
   `UPDATE nuggies_balances b SET lifetime_earned = COALESCE((SELECT SUM(amount) FROM
   nuggies_transactions t WHERE t.user_id = b.user_id AND t.amount > 0), 0)`.
   Code: every path that credits a balance outside `applyTransaction` (trade, loan
   accept/repay/default, market sale credit) also increments `lifetime_earned` when
   the credited amount > 0; switch the three SUM-based readers (`/nuggies/me`,
   `/nuggies/user/:id`, profile) to read the column.
   Acceptance: grep shows no remaining `SUM(amount` lifetime computations in routes.

## PR4 — `claude/hardening-04-api-internals`: hardening + retention + sync efficiency

Files: `apps/api/src/routes/generalNews.ts`, `routes/steam.ts`, `routes/members.ts`,
`routes/aiChat.ts`, `routes/settings.ts`, `routes/internal.ts`,
`lib/forumLinkPreview.ts`, `lib/news/newsPipelineLock.ts`, `lib/news/newsRetention.ts`
(+ a new retention module), `lib/news/newsFeed.ts`, `server.ts` (job scheduling only).

1. **`GET /news/general`**: add `requireSession`. **[verify-first]** confirm the SPA
   never calls it pre-auth (site is login-gated; news page is behind auth). Keep
   `defaultLimiter`.
2. **Steam OpenID base from config** (`steam.ts:~220`): replace
   `apiBaseUrlFromRequest` header derivation with config: new optional env
   `API_PUBLIC_URL` (add to `.env.example` + `config.ts`), default
   `https://api.bonelessisland.com` in production, `http://localhost:<port>` in dev.
   Delete the X-Forwarded-Host path entirely.
3. **Error-message leaks**: in `aiChat.ts:171`, `settings.ts:139,161`,
   `internal.ts:213`, `generalNews.ts:547,592,620,652` replace client-facing
   `err.message` with a generic string; keep detail in the structured server log.
4. **DNS-rebinding pin** (`forumLinkPreview.ts:~145`): after
   `assertHostResolvesPublic` returns the vetted address, perform the fetch with an
   undici `Agent`/dispatcher whose `connect.lookup` returns **only** that pinned
   address (keeps TLS SNI/Host correct). Re-run whatever SSRF probe script exists
   (**discover**: search `scripts/` and `checks/` for ssrf/probe) and paste results
   in the PR body.
5. **`/health/ready`**: attach `defaultLimiter`.
6. **Retention sweeps** (new `lib/retention.ts`, scheduled nightly from `server.ts`
   alongside the news sweep): batched deletes (loop `DELETE ... LIMIT 5000` until 0):
   `activity_events` older than 180d **except** types `achievement.unlocked` and
   `milestone.*` (kept forever); `bot_announcements` with `processed_at` older than
   30d; `game_news` older than 90d. Log per-table counts.
7. **Search-vector refresh incremental** (`newsRetention.ts:52-67`): only rows
   updated/curated since the previous sweep or `search_vector IS NULL`.
8. **News pipeline lock on a dedicated client** (`newsPipelineLock.ts`):
   `db.connect()`, `pg_try_advisory_lock` on that client, hold the client for the
   duration, `pg_advisory_unlock` + `release()` in `finally`.
9. **News feed CTE bound** (`newsFeed.ts:~39`): push the freshness pre-filter
   (`published_at > NOW() - 2×freshness window` — mirroring the existing exemption
   bound) **inside** the ranked CTE and select only needed columns (drop `contents`
   from the window pass). ⚠ Ranking semantics must not change — the hero-rotation
   tuning from PR #75 is fresh; keep the formula byte-identical.
10. **Steam owned-games sync batching** (`steam.ts:~344,674`): rewrite the per-game
    double upsert into two batched `UNNEST` upserts (games meta, user_games) —
    pattern already exists in the wishlist sync (`steam.ts:110-127`) — and add
    `WHERE ... IS DISTINCT FROM EXCLUDED....` guards so unchanged rows aren't
    rewritten. Same treatment for the members sync loop (`members.ts:232-296`):
    single UNNEST upsert + demote-only-missing (`UPDATE ... SET in_guild=false WHERE
    guild_id=$1 AND in_guild AND discord_user_id <> ALL($2)`), with
    `IS DISTINCT FROM` change guards.
    Acceptance: sync of an unchanged library produces ~0 row versions (verify via
    `xmax` spot-check or just EXPLAIN/logic review in PR).

## PR5 — `claude/hardening-05-bot`: bot reliability — **migration 086**

Files: `apps/bot/src/index.ts`, `apps/bot/src/lib/structuredLog.ts`,
`apps/api/src/routes/internal.ts`, migration `086_bot_announcements_delivery.sql`,
`infra/docker-compose.yml` (bot healthcheck only).

1. **No more zombies**: `client.login(token).catch(err => { log; process.exit(1) })`;
   `client.on(Events.Invalidated, () => process.exit(1))`; add log-only listeners for
   `Events.Error`, `ShardError`, `ShardDisconnect`, `ShardResume`. Fatal handlers in
   bot `structuredLog.ts`: Sentry capture + flush + `process.exit(1)` (mirrors PR2).
2. **Heartbeat healthcheck**: bot touches `/tmp/heartbeat` every 30s (in the
   announcement poll tick); compose healthcheck:
   `test $(find /tmp/heartbeat -mmin -2 | wc -l) -ge 1` style (busybox-compatible;
   **[verify-first]** bot image base has `find`).
3. **Outbox delivery tracking**: migration `086`: `ALTER TABLE bot_announcements ADD
   COLUMN attempts int NOT NULL DEFAULT 0, ADD COLUMN last_error text`. API
   (`internal.ts`): processed-ack becomes per-row outcome `POST { id, ok, error? }`:
   ok → set `processed_at`; fail → `attempts+1`, store error, and once
   `attempts >= 5` set `processed_at` + keep `last_error` (dead-letter; visible in
   admin audit later). Poll query gains `AND attempts < 5`. Bot: report outcome per
   row instead of blanket-finally; **verify the ack response** and retry the ack once
   on failure (prevents duplicate announcements after an api blip).
   Role-grant ordering: grant the tier role **before** posting the announcement, so
   a Discord send failure retries the announcement without re-granting (role add is
   idempotent anyway).
4. **API-call robustness**: `AbortSignal.timeout(10_000)` on the three fetch helpers
   (`api()`, `internalApi()`, `pushPresence()`).
5. **Presence correctness**: `pushPresence` checks `res.ok`, deletes the dedupe key
   on non-ok; re-run the full-guild sweep hourly (slow `setInterval`), with
   concurrency capped at 5 (simple promise-pool, no new deps) — covers both the
   startup-burst and the missed-sweep findings.
6. **Casino collectors**: wrap blackjack/guessnumber `collect`/`end` bodies in
   try/catch that `btnInteraction.update({ content: friendly error, components: [] })`.
7. **Loan wizard**: add a nonce to the Confirm button customId, validate against the
   pending map, expire entries after 5 min (sweep or lazy check).
8. **Intents**: drop `GuildMessages`.

## PR6 — `claude/hardening-06-web`: member experience + legitimizing

Files: `apps/web/index.html`, `apps/web/public/*`, `apps/web/src/main.tsx`,
`src/lib/sentry.ts`, `src/api/client.ts`, `src/App.tsx`, `src/components/*`,
`src/pages/*`, `src/lib/vitals.ts`.

1. **Discord unfurl**: static tags in `index.html` — `meta description`, `og:title`
   ("The Boneless Island"), `og:description` (playful one-liner; obey copy rules: no
   em dashes, no "we", no member counts — e.g. "A private island for the crew.
   Games, nights, nuggies."), `og:image` → `/og-image.png`, `og:url`, `og:type=website`,
   `twitter:card=summary_large_image`. Generate `apps/web/public/og-image.png`
   (1200×630) with the repo-root sharp convention from the existing logo asset on a
   dark island-gradient background (remember the logo's baked-in black ring — crop
   ~126% like the CSS does, or inset it on a dark disc so the ring reads as design).
2. **robots.txt**: `public/robots.txt`, disallow all (members-only site).
3. **Session-expiry UX**: `apiFetch` intercepts 401 → dispatch `auth:expired`
   CustomEvent once; `App.tsx` listens → only if currently authenticated:
   `setIsAuthenticated(false)` + toast "Tide took your session. Sign in again."
   (tone per style guide). SSE: on `error` after an `auth:expired`, don't reconnect.
4. **API-down boot state**: `loadProfile` distinguishes network failure from 401 →
   render an "island unreachable" retry screen instead of LoginScreen.
5. **Sentry dynamic**: only `import("@sentry/react")` when `VITE_SENTRY_DSN` set;
   no-op `captureException` stub otherwise; ErrorBoundary keeps working in both modes.
   Acceptance: `vendor-sentry` chunk absent from the boot waterfall when DSN unset
   (check dist output / manualChunks config still consistent).
6. **Poll visibility guards**: early-return when `document.visibilityState !== "visible"`
   in `NotificationBell.tsx:38`, `pages/admin/news.tsx:1627`, `pages/admin/ai.tsx:63`,
   `pages/games/BlackjackGame.tsx:38` (blackjack: keep polling if a hand is active —
   money on the table — otherwise pause).
7. **react-query for raw-fetch pages**: Milestones, TideCheck, CrewAchievements,
   IslanderProfile, CommunityLeaderboard, Forums **thread-list fetch only**
   (`Forums.tsx:197`) → keyed `useQuery`, `staleTime: 60_000`, keep existing error/
   retry UI. No behavior change beyond instant back-nav.
8. **Focus management**: small shared hook (`useModalFocus` or similar in islandUi):
   initial focus, Tab trap, Escape at window level, focus restore, body-scroll lock.
   Apply to `GameDetailDrawer` + `QuickSwitcher`. `MegaMenu`: open on focus-within /
   ArrowDown, close on Escape/blur, `aria-expanded` + `aria-haspopup="menu"`.
9. **Small wins**: `fetchPriority="high"` on the GamingNews hero cover;
   `theme-color` media-paired light/dark metas; manifest `start_url`/`scope`/
   `description`; `vitals.ts` captures `location.pathname` at metric init.

## PR7 — `claude/hardening-07-ci`: supply-chain guard

Files: `.github/dependabot.yml`, `.github/workflows/dependabot-auto-merge.yml`,
`.github/workflows/ci.yml`.

1. **Narrow auto-merge**: auto-approve only `version-update:semver-patch` for runtime
   deps; devDependencies may keep minor+patch. GitHub Actions bumps: keep auto.
   Docker: digest/patch only.
2. **Boot smoke in CI**: new job after the api image build: start
   `pgvector/pgvector:pg16` as a service, run the built api image with a minimal env
   (generated secrets, `NODE_ENV=production`), poll `/health/ready` up to 60s —
   proves migrations apply + server boots on every PR including dependabot's.
3. **Trivy arch note**: comment in `ci.yml` recording the accepted risk that scans run
   on amd64 while prod is arm64 (same package versions in practice).

---

## Manual steps (owner, not automatable from here)

1. **Before PR1 deploys**: rescue current uploads from the running container
   (`docker cp` command in DEPLOY.md §8 note) — anything uploaded since the last
   deploy is otherwise lost on the next recreate.
2. **Before PR2 deploys**: confirm prod `SESSION_SECRET` is long/random (SSM or .env).
   If it's the dev default, the api will refuse to boot after PR2 — that's the point.
3. **After PR1**: create the S3 backup bucket + lifecycle (30d), run
   `scripts/ops/install-backup-cron.sh`, set `/etc/boneless-backup.env`, optionally a
   healthchecks.io check; **run one restore test**.
4. External uptime monitor (UptimeRobot/healthchecks.io) on
   `https://api.bonelessisland.com/health/ready` + a CloudWatch disk-space alarm.
5. Already tracked in BACKLOG (unchanged): flip prod `API_BASE_URL` to
   `http://api:3000`; CSP report-only → enforcing.

## Deferred (explicit non-goals, revisit later)

- Self-hosted fonts (fontsource) — LOW, adds deps.
- `srcset`/`sizes` on Steam art — CDN offers few variants.
- Multi-stage tsc builds for api/bot images — acknowledged in Dockerfile headers.
- arm64 Trivy scanning via qemu — accepted-risk comment instead (PR7).
- `nuggies_transactions` archival — unbounded by design (immutable ledger), fine.
- Migration checksum **enforcement** (PR2 ships warn-only).

## Final verification (Fable, after all PRs)

- Per PR: full diff review (correctness, invariants, style-guide voice on any copy).
- `npm run lint` + `npm run build` at each PR head.
- Cross-PR: grep-sweeps — no `err.message` to clients; no raw `user_games` reads in
  crew routes; every `setInterval` in server.ts registered for shutdown; migration
  numbering 085/086 only-once.
- BACKLOG.md updated in the **last** PR: mark shipped items, fold anything deferred,
  then delete this plan doc (or in an immediate follow-up docs PR).
