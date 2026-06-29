# CLAUDE.md

The Boneless Island — community web hub + Discord integration for a ~6-year-old
gaming Discord server. **Not a commercial product**: a long-lived, maintainable
hobby project for adult gamers. Keep it playful, mature, non-corporate.

## Where the real context lives (read before building)

This file is a pointer hub. The canonical docs (kept current, code-verified):

- **`.cursor/context.md`** — project goals, identity, feature map, constraints.
- **`BACKLOG.md`** — remaining work only; every item re-verified against code.
  This is the source of truth for "what's left," not scattered plan docs.
- **`DESIGN_NOTES.md`** — durable rationale for decisions already shipped.
- **`STYLE_GUIDE.md`** — UI/code conventions. **`GLOSSARY.md`** — domain terms.
- **`DEPLOY.md`** — hosting + deploy pipeline. **`docs/OBSERVABILITY.md`**.

Plan docs for a feature are **deleted once it ships** (precedent: ROADMAP retired
2026-06-17 → salvaged into BACKLOG + DESIGN_NOTES). Do not leave shipped plans in
the tree — they read as unbuilt work and mislead the next build.

## Hard invariants (do not break without explicit confirmation)

- **Auth:** Discord OAuth is the *only* login. Steam is an opt-in enhancement —
  every feature must work for a Discord-only user.
- **Steam privacy:** crew-facing queries read the `shareable_*` SQL views, never
  the raw tables. The views are the single enforcement point.
- **No game-night voting.** It was deliberately removed; do not re-introduce it
  (or adjacent voting UI) without explicit OK.
- **Friends Online card** stays top-right on the homepage.
- **News:** AI curation *is* the feature. Classification (e.g. `isGuide`) stays
  AI-authoritative, not regex.
- **Brand split:** "Boneless Island" = org/auth/control surfaces; "Nuggie" =
  AI/bot mascot voice only.
- **README/marketing copy:** no em dashes, no maker "we", no member counts.

## Stack

React 19 + Vite SPA (`apps/web`), Express 5 + pg + zod API (`apps/api`), Discord
bot (`apps/bot`). Postgres. npm workspaces (`apps/*`, `packages/*`). Hosted on a
single AWS Graviton (arm64) box via docker-compose, behind Cloudflare.

## Commands

```bash
npm run dev          # all three apps (web + api + bot) concurrently
npm run build        # build all workspaces
npm run lint         # lint all workspaces
npm run format       # prettier --write .
npm run db:up        # start local Postgres (infra/docker-compose.yml)
npm run db:migrate   # apply API migrations
```

## Workflow

- **`main` is branch-protected** (PR + green lint/build/scan required; merge auto-
  deploys via GHCR + SSM). Never push to main directly.
- **Work in a worktree** under `.claude/worktrees/*`, run `npm ci`, open a PR.
  The primary checkout's local `main` is often stale — branch off `upstream/main`.
- **Migrations** are sequential numbered SQL in `apps/api/src/db/migrations/`.
  Take the next free number; never reuse one. Applied-state is tracked in the DB.

## CI security scanning (already in place)

The `lint-build-scan` CI gate (`.github/workflows/ci.yml`) builds all three app
images and runs a **Trivy** image scan on each. It **fails the PR** on any
`HIGH`/`CRITICAL` CVE that has a fix available (`ignore-unfixed: true`, so
unpatchable base-image noise doesn't block). So image vulnerability scanning is
**done** — don't re-add it.

Accepted-risk exceptions live in **`.trivyignore`** (repo root). Each entry must
carry a reason *and* a revisit condition; only genuinely-unfixable findings get
waived. Re-check it on every dependency-update sweep and remove entries once the
upstream fix ships.
