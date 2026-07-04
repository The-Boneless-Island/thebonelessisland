# Backlog

Remaining work, salvaged 2026-06-17 from retired plan docs (CONTENT_ENRICHMENT_PLAN,
GAME_NIGHT_PLANNER_PLAN, UI_REVIEW, ROADMAP) when those plans were deleted. **Every
item here was re-verified against the current code on 2026-06-17** — anything already
shipped was dropped, so this list is the genuine remainder, not stale plan text.

Legend: **unbuilt** = no implementation found · **partial** = some pieces exist, called
out per item. File:line pointers were accurate on 2026-06-17; re-verify before editing.
For the *why* behind shipped decisions see [`DESIGN_NOTES.md`].

Three more plan docs retired 2026-06-28 once their work shipped and was verified
against code: `NEWS_AI_OVERHAUL_PLAN.md`, `FORUMS_V2_PLAN.md`,
`SITE_MODERNIZATION_PLAN.md` (see "Recently shipped" below).

---

## Recently shipped

- **Polish sweep 2026-07 (round 3)** *(shipped 2026-07-04, PRs #102–#105 via integration
  train)* — four fixes off round-1/2 live testing. (1) **Plan-button render loop** (the
  severe one): the Games `?plan=` deep-link consumption effect listed unstable App.tsx
  function props as deps → re-ran every App render while the param was present; each run
  toasted + reseeded planner members (→ a recommendations POST), and react-router v7's
  transition-priority URL clear kept getting preempted, so the loop self-sustained —
  hundreds of toasts, tab lockup, and a 100-req/60s rate-limit 429 window. Fixed with a
  one-shot `consumedPlanRef` guard + `useCallback` on the App callbacks + idempotent
  member seeding + an exact-repeat guard on the composer POST; the toast queue is now
  capped at 6 with same-message+tone collapse (`system/toast.tsx`). See `DESIGN_NOTES.md`
  → "Polish sweep 2026-07". (2) **Flat emoji picker**: `EmojiPicker.tsx` rebuilt as one
  Discord-style scroll panel (search / localStorage MRU "Frequently used" / guild section
  fetched on mount / 8 unicode categories, sticky headers, no tabs); `ReactionBar.tsx`
  chips now render only reactions with count > 0 (zero reactions = no row; legacy five
  keys render but are no longer offered; `showAddButton` prop removed). (3) **News
  crew-fit gate**: second AI verdict `crewFit` parks gaming-but-crew-irrelevant stories
  (`crew_irrelevant`), judged against the injected crew context; sweep v3 retro-parks
  live leaks (`crew_irrelevant_sweep`, the otome VN card); health exposes
  `crewIrrelevant`. (4) **Home duo grid**: "Hot this week" ‖ "Activity feed" 2-col
  ≥981px (`.bi-home-duo`), trending covers 92→72px, ActivityFeed full-width when
  trending is empty; Friends Online untouched.

- **UX refinement sweep 2026-07** *(shipped 2026-07-03, PRs #98–#100 via integration
  train)* — follow-up fixes to the feature sweep below. (1) **The containing-block bug**:
  `backdrop-filter` on `<main class="bi-main">` (App.tsx) makes it a containing block for
  `position:fixed` descendants — the GameDetailDrawer was anchoring to the page column
  (pinned to page top; blank glass when scrolled down). Fixed by portalling to
  `document.body`; same fix applied to the latent LoanWizard + Games stream-drawer cases;
  see [`DESIGN_NOTES.md`] → "Overlays must portal". (2) New `PortalPopover` primitive
  (`components/PortalPopover.tsx`: anchored fixed positioning, flip/clamp, Escape/outside/
  scroll close, z 300, bottom-sheet under 560px) — SharePopover + forum EmojiPicker
  migrated onto it, fixing their clipped/behind-everything rendering. (3) Discord-style
  forum post actions: hover-revealed icon bar top-right of each post (`PostActionBar.tsx`;
  react + share + quote + edit + delete + report, permissions unchanged; reaction chips
  stay in the footer; touch devices show the bar dimmed always; reduced-motion honored).
  (4) Composer modernization (`forumEditor.tsx`, shared by composer + reply): toolbar
  hidden until focus (always visible on touch), persistent "+" attach, Ctrl/Cmd+B/I/E/K +
  Ctrl+Shift+X shortcuts, Enter list-continuation (empty item exits), paste-image →
  upload+insert, paste-URL-onto-selection → link, drag-drop onto the textarea,
  corner-anchored selection mini-toolbar (desktop), undo-safe inserts via
  `execCommand("insertText")`. (5) Bot filtering (migration 091 `guild_members.is_bot`):
  roster sync stores Discord's `user.bot`; `GET /members` excludes bots by default
  (`?includeBots=1` for the admin People page, which shows a BOT tag); member profile
  404s for bots; bot-side presence pushes skip bots; weekly-digest highlights, the
  recommender's voice/crew scopes, and Nuggie chat's "in voice" context exclude bots.
  Backfill automatic via the 60s roster sync.
- **Feature sweep 2026-07** *(shipped 2026-07-03, PRs #89–#96 via integration PR)* — eight
  parallel workstreams: (1) bug sweep — Steam achievement % (NUMERIC-as-string `::float8`
  casts), admin blade label overflow, forum OP badge now on the thread author's replies
  (`isThreadAuthor && !isOp`); (2) shared activity-feed formatter
  (`packages/shared/src/activityFeedCopy.ts`) — no surface can render a raw event kind,
  fixes "fired achievement.unlocked" on Community + islander-profile achievement names;
  (3) Nuggie achievement announcements always name the achievement (dispatcher-side
  composition + migration 090 variant copy polish; `checkNerfed` now deduction-only);
  (4) Library: poster overlay click-swallow fix, STORE link, `/games?plan=<appId>` planner
  deep link (game actually preselected now), most/least-played sorts
  (`totalPlaytimeMinutes` via crew-games SUM), richer hover flair; (5) share-to-Discord
  (migration 088 `share_targets`, `POST /share` with server-side content re-fetch,
  `member.share` outbox kind, SharePopover on news/forums/activity, admin channel picker);
  (6) forum reactions: any Unicode emoji + synced guild custom emoji (migration 089
  `guild_emojis`, `c:<snowflake>` keys, lazy EmojiPicker, 8-per-post cap); (7) per-game
  landing page `/library/:appId` + forum game filter/search (`?appId` on threads/search,
  clickable GameChip, composer `?game=` preselect); (8) UserMenu enrichment parity (banner,
  full status dot, booster/role pills, live `selfMember` source, banner-backfill wipe fix).
  Rationale in [`DESIGN_NOTES.md`] → "Feature sweep 2026-07".
- **News quality: off-topic gate + full-context summaries** *(shipped 2026-07-03)* —
  two fixes to the Gaming News curator (`generalNewsIngestion.ts`). (1) A gaming-
  relevance gate: new AI-judged `offTopic` flag drops non-gaming stories (film fan
  art, general tech/AI-infrastructure news) that previously leaked because the
  prompt said "include everything" and forced a Boneless Island connection "even if
  thin"; whyMatters now requires a genuine gaming reason or the story is declared
  off-topic. (2) Two-tier factual policy: event facts stay excerpt-bound, but
  background context (what the game/studio is, history, the why) is now REQUIRED
  from model knowledge, hedged — summaries target 250–500 words (floor
  `MIN_SUMMARY_CHARS` 700; feed keeps the legacy `>= 250` gate so old cards stay
  visible). Plus: excerpt cap 800→2500 chars, bigger curation maxTokens, repair
  pass aligned, fallback cards park instead of padding with filler. One-shot boot
  sweep (`newsOffTopicSweep.ts`, `news_pipeline_jobs`-guarded) parked off-topic
  live cards and re-queued thin recent summaries for regeneration. Engadget has no
  gaming-only RSS anymore (verified 2026-07) — firehose stays, gate enforces.
  Rationale in [`DESIGN_NOTES.md`].
- **Forums v2** *(shipped, verified 2026-06-12)* — full community-forum overhaul:
  post types (memory/rec/resource), image uploads (migration 058, served from the
  local `/uploads` volume), full-text search (059), engagement/trending (060), and
  forum polls (061). `forums.ts` grew to ~89KB. Security-probed (markdown XSS inert,
  SSRF block matrix, EXIF strip, MIME-spoof reject). Remaining = live-smoke only
  (two-account browser pass, Discord webhook test, EXPLAIN on prod data); optional
  later refactor: split the large `Forums.tsx` per-view.
- **Site modernization** *(shipped, verified 2026-06-12)* — real routing
  (**react-router v8**, `RouterProvider` in `main.tsx`; replaced `useState` page
  switching, fixes refresh/back-forward), **server-side Postgres sessions**
  (migration 062, enables revocation; one-time forced re-login accepted), and a
  **CSP** plus hardened headers in `server.ts`. Non-goals held: no SSR, no list
  virtualization, no feature/visual changes.
- **News AI cost overhaul** *(shipped 2026-06-28, PRs #61-#64)* — moved news curation off Bedrock/Haiku to **Gemini 2.5 Flash** via **Cloudflare AI Gateway** (~$10/day → pennies/day); chat + light tasks use Gemini 2.5 Flash-Lite. Reddit is now enrichment-only (embed + attach to existing stories; no LLM call, no standalone card). Embeddings switched to **OpenAI `text-embedding-3-large` @3072** behind an `EmbeddingProvider` interface (migration 080: auto-detect `halfvec(3072)`+hnsw or `vector(3072)` seq-scan). Pipeline structurally unified: ingest delegates to a single `curateUncuratedGeneralNews` function; the old duplicate inline curation loop and Nova pre-cluster fingerprint pass removed. Validation give-up caps re-curation at 3 attempts then parks the row permanently. Spend controls: soft monthly app cap (`ai_monthly_budget_usd`, fail-open) + Cloudflare gateway $10/mo edge Spend Limit. Honest health observability: plain-English `reason`, last-run funnel, fallback-art count as informational-only (not "degraded"), new `GET /news/general/fallback-art-cards` endpoint.
- **News feed rescue + tuning** *(shipped 2026-07-02, PRs #75/#76)* — fixed a ~24h feed
  freeze: the soft monthly spend cap `ai_monthly_budget_usd` had tripped at month-end and
  silently paused the LLM curator (health still read "healthy" — old live cards masked it),
  now disabled on prod (Cloudflare gateway Spend Limit is the backstop). Then tuned the feed:
  recency-decayed hero ranking — `(ai_relevance + 0.35·ln(1+coverage) + 0.2·netVotes) ×
  0.5^(ageHours / news_feed_decay_half_life_hours)`, default 8h → hero rotates ~3×/day to the
  freshest big story (migration 084, tunable); `coverage` = how many outlets cluster into a
  story; the `>= 0.85` freshness exemption is bounded to 2× the window; and the curator
  summary hint aligned to 500–1000 words (was silently capped ~300–500 by a stale schema
  hint). CSP `img-src` broadened to `https:` so news-card covers stop violating (still
  Report-Only). Why in [`DESIGN_NOTES.md`].

---

## Game nights

- **Host self-serve edit / cancel a night** *(partial)* — PATCH/DELETE exist but are
  admin-only (`gameNights.ts:397,451`); the public `ScheduledNights` UI
  (`Games.tsx:~1654`) has no edit/cancel, so a regular host can't reschedule or cancel
  their own night.
- **Discord push when a host locks the game** *(unbuilt)* — the `game_night.game_picked`
  event is written to `activity_events` but never queued to `bot_announcements`; the bot
  only handles milestone/achievement announcements (`apps/bot/src/index.ts`).
- **Recurring game nights** *(unbuilt)* — no recurrence columns/logic/UI; each night is
  one-off.
- **Time-consensus chips** *(unbuilt)* — host picks a single `scheduled_for`; attendees
  can't propose/vote alternative slots.
- **`.ics` calendar export** *(unbuilt, low priority)* — was explicitly out of scope in
  the old plan.

## Forums

- **Last-reply avatar on thread previews** *(partial)* — backend returns
  `last_user_avatar` (`forums.ts:~198`); the UI shows reply/view counts and the replier's
  name but never renders the avatar image (`Forums.tsx:~608`).
- **"Hot" flame indicator at a reply threshold** *(unbuilt)* — no `isHot` field, no
  threshold rendering in `Forums.tsx`.
- **Migrate the compose-time "announce to Discord" checkbox onto the share pipeline**
  *(unbuilt)* — thread compose still posts via the single `forums_discord_webhook_url`
  webhook as username "Nuggie" (`forumAnnounce.ts`); an author announce is really a
  self-share to a default `share_targets` row. Migrating retires the webhook + the
  Nuggie-attributed posting (brand-split cleanliness).
- **Reaction surfaces beyond forums** *(unbuilt)* — `ReactionBar`/`EmojiPicker`
  (`apps/web/src/pages/forums/`) were built reusable; nothing else consumes them yet.
  Candidates: news cards (distinct from the up/down content vote), activity rows.
- **Batch the guild-emoji sync inserts** *(nice-to-have)* — `syncGuildEmojis` in
  `forums.ts` upserts one row per emoji sequentially; fine at hobby scale, batch it if
  the guild ever carries hundreds of emoji.

## Achievements / Nuggies economy

- **Achievement rarity tints** *(unbuilt)* — rarity data exists (migration `053`) but
  badge tiles render no common/rare/epic border colors (`NuggieBadge.tsx`,
  `Achievements.tsx`, `GameDetailDrawer.tsx` shows rarity as text only).
- **Discord accent-color tint on leaderboard / crew counts** *(unbuilt)* — leaderboard
  query doesn't select `accent_color`; UI uses a hard-coded accent
  (`Community.tsx`, `CommunityLeaderboard.tsx`).

## Activity feed / Community

- **Friends Online role badges** *(unbuilt)* — `roleNames` is on the member type and
  rendered elsewhere (IslanderProfile), but the Friends Online `CrewRow`
  (`Home.tsx:~1067`) shows only avatar/name/presence.
- **Same-voice-channel grouping hint** *(partial)* — `voice_channel_id` is stored/synced
  (migration `006`) but not selected in `GET /members`, not on the `GuildMember` type, and
  the Friends Online UI has no grouping logic.

## Library / Games

- **Per-game activity feed on the game landing page** *(unbuilt, deliberately deferred
  from the 2026-07 sweep)* — "what the crew did in this game" section on
  `/library/:appId`. Needs a migration adding an index like
  `(target_app_id, created_at DESC) WHERE target_app_id IS NOT NULL` on
  `activity_events`, an `appId` param on `GET /activity` (or a new endpoint), and
  `filterHiddenSteamEvents` privacy wiring.
- **"Hot lately" library sort** *(unbuilt)* — SUM of `playtime_2weeks` next to the
  shipped most/least-played sorts; one extra aggregate in crew-games + one `<option>`.
- **Capability filter chips in the recommender** *(unbuilt)* — `CrewOwnedGame` carries
  `isOnlineCoop` / `isLanCoop` / `isMmo` etc. (`types.ts`) but Games filters only by genre
  tags, not capability (`Games.tsx`).
- **Time-aware hero greeting subline** *(unbuilt)* — Home hero subline is static
  (`Home.tsx:~127`); wire a real "Game night tonight — N RSVPs" from `GET /game-nights`.

## Performance & tech debt

- **`AbortController` timeout in `apiFetch`** *(partial)* — crew-games/crew-wishlist
  already respond-then-enrich on the backend (`steam.ts`), but the generic `apiFetch`
  (`client.ts:3`) has no timeout, so a slow call can still hang the UI.
- **React.memo gaps on polled components** *(partial)* — equality-guarded setState and
  most page memos are in place; `App` root, `NotificationBell`, and `SettingCard` poll but
  aren't memoized.
- **Deploy matrix parallelization** *(partial)* — GHA buildx cache is configured
  (`deploy.yml`), but the three image builds still run sequentially in one job; matrix
  them (deploy latency = recovery time, no rollback).
- **Remaining mobile polish** *(shipped 2026-06-21)* — topbar narrow rules, hide hamburger when tab bar active, toast/stream drawer offsets, admin grid stacking, Forums touch targets, Library/PosterCard touch overlay, casino card sizing. Sweep again if new rigid grids land.

## Scene / polish

- **Toast glow-up** *(partial)* — tone styling + entry animation exist; missing exit
  animation, tone icons, and hover-to-pause.
- **Seasonal / weather scene moments** *(partial)* — only a date-keyed shooting star
  exists; no month-based string-lights / jack-o'-lantern moon / overcast roll.
- **Living island — backdrop reacts to live crew presence** *(unbuilt, blocked on art)* —
  turn the scene into a presence visualization: tiki torches lit per member online, a beach
  campfire scaled to voice-channel size, nugget silhouettes around it, a boat on the water
  when someone's "in game"; quiet empty shore at zero. Reuses already-synced presence
  (`in_voice` / `activity_*`, `GET /members`) — no new data. **Blocked on commissioning
  high-quality layered island/nugget art** (per-element assets that can be shown/hidden +
  positioned) before building. The standout "make the backdrop mean something" idea; extends
  the date-keyed scene moments above.

## Steam (deferred, low value)

- **GetBadges / ResolveVanityURL / Steam groups** *(unbuilt, deliberately skipped)* —
  noted as low/no value in the old plan; Steam groups data is a deletion candidate rather
  than a feature. Listed only so the decision isn't rediscovered from scratch.

## News

- **Per-item news endpoint for share deep links** *(gap, known at ship time)* — shared
  news embeds link to `/games/news?item=<id>`, but there is no `GET`-single-item
  endpoint; the page resolves the param against the already-loaded feed, so an article
  that has aged out of the live feed silently no-ops. Add a by-id lookup (session-gated)
  and have the modal fall back to it.

## Ops

- **Configure `share_targets` on prod** *(operational, one-time)* — the share feature
  ships enabled (`share_enabled = true`) but with an EMPTY channel allowlist; members see
  no targets until an admin adds channels via Admin → Discord Bridge → Share to Discord
  (picker backed by `GET /admin/discord/channels`).
- **Flip `API_BASE_URL` to `http://api:3000` on the live box** *(operational)* — code and
  `DEPLOY.md` already expect the internal docker-compose hostname (Caddy 403s `/internal*`
  from public); the production `.env` value is the only remaining manual step.
- **Flip the SPA CSP from report-only to enforcing** *(operational + 1-line code)* —
  `infra/Caddyfile` ships `Content-Security-Policy-Report-Only`; while report-only it gives
  no protection. Blocked on validating Cloudflare's JS-Detections nonce propagation (likely
  only testable via a canary flip when enforcing, not during the soak) and confirming Rocket
  Loader is OFF; then rename the header to `Content-Security-Policy` and deploy in a quiet
  window, watching `/csp-reports` + console. `img-src` already broadened to `https:` (PR #76).
  See [`DESIGN_NOTES.md`] → "Content Security Policy".

(The old "Forums V2 (built, unmerged)" section was removed 2026-07-03: commits `72f4f2e`
and `a2ee84b` are ancestors of `main` — V2 shipped long ago and the section had gone
stale. Its design invariants live on in [`DESIGN_NOTES.md`] → "Forums V2".)
