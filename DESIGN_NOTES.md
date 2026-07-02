# Design Notes

Durable design rationale — the *why* behind decisions that aren't obvious from the
code alone. Consolidated 2026-06-17 from retired plan docs (STEAM_PRIVACY_PLAN,
CONTENT_ENRICHMENT_PLAN, GAME_NIGHT_PLANNER_PLAN, UX_IMPROVEMENT_PLAN, UI_REVIEW,
ROADMAP) after their work shipped. Status/checklist noise was dropped; only the
load-bearing reasoning was kept.

For *current* architecture see [`.cursor/context.md`]; for visual tokens see
[`STYLE_GUIDE.md`]; for remaining work see [`BACKLOG.md`].

---

## Product intent

- **Core flow.** The site answers "what can we play tonight?", then lets the crew
  brag about play history and poke the Nuggies economy/forums afterward. It is a
  tight crew-specific session planner with emergent social mechanics — not a general
  gaming platform.
- **Art as the visual language.** Steam serves hero/capsule/logo art for free from
  an appId (`steamArt.tsx`). Delegating polish to that art beats hand-rolling UI;
  text-forward surfaces are a missed opportunity. Every new `<img>` carries a
  fallback chain (tall capsule → hero → placeholder) because older games lack some
  assets.
- **Island ambience is the identity layer.** The scene shell (stars, fireflies,
  birds, bonfire, day/night dip) is the most distinctive feature and should react to
  context (golden hour ~6–9pm when the crew plays; extra fireflies / shooting stars
  on wins) without being merely decorative.
- **Design-token discipline is load-bearing.** Systemizing sizes/spaces/shadows into
  `theme.ts` makes every other improvement cheaper. Categorical palettes
  (tag/avatar/actor colors) are intentionally theme-static, but centralized to kill
  duplication.

## Architecture constraints

- **Single small box.** Cloudflare edge + one AWS Graviton (t4g) running
  docker-compose. No Redis, no multi-instance scaling — in-memory subscriber sets and
  in-memory rate-limit stores are fine *because* there is one process. Any proposal
  must fit one box + a modest AI budget.
- **Discord OAuth is the only login.** Steam is an opt-in enhancement; every feature
  must work without it.
- **Brand split.** "Boneless Island" = org/auth/control surfaces. "Nuggie" = the
  AI/bot mascot voice only. Keep them separate (two Discord apps).
- **Respond-then-enrich for crew APIs.** Crew-games / crew-wishlist must return
  current rows immediately and enrich in the background (fire-and-forget, see
  `gameNews.ts` pattern). A cold catalog otherwise stalls the bootstrap `Promise.all`.
  `apiFetch` should carry an `AbortController` timeout so a slow call never hangs UI.
- **Friends Online card stays top-right** on the homepage. Non-negotiable anchor.

## Steam privacy (the canonical-rule model)

The single most important invariant in the app. Implemented in migration `054`.

- **One rule, encoded once as SQL views.** A `(user, app)` pair is shareable when
  `users.steam_visibility <> 'private'` AND no row exists in `steam_game_exclusions`
  for that pair. This is encoded once as three views — `shareable_user_games`,
  `shareable_user_game_progress`, `shareable_user_wishlists`. A consumer that forgets
  to filter becomes the *visible exception*, not a silent leak.
- **Owner sees raw, crew sees views.** The owner's own Library / `/profile/me` /
  exclusion picker read the raw `user_*` tables. Every crew-facing consumer
  (whatCanWePlay, crew-games, crew-achievements, crew-wishlist, weekly digest, game
  news, activity feed, member profiles) reads the `shareable_*` views.
- **Defense-in-depth for events.** Emit-time: `recordEvent` skips writing any
  `steam.*` / achievement event for a non-shareable `(user, app)` via
  `isGameShareableByUserId`. Read-time: `filterHiddenSteamEvents` re-filters feeds as
  a safety net, so a missed read-time filter still can't leak.
- **Achievements & in-game status gate on the same rule** — achievements trivially
  reveal ownership, so a hidden game's achievements never appear anywhere crew-facing.
- **Shared-by-default + one-time consent.** New members default to `'members'`
  visibility (so crew features work), and the `SteamShareConsent` notice on Profile
  tells them their library is shared. Default was deliberately moved off the broken
  `'private'`; a backfill migration flipped existing rows so the code couldn't land
  before users had saved a preference (two-phase: enforcement code + data fix + launch).
- **Two-tier UI.** Collapsed the old `private/members/public` enum to
  Private / Crew-shared; migration `054` normalizes legacy `'public'` → `'members'`.

## Game nights — host-driven picker

- **Voting was removed entirely, on purpose.** The vote + finalize system was
  replaced by a single `PATCH /game-nights/:id/game` for the host to set/clear the
  game. This kills "who picks when" ambiguity. There are no `/:id/votes` or
  `/:id/finalize` endpoints. **Do not re-introduce game-night voting** without
  explicit confirmation. (A generic *forum* poll is a different thing — see Forums V2.)
- **Host-only authority.** Only the night's creator (or a parent-role admin) can set
  the game; enforced server-side in the PATCH endpoint and client-side via a
  `canManageGame` guard.
- **Search scope = crew-owned games only.** Guarantees ownership signals and that art
  / metadata exist. Full-Steam search is a deferred enhancement.
- **No migration needed** — `selected_app_id` / `selected_at` have existed on
  `game_nights` since migration `004`.
- **Genre tinting is client-side** (`gameAccent(tags)`); a stored `dominant_color` is
  a future enhancement, not a blocker.
- **The 5-tab ModeBar was deleted** as dead UI — its filters had no effect on the
  pick in the old voting model.

## Content enrichment (Steam data pipeline)

- **Zero-call Steam art.** Steam serves multiple derivable formats (tall capsule
  600×900, hero, logo, wide capsule) from the appId with no API call and no storage.
  Hotlink them like the existing headers, with the mandatory fallback chain above.
- **Migration numbering discipline.** Number migrations at *merge* time, never in
  parallel branches (learned from a 2026-06 collision). Coordinate the next free
  number at implementation time.
- **Reuse existing rate-limit / cache patterns.** New Steam calls
  (`GetPlayerSummaries` batches 100 ids/call, `GetSchemaForGame`,
  `GetGameAchievementStats`) ride the existing cron/cooldown patterns (≈30-min member
  syncs, daily slow paths). Batch wherever possible; cache static data (achievement
  schema) with a long TTL. No new infrastructure.

## News feed ranking & curation

- **Hero = the freshest big story, and it must rotate.** The Gaming News feed
  orders by a recency-decayed signal score and the SPA takes `feed[0]` as the
  hero. Signal = AI relevance + coverage + net votes, where **coverage** (how
  many feed-eligible articles cluster into one story) is the "lots of outlets =
  big story" heuristic — the story almost every member will click. That score is
  multiplied by `0.5^(ageHours / news_feed_decay_half_life_hours)` (default 8h),
  so weight halves every ~8h and the hero turns over ~3×/day instead of camping
  on one high-score card. A developing story that keeps gaining coverage/votes
  resists the decay; a quiet one falls off. The `ai_relevance_score >= 0.85`
  freshness-window exemption is bounded (2× the window) so nothing pins forever.
  Half-life is a tunable setting, not a constant, because the right rotation
  cadence is editorial. (PR #75, migration 084, `newsFeed.ts`.)
- **Summaries: completeness over word count — but the schema hint must agree.**
  The curator prompt tells the model to include every unique fact up to a
  1350-word hard cap. A stale JSON-schema example ("~300–500 words") silently
  overrode that (models obey the concrete schema over prose) and truncated
  summaries, dropping key points. Lesson: when a prompt carries both a prose
  directive and a schema example, they must state the same length or the schema
  wins. Target is now 500–1000 words; forward-only. (PR #75.)
- **The soft spend cap is a foot-gun when it's silent.** `ai_monthly_budget_usd`
  pauses only the LLM curator once month-to-date `ai_cost_ledger` spend ≥ cap,
  but health still reads "healthy" (existing live cards mask the stall) and no
  alert fires — so a tripped cap silently froze the feed for ~24h at the
  2026-06-30 month-end. Disabled on prod (set to 0); the Cloudflare gateway
  Spend Limit is the real backstop. If the app-layer cap is ever re-enabled,
  first make a budget-pause surface as a distinct health status, not "healthy".

## Content Security Policy (report-only → enforcing)

- **Ships `Content-Security-Policy-Report-Only` first, in `infra/Caddyfile`**
  (apex block); violations POST to `/csp-reports` (logged, not stored). It does
  nothing security-wise until enforcing, so finishing it is hardening, not a
  fire — but don't flip it without validating the two hard parts below.
- **The inline scripts are Cloudflare's, not ours.** `apps/web/index.html` ships
  zero inline scripts. The only ones are Cloudflare's JS Detections (Bot Fight
  Mode, undisable-able on the free plan). The CSP carries a per-request nonce so
  CF stamps its injected scripts — but CF often applies the nonce only under an
  *enforcing* CSP, so the report-only soak can never show scripts clean. Real
  validation is a careful **canary flip** in a quiet window. Rocket Loader must
  stay OFF (its scripts inject too late to be nonced).
- **`img-src` is the `https:` scheme source on purpose.** News cards hotlink
  cover art and source favicons from arbitrary outlet CDNs — an unbounded host
  set that can't be allowlisted. Images can't execute, so scheme-level `https:`
  is the accepted relaxation while every other directive stays strict. (PR #76.)

## Admin panel information architecture

The admin reorg that shipped to `apps/web/src/pages/admin/`. The reasoning:

- **Persistent sidebar over hub drill-down.** Group by task area
  (PEOPLE / GAMES / NEWS / ECONOMY / NUGGIE AI / DISCORD / SYSTEM); every concern
  reachable in ≤2 clicks. Each page gets its own `/admin/*` route for deep-linking and
  back-button support.
- **One control per fact (settings colocation).** No separate Operations/Settings
  split — each feature page hosts both its ops UI and its config. A setting key is
  interactive in exactly one place; any duplicate elsewhere is read-only and links to
  the canonical control. Prevents sync drift.
- **Unified save model.** Toggles/selects save instantly with a toast; text/number/key
  inputs use an explicit Save button disabled until dirty.
- **Danger zone is a place, not a sprinkle.** High-risk settings render together in a
  distinct red block and require typing a confirm phrase. `discord_guild_id` and
  `parent_role_name` are the two most dangerous settings (they break bot permissions /
  role mapping for the whole community) and get an isolated `/admin/guild` page.
- **Search indexes settings + pages + sections** (badged ⚙ / 📄 / §), mounted in the
  admin header everywhere with a `/` shortcut; results deep-link to `route#anchor`
  with a brief border flash.
- **Placeholder policy.** A disabled feature earns one muted explanatory line or is
  removed — no cargo-cult UI bloat.

## Two-mode Games page

The Games page intentionally serves two audiences: a quick "Tonight" flow
(who's in → pick vibe → AI lock, tight and no-scroll) and an "Everything" mode that
unfolds the full session composer (patches, wishlist, details, capability filters).

## Mobile

Below 640px the hover-driven mega-menu is unusable, so `MobileTabBar`
(Home / Games / Community / Nuggies / Profile) is the primary nav. Consolidate the
ad-hoc breakpoints toward a small set (≈1024 / 768 / 540).

## Forums V2 (built on an unmerged branch)

Forums V2 lives on branch `claude/confident-mendel-34a474` (not in `main`). It is
fully built and verified there but blocked on human sign-off (see `BACKLOG.md`). The
design invariants below are preserved here in case that branch is revived or the work
is lost:

- **Zero new web dependencies** beyond React. All markdown rendering, routing, UI are
  hand-rolled. The API gains only `multer` + `sharp`.
- **Markdown is a hand-rolled safe subset** emitting React elements only — never
  `dangerouslySetInnerHTML`. Bodies stored as markdown source, no HTML storage. Links
  render only for `http(s):`; images only for `https:` / same-origin.
- **Upload pipeline re-encodes every image** via `sharp` (WebP q82, max edge 2048,
  plus a 480px thumb) — one op that atomically strips EXIF/GPS, defeats MIME-spoofing,
  and produces optimal delivery. Originals discarded. Accept by magic bytes, never
  extension. EXIF removal is mandatory (privacy), not optional.
- **Link unfurl only at thread creation**, cached in `forum_link_previews`,
  fire-and-forget (never fails thread create). Hard SSRF guards: http/https only,
  DNS-resolve and reject private/reserved ranges re-checked on every redirect (max 3),
  5s timeout, 512 KB cap, `text/html` only; failures stored and not retried >1×/day.
- **Post types** (discussion/memory/recommendation/resource) are an enum column on
  `forum_threads`, not a separate table — orthogonal to categories.
- **Notifications are polled, in-app only** (Discord is the push channel); no email,
  no reaction notifications (noise). Mentions use `@discord_username` (the unique
  username, anchored to Discord identity).
- **Reactions are a fixed crew-flavored set** of five (nug 👍 / heart ❤️ / laugh 😂 /
  fire 🔥 / salute 🫡), one per user per post per type.
- **Polls are a generic forum feature, explicitly distinct from the deleted
  game-night voting** — opt-in per thread, one poll per thread, 2–10 options.
- **Discord webhook announce is opt-in per thread** and posts as Nuggie;
  fire-and-forget, never fails the request.
