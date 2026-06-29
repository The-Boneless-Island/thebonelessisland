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
- **Forums V2** — see the dedicated section at the bottom.

## Achievements / Nuggies economy

- **Achievement rarity tints** *(unbuilt)* — rarity data exists (migration `053`) but
  badge tiles render no common/rare/epic border colors (`NuggieBadge.tsx`,
  `Achievements.tsx`, `GameDetailDrawer.tsx` shows rarity as text only).
- **Discord accent-color tint on leaderboard / crew counts** *(unbuilt)* — leaderboard
  query doesn't select `accent_color`; UI uses a hard-coded accent
  (`Community.tsx`, `CommunityLeaderboard.tsx`).

## Activity feed / Community

- **Achievement-event parity on the Community page** *(partial)* — Home renders the
  `achievement.unlocked` case with emoji/name + game art (`Home.tsx:~1333`); the Community
  `ActivityRow` lacks that case and renders no game art (`Community.tsx:~359,483`).
- **Friends Online role badges** *(unbuilt)* — `roleNames` is on the member type and
  rendered elsewhere (IslanderProfile), but the Friends Online `CrewRow`
  (`Home.tsx:~1067`) shows only avatar/name/presence.
- **Same-voice-channel grouping hint** *(partial)* — `voice_channel_id` is stored/synced
  (migration `006`) but not selected in `GET /members`, not on the `GuildMember` type, and
  the Friends Online UI has no grouping logic.

## Library / Games

- **Last-played per owner in the game detail drawer** *(unbuilt)* — drawer shows
  playtime-forever / 2-week only; `user_games.last_played_at` is stored but not surfaced
  (`GameDetailDrawer.tsx:~546`).
- **Capability filter chips in the recommender** *(unbuilt)* — `CrewOwnedGame` carries
  `isOnlineCoop` / `isLanCoop` / `isMmo` etc. (`types.ts`) but Games filters only by genre
  tags, not capability (`Games.tsx`).
- **Time-aware hero greeting subline** *(unbuilt)* — Home hero subline is static
  (`Home.tsx:~127`); wire a real "Game night tonight — N RSVPs" from `GET /game-nights`.

## Performance & tech debt

- **Remove `game_night_votes` dead code** *(partial)* — voting is gone, but the table
  remains and is still referenced for cascade-delete and a voter query in the
  recommendations path (`gameNights.ts:462,726`). Finish the removal (and the
  `topGameVote` type if any remnant remains).
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
  animation, tone icons, and hover-to-pause. Also drop the dead `"vote saved"` entry from
  `SUCCESS_PREFIXES` (`toast.tsx:94`) — a remnant of removed voting.
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

## Ops

- **Flip `API_BASE_URL` to `http://api:3000` on the live box** *(operational)* — code and
  `DEPLOY.md` already expect the internal docker-compose hostname (Caddy 403s `/internal*`
  from public); the production `.env` value is the only remaining manual step.

---

## Forums V2 (built, unmerged — needs sign-off)

The full Forums V2 feature set is **built and verified on branch
`claude/confident-mendel-34a474` (SHA `a2ee84b`)** but is **not in `main`**. Scope:
markdown with safe rendering, post types (discussion/memory/recommendation/resource),
image uploads with EXIF strip + thumbnails, full-text search with snippets,
subscriptions/unread tracking, `@mentions` + notifications, five fixed emoji reactions,
resource link unfurling with SSRF guards, opt-in per-thread Discord webhook announce, and
generic thread polls. Migrations `057–061` apply; 47/47 security probes pass; 61/61
migrations apply on a fresh DB.

**Blocked on human sign-off**, not code: two-account browser smoke tests, a live Discord
webhook test, `EXPLAIN` analysis on live data, and an optional `Forums.tsx` per-view split
if it exceeds ~2.5k lines. Design invariants are preserved in
[`DESIGN_NOTES.md`](DESIGN_NOTES.md#forums-v2-built-on-an-unmerged-branch). To proceed,
revive that branch rather than rebuilding from this note.
