PROJECT NAME: The Boneless Island

> **Forward plan: see `BACKLOG.md` (remaining work, every item code-verified) and
> `DESIGN_NOTES.md` (durable design rationale), both at the repo root.** ROADMAP.md was
> retired 2026-06-17; its still-relevant items were salvaged into BACKLOG.md and its
> reasoning into DESIGN_NOTES.md.

PROJECT TYPE:
Community web platform + Discord integration for a long-running gaming Discord server.

COMMUNITY CONTEXT:
- Discord server name: "The Boneless Island"
- Age: ~6 years
- Discord is the center of the community
- Goal is NOT to build a commercial product, but a useful, fun, long-lived community hub

CORE GOALS:
1. Build a website that people return to repeatedly
2. Use the site to solve real Discord problems (what to play, who's available, shared history)
3. Practice real, transferable engineering skills (auth, APIs, data modeling, UX, infra)
4. Preserve community memory, inside jokes, and identity
5. Keep everything opt-in, respectful, and playful (non-sweaty, non-corporate)

AUTHENTICATION & IDENTITY:
- Discord OAuth is the ONLY login method
- No passwords, no email accounts
- Discord user ID is the canonical user identifier
- Login is restricted to members of the configured Discord guild
- Steam is supported ONLY as an optional linked account AFTER Discord login

DISCORD DATA USED (minimal scope):
- Discord user ID, username, avatar
- Server membership, roles (optional)
- Voice channel presence + rich presence (read-only)

STEAM DATA USED (opt-in, read-only):
- SteamID64
- Owned games
- Wishlist (planned)
- Playtime / last played
- Public profile info

IDENTITY PHILOSOPHY:
- Discord = social identity
- Steam = game library reality
- All features should work without Steam, but Steam enhances them

INFORMATION ARCHITECTURE (current):
Top nav: a MegaMenu (`MegaMenu.tsx`) with three hover-expand groups — **Games** (Library, Gaming News), **Community** (Members, Sunday Tide Check, Forums, Leaderboard, Crew Achievements), **Nuggies** (Balance & Shop, The Arcade, History, Milestones) — plus an **Admin** link gated to the "Parent" role. There is no "Home" nav item: Home is the root route (`/`), reached via the brand logo. "Crew Achievements" lives nested under Community (route `/achievements`); the Nuggies economy is its own group (route `/nuggies`). Page↔path map lives in `apps/web/src/lib/routes.ts`.
Topbar uses `position: fixed` (not sticky) so it stays locked to the viewport during overscroll/rubber-band. A 62px spacer div in App.tsx compensates for the removed document-flow space.
User menu (avatar dropdown): Discord profile + rich presence (Discord activity → Steam in-game → legacy voice text → hidden when null; composed in `/profile/me` via `composePresenceText()` in `lib/presence.ts`) + Steam-linked dot + theme toggle (Day/Night) + Profile + Sign out.
Sub-pages: Games → Library + Gaming News; Nuggies group → economy page (fully live); Community group → Members, Forums, Leaderboard, Crew Achievements, Sunday Tide Check; Admin → persistent-sidebar operations pages.
Admin: rebuilt (2026-06) as a persistent left sidebar over 18 deep-linkable `/admin/*` pages (registry in `apps/web/src/pages/admin/adminNav.ts`): dashboard, members, forums, library, game-nights, recommender, news, patch-sources, drift-log, economy, shop, economy-rules, ai, persona, guild, bridge, sync, audit. Settings are colocated on their feature page (one control per fact); high-risk settings sit in a per-page "danger zone" behind a confirm phrase. `Admin.tsx` is now a ~133-line routing shell. See `DESIGN_NOTES.md` for the IA rationale.

CORE FEATURE PILLARS:

1. COMMUNITY HUB (HOME)
- Hero with day/night scene + parallax palms + sun-or-moon arc-dip on theme switch
- Featured Game card
- Friends Online widget (live Discord presence)
- Discord-style Activity Feed (friends/achievements/milestones/patches tabs) — initial cap 25 events (`ACTIVITY_INITIAL_LIMIT` in `Home.tsx`, paginates up to `ACTIVITY_MAX_LIMIT` 100); "View full feed" footer button + "Open community →" header link both navigate to Community page
- Drift Log news cards (curated patches/updates)
- Bot CTA + Crew ritual cards

2. GAMES (replaces voting flow)
- Host-driven **PlanNightCard** (`Games.tsx`, two modes: a quick "Tonight" flow + an "Everything" mode):
  - Game source toggle — AI pick (header with match strength + reasoning) / crew library search / decide later
  - Crew roster picker (live members) → invite list
  - When (Tonight default + custom time) + host join toggle → create game night
- Patches & Updates rolodex (featured + filterable list)
- Scheduled game nights with RSVP (no voting)
- Group wishlist (pooled Steam wishlists with hype bars)
- Library snapshot → full Library sub-page
- "In game now" drawer (right-edge tab) — live, driven by member `richPresenceText`/`inVoice`, hidden at zero
**The voting mechanic is intentionally removed.** Hosts pick the game directly. (The old "Mode bar" Tonight/Weekend/Quick/Cozy/Spicy was dead UI and has been deleted.) The vote HTTP endpoints are gone; only some dead `game_night_votes` *table* references remain (cascade-delete + a voter query in the recommendations path, `gameNights.ts:462,726`), slated for cleanup — see `BACKLOG.md`. Do NOT re-add voting.

3. LIBRARY (sub-page of Games)
- Steam library list with search, category filter chips, sort, co-ownership avatar stacks, PLAN shortcut

4. COMMUNITY (now fully wired — `Community.tsx`)
- Crew carousel (admin button gated to Parent) — LIVE (live guild members)
- Activity timeline — LIVE (GET /activity)
- Forums table (channels) — LIVE (GET /forums/categories)
- Upcoming events with date tiles + RSVP — LIVE (GET /game-nights)
- Weekly leaderboards — LIVE (Nuggies leaderboard, GET /nuggies/leaderboard)
- Recent clips & Clubs — deliberately CUT (no data source); not present.

5. ACHIEVEMENTS — now the live "Nuggies" economy page (NOT a placeholder)
- Fully wired against `/nuggies/*`: balance, daily claim, shop, inventory/equip, loans, ladder, opt-out, milestones
- Island-specific badges for attendance/participation/milestones; no competitive pressure or grind
- NOTE: per-user Steam achievement completion data IS synced (`user_game_progress`, 035 migration) and now has a member-facing surface — the **Crew Achievements** page is BUILT (`apps/web/src/pages/CrewAchievements.tsx` + `GET /steam/crew-achievements`), nested under Community at `/achievements`.

6. DISCORD + STEAM INTELLIGENCE (CORE VALUE)
PRIMARY PROBLEM TO SOLVE:
"Who can play what together right now?"
- Detect online Discord members
- Cross-reference Steam libraries
- Recommend games that everyone owns + fit group size + session length
- Surface best matches, near matches (one missing), dormant libraries

7. DISCORD INTEGRATION
- Thin Discord bot ("Nuggie") backed by website logic — single-file discord.js v14 gateway worker, no DB, all via the API
- 21 slash commands live (game recs, full Nuggies economy: daily/balance/give/shop/buy/equip, 3 gambling games, loans, marketplace, leaderboard/profile/inventory/milestones/activity, opt-in/out, /nuggie ask). Nothing registered-but-unimplemented.
- Real-time presence sync (PresenceUpdate → POST /members/presence/:id) powers the web Friends Online card; needs privileged GuildPresences + GuildMembers intents
- Automated weekly digest — the **"Sunday Tide Check"** is BUILT (`apps/web/src/pages/TideCheck.tsx` at `/tide-check`, backed by a weekly-digest cron + bot announcement). Reachable from the Community group.

8. ADMIN
- Persistent left sidebar → 18 deep-linkable `/admin/*` pages (registry: `apps/web/src/pages/admin/adminNav.ts`)
- Role-gated to Discord "Parent" role
- Pages: dashboard, members, forums, library, game-nights, recommender, news, patch-sources, drift-log, economy, shop, economy-rules, ai, persona, guild, bridge, sync, audit. Settings live on their feature page (one control per fact); high-risk controls sit in a per-page "danger zone" behind a confirm phrase. See `DESIGN_NOTES.md` for the IA rationale.
- Tournaments deliberately removed — no near-term plans to implement

VISUAL SYSTEM:
- Tropical sky/ocean/beach scene (full-bleed fixed background, z-index -10)
- Day/night themes:
  - Night = deep navy sky + stars + moon
  - Day = blue sky + clouds + sun
  - Toggle in user menu; sun/moon does an arc-dip transition (1.1s drop, 1.5s rise) during switch
- Palm trees frame the viewport (left + right SVG silhouettes with chunky trunks, rings clipped to trunk, 12 fronds, coconut cluster) with sway loop + scroll parallax (rise + scale + fade)
- Theme color tokens are CSS variables (`--bi-app-bg`, `--bi-panel-bg`, etc.) swapped via `:root[data-theme="day"]` so components stay token-driven
- Translucent glass panels (`backdrop-filter`) sit over the scene. Target alpha: panels ~0.58 (night) / ~0.70 (day); body ~0.42 (night) / ~0.58 (day); menus ~0.90. RULE: every translucent surface MUST pair low alpha with backdrop-filter blur or text becomes unreadable over the moving video. The scrim in `IslandSceneShell.tsx` is the global video-visibility lever — tune in-browser.
- Fonts: Bricolage Grotesque (display), Inter (body), JetBrains Mono (mono)
- `.island-display` and `.island-mono` global utility classes available

DESIGN & TONE:
- Playful, self-aware, community-first
- Worldbuilding metaphors encouraged (island, shore, crew, dock, drift log, lagoon, reef)
- Avoid corporate or SaaS styling
- Features should feel like toys + tools, not dashboards

BRAND DETAILS (HIGH PRIORITY):
- Primary demographic is adult gamers (mostly men in their 30s) from the Discord community.
- Themed setting is a tropical island: beach, palms, sand, shoreline, warm-weather vibe.
- Core mascot identity is boneless chicken nuggets with personality (arms/legs/faces, often gaming).
- New copy, placeholder text, and visual concepts should reflect this identity by default.
- Keep tone fun and mature: playful without being juvenile, ironic without being cynical.

PRIVACY & TRUST:
- Everything opt-in
- Minimal permissions
- Clear explanation of what data is used and why
- Allow users to hide or remove linked accounts

IMPLEMENTATION GUIDANCE:
- Favor simple, composable data models
- Rule-based recommendations now; AI/LLM-driven recommendations planned (Games page is already designed around an AI pick affordance)
- Optimize for clarity, debuggability, and iteration
- Web styling: theme tokens in `apps/web/src/theme.ts` (CSS vars + palette + glass + motion + font + prose), primitives in `apps/web/src/islandUi.tsx`
- Day/night context lives in `apps/web/src/scene/useDayNight.tsx`
- Scene + palms + sky live in `apps/web/src/scene/IslandSceneShell.tsx`, mounted around `<App>` in `main.tsx`
- Default to shared themed components before creating one-off inline UI patterns
- Most surfaces are now wired against real APIs; a handful of remaining gaps (operational `.env` flips, dead-code cleanup, smaller feature additions) live in `BACKLOG.md`, each re-verified against code on 2026-06-17. Before building a "new" feature, check `BACKLOG.md` + the CURRENT STATE notes below: the work is often API-wiring of a design-shipped shell, not new UI.

CURRENT STATE:
- React + Vite + TypeScript monorepo (`apps/web`, `apps/api`, `apps/bot`, `packages/shared`)
- Discord OAuth + guild gate working
- Steam linking via official Steam OpenID 2.0 (`GET /steam/openid/start` → `GET /steam/openid/return` with check_authentication round trip). Surfaced in the UI through:
  - **"Washed Ashore" onboarding tour** (`components/OnboardingFlow.tsx`) shown post-login to new/re-prompted members: 8-step product tour (dim scrim + `IslandCard` steps, progress dots, persistent Skip) covering Welcome → Profile → Steam (opt-in) → Gaming News → Forums → Nuggies → Casino → Home. Completion is **server-tracked** via the `user_client_state` kv table (migration 065, `onboarding_version` key); `GET /profile/me` returns `clientState` + `currentOnboardingVersion`. Admin "Re-show onboarding to all members" button on Members & Roles calls `POST /admin/onboarding/reset-all` (parent-gated). The old single Steam-link modal (`SteamOnboarding.tsx`) was deleted. Five other per-member flags were also migrated off localStorage into `user_client_state`: `forum_intro_seen`, `steam_share_ack`, `theme_pref`, `last_unlock_seen_at`, `activity_last_seen_at` (theme keeps a localStorage cache for first paint).
  - **Topbar Steam status badge** (Steam logo + green/grey sync dot) sitting beside the avatar trigger so the brand is always visible.
  - **User-menu Steam panel** with the Steam logo, last sync ("Synced 12m ago"), SteamID64, and a Sync now / Sign in through Steam button.
- Steam owned-games + wishlist sync working (`POST /steam/sync-owned-games`, `POST /steam/sync-wishlist`). Both endpoints enforce 30-minute per-user cooldown (uses existing `last_synced_at` column) and pass through Steam 429 `Retry-After` headers. After a successful owned-games sync, top 8 games by playtime are immediately ingested for news (fire-and-forget) so first-time home page visit has articles ready.
- Rule-based recommendation endpoint live
- Featured recommendation endpoint live (`GET /recommendations/featured`, voice→crew scope fallback) — powers Home Featured Game card
- Crew library endpoint live (`GET /steam/crew-games` returns games with owner display name + avatar) — powers Library page + composer cover art
- Steam wishlist sync live (`POST /steam/sync-wishlist`, chained after `/steam/sync-owned-games`); pooled via `GET /steam/crew-wishlist` — powers the Group Wishlist card
- Steam News ingestion live (`game_news` + lazy `ISteamNews/GetNewsForApp/v2` fetch, 6h staleness window) → `GET /games/news` returns scope-tagged feed for crew-owned + wishlisted apps. Powers the Patches & Updates rolodex on Games.
- Activity event ledger live (`activity_events`) with emitters in game-night create / RSVP / finalize and Steam link / unlink / sync. `GET /activity` powers Home Activity Feed + Community activity timeline with server-side category mapping.
- Curated news cards live (`news_cards`). `GET /news-cards` is session-only; `POST/PATCH/DELETE` gated by `requireParentRole` (env `PARENT_ROLE_NAME`, default `Parent`). Powers Home Drift Log + Admin → News Curation CRUD UI.
- Game night create/RSVP/finalize endpoints live (UI no longer surfaces voting)
- Design implementation: 8 phases shipped (foundation, topbar, home, games, library, community, admin, cleanup)
- Topbar: `position: fixed` (not sticky) — prevents overscroll/rubber-band drift. 62px spacer div in App.tsx compensates for removed document flow.
- Home Activity Feed: initial cap 25 events (`ACTIVITY_INITIAL_LIMIT` in `Home.tsx`; paginates up to `ACTIVITY_MAX_LIMIT` 100). "View full feed — N more →" button + section header "Open community →" both navigate to Community. `SectionHead` now accepts optional `onAction` callback.
- General news ingestion: 60-minute server-side cooldown (`lastIngestedAt` + `INGEST_COOLDOWN_MS`) prevents hammering RSS feeds; frontend news/activity poll interval 20 minutes (was 5). AI summaries computed once per article and shared across all users — no per-user AI queries.
- News pipeline (v3.2, June 2026 — PRs #61-#64):
  - **Source registry** (`news_source_registry`, migration 037): RSS / Reddit / YouTube / GNews providers behind a `NewsProvider` interface. ~36 curated presets + admin-added custom sources. Pluggable. See `apps/api/src/lib/news/providers/`.
  - **Embeddings** (migration 080): **OpenAI `text-embedding-3-large` @3072 dims** behind an `EmbeddingProvider` interface (was Bedrock Titan 1024). pgvector column is `halfvec(3072)` + hnsw index (pgvector ≥0.7) or `vector(3072)` seq-scan (older) — auto-detected in the migration. Similarity threshold 0.85 against last-14d curated primaries absorbs duplicates as siblings (URL folded into parent's `ai_sources`, no LLM call). Backfill via admin "Embed Missing Articles" button (`POST /news/general/embed-backfill`). Switching embedding models requires a full re-embed (vectors are model-specific).
  - **Reddit is enrichment-only**: Reddit posts embed + attach as sources to existing stories; if no matching curated primary is found (cosine < threshold), the row is parked (`reddit_no_story_match`). Reddit never spawns its own AI-curated card and never triggers an LLM call.
  - **Multi-layer dedup**: (1) embedding cosine-absorb pre-curation (siblings folded into existing primaries, never hit the curator), (2) AI in-batch merge if siblings co-located, (3) AI cross-pass merge against recent primaries (fetched once per pass), (4) display-time SQL collapse (`GET /news/general` window function). The pre-cluster Nova AI fingerprint pass (`assignStoryFingerprints`) was removed — embeddings handle cross-pass clustering; the curator prompt assigns `ai_story_fingerprint` per-article in-batch.
  - **One unified ingest → curate path**: `ingestAndCurateGeneralNews` does fetch → upsert → embed → absorb, then delegates to the single `curateUncuratedGeneralNews` function (via `skipLock`). The old duplicate inline curation loop is gone.
  - **Validation give-up** (`MAX_TOTAL_CURATION_ATTEMPTS = 3`): rows that have been attempted 3× total are permanently parked (`pre_filter_reason='curation_giveup'`); the unconditional reset no longer re-queues exhausted rows.
  - **Spend control**: soft monthly app cap (`ai_monthly_budget_usd` setting, fail-open — a DB hiccup never blocks curation) + Cloudflare AI Gateway edge Spend Limit as the real hard backstop. **Set to `0` (disabled) on prod as of 2026-07-02.** The soft cap pauses only the LLM curator when month-to-date `ai_cost_ledger` spend ≥ cap, and does NOT surface in health (which keeps reading "healthy" because existing live cards mask it), so it silently froze the feed for ~24h at the 2026-06-30 month-end. Disabling it leaves the gateway Spend Limit as the sole backstop — confirm that limit is set. Distinct from `ai_daily_cost_warn_usd` (warn-only banner, never blocks).
  - **Honest health** (`newsCurationHealth.ts`): health status carries a plain-English `reason` field and a last-run funnel (fetched / embedded / new / duplicates / merged). A card on island fallback art (`image_source = 'default'`) is informational, never "degraded" — the image ladder always sets at least the default. `GET /news/general/fallback-art-cards` lists cards on island fallback art for admin diagnostics.
  - **Re-curate job** (`POST /news/general/recurate` → background, polled via `GET /news/general/recurate/status`, cancellable via `POST /news/general/recurate/cancel`). Tracks `processed / curated / merged / duplicates / failed / costUsd`. Surfaced live in admin with progress bar + breakdown.
  - **Feed ranking + hero rotation** (`newsFeed.ts`, PR #75): the feed orders by a recency-decayed signal score — `(ai_relevance + 0.35·ln(1+coverage) + 0.2·netVotes) × 0.5^(ageHours / news_feed_decay_half_life_hours)`, where `coverage` = how many feed-eligible articles cluster into the story (many outlets covering it = a big story). Default half-life **8h** → the hero card (`feed[0]`) rotates ~3x/day to the freshest big story instead of pinning to one high-score card; a story still gaining coverage/votes resists the decay, a stale one falls off. The `ai_relevance_score >= 0.85` freshness-window exemption is bounded to 2× the freshness window so nothing pins forever. Half-life is tunable from Admin (`news_feed_decay_half_life_hours`, migration 084).
  - **Summary length**: curator prompt targets **500–1000 words** (1350-word hard cap). Earlier the JSON schema hint said "~300–500 words", contradicting the completeness directive and over-truncating summaries — both hints are now aligned (PR #75). Forward-only; existing cards refresh as their stories update.
- AI provider stack (June 2026 — PRs #61-#64):
  - **Per-provider API key slots** (migration 041): `anthropic_api_key` / `openai_api_key` / `gemini_api_key` — independently configurable, legacy `ai_api_key` kept as fallback. Each pasted in Admin → System → AI Settings.
  - **Four providers wired** (`apps/api/src/lib/ai/index.ts`): Anthropic (Claude), OpenAI (GPT), Google (Gemini), and AWS Bedrock. Provider class per vendor in `apps/api/src/lib/ai/providers/`. Active curation model: **Gemini 2.5 Flash**. Chat and light tasks: **Gemini 2.5 Flash-Lite**. Bedrock authenticates via the AWS credential chain (no API key) and must be invoked through a cross-region inference profile.
  - **Provider-agnostic task routing**: `resolveModelForTask` and `getAIProviderForTask` resolve model by task key (`ai_model_curation` / `ai_model_chat` / `ai_model_light`) for any provider. Bedrock's legacy `bedrock_model_*` keys are kept for back-compat. No provider is hard-wired to a task.
  - **Cloudflare AI Gateway** (opt-in, `ai_gateway_enabled = "true"`): all provider calls can route through the gateway base URL (`gateway.ai.cloudflare.com/v1/{account}/{gateway}/{slug}`). BYOK mode — provider API keys stay in the app; only the `cf-aig-authorization: Bearer <token>` header is added (`ai_gateway_token` setting). Gives a unified cost dashboard, analytics, request logging, and an edge **Spend Limit** (the real monthly hard cap). No token markup. Implemented in `apps/api/src/lib/ai/gateway.ts`; gated on the `ai_gateway_enabled` setting.
  - **Cost telemetry** (`ai_cost_ledger`, migration 042): every billable AI call upserts into today's row via `recordAiCost` in `lib/ai/usageTally.ts`. Surfaced in admin AI Health card as `Today: $0.XX · N calls (warn ≥ $5)` chip; warn-only banner appears when over `ai_daily_cost_warn_usd` threshold (default $5). Endpoint `GET /settings/ai-cost-today`. Per-call cost also logged inline (`[ai:usage] ... est=$0.0XXX`).
  - **Tagline generator** now uses `getAIProvider()` abstraction (was hardcoded Anthropic).
- Background news refresh: `setInterval` in `server.ts` triggers `ingestAndCurateGeneralNews()` every 4 hours guaranteeing fresh content even with zero traffic. Page-load triggers still fire (≥1hr cooldown). Manual admin button bypasses cooldown entirely.
- Admin panel: rebuilt (2026-06) from the old tile hub into a persistent-sidebar IA over 18 deep-linkable `/admin/*` pages (`apps/web/src/pages/admin/adminNav.ts`); settings colocated on their feature page, high-risk controls behind a per-page danger-zone confirm phrase. Tournaments removed entirely. Data Sync is observability-only (connectors + live log). See `DESIGN_NOTES.md`.
- Real-data wired pages: Home (Featured + Friends Online + Activity Feed + Drift Log), Games (host PlanNightCard reads composer recs / falls back to featured, Patches rolodex from Steam News, Group Wishlist from real crew wishlists, live Nuggie chat, live "in game now" drawer), Library (full crew list with avatars + MINE badge), Nuggies economy (fully live), Crew Achievements (`/achievements`), Sunday Tide Check (`/tide-check`), Community Leaderboard + Nuggies History, Forums + Gaming News (live), Community (crew carousel + forums + events + activity timeline + Nuggies leaderboard — all live), Admin (18-page sidebar), Profile (incl. working Steam unlink button), UserMenu, Topbar, scheduled-nights cards.

CURRENT STATE — POST-AUDIT (2026-06-17, the 2026-06-10 audit's P0 blockers are mostly resolved; remaining items tracked in `BACKLOG.md`):
- RESOLVED: the `/news/general/*` admin endpoints (ingest/curate/embed-backfill/recurate, etc.) now carry `requireSession, requireParentRole` (`generalNews.ts`) — the unauthenticated paid-AI-run hole is closed. The two raw `fetch()` P0s are fixed: `Admin.tsx` is now a routing shell with no raw fetch, and `GamingNews.tsx` posts feedback via `apiFetch`. `DEPLOY.md` + `.env.example` set `API_BASE_URL=http://api:3000`.
- RESOLVED: the appdetails/capability migrations SHIPPED (045 game_store_details, 046 weekly_digests, 047 drop_legacy_player_columns); schema is now at migration **063**. Library "Players" column + session sorts are backed by real data, not dead defaults.
- RESOLVED: the former "Coming Soon" pages are BUILT — Community Leaderboard (`CommunityLeaderboard.tsx`) and Nuggies History (`NuggiesHistory.tsx`). The Steam unlink button is wired in `Profile.tsx` (`handleUnlinkSteam` → `POST /steam/unlink`). The "in game now" drawer (`StreamDrawer` in `Games.tsx`) is live, driven by real member `richPresenceText`/`inVoice` and hidden at zero — no mock streams remain.
- STILL OPEN (see `BACKLOG.md`): flip `API_BASE_URL` to `http://api:3000` in the production box's live `.env` (code/docs done; the live value is the last manual step); finish removing the `game_night_votes` dead code (the table + a cascade-delete and a recommendations voter query at `gameNights.ts:462,726` remain) — do NOT re-add voting UI.

NUGGIE PERSONA SYSTEM (May 2026):
- **Two deliberate brands**: "The Boneless Island" = org identity (login, header, footer, admin, casino, achievements, profile, marketing). "Nuggie" = chicken nugget mascot voice across every AI/bot surface (web chat companion, Discord `/nuggie ask`, achievement announcements). Site branding never says "Nuggie"; conversational AI never says "Island AI".
- **Two separate Discord applications** (security: blast-radius reduction):
  - App 1 `The Boneless Island` — OAuth client only, owns `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` + redirect URIs. No bot user.
  - App 2 `Nuggie` — Bot user only, owns `DISCORD_BOT_TOKEN` + `DISCORD_BOT_CLIENT_ID` + slash commands. No OAuth.
  - Compromise of one app's creds limits damage to that surface.
- **DB-driven persona** (migration 043, `server_settings` rows): `nuggie_system_prompt`, `nuggie_tone_rules`, `nuggie_emoji_palette`. Admin edits via System → admin UI (new `"textarea"` SettingInputType in `settingMeta.ts` + render path in `components/SettingCard.tsx`). 60s cache TTL — changes propagate without redeploy.
- **Persona loader** `apps/api/src/lib/persona/nuggie.ts` — `getNuggiePersona()` reads from existing `getAISetting()` cache (no new cache layer). `buildSystemPrompt(persona, surface)` composes a system prompt for one of three surfaces: `"web"` / `"discord-slash"` / `"announcement"`.
- **Achievement announcements** (migration 044, `achievement_message_variants` table): 90 pre-seeded Nuggie-flavored template variants across 15 keys (`first_blood`, `pog_moment`, `cheese_strat`, `nerfed`, `the_grind`, `streak_7`, `streak_30`, `high_roller`, `lucky_streak`, `house_special`, `bank_run`, `whale`, `gn_regular`, `gn_veteran`, `tournament_master`). `{{user}}` token replaced with Discord mention at announce time. Free at runtime (no LLM call). `grantEarned()` in `nuggiesAchievements.ts` emits `bot_announcements` row with `kind='achievement.unlocked'` for non-milestone unlocks; bot dispatcher picks a weighted-random variant via `GET /internal/achievement-variants/:key`. Milestones (`milestone_rank_*`) keep their existing `milestone.reached` LLM-generated celebration path. Toggle: `achievement_announcements_enabled` (default OFF). Reuses `milestone_channel_id` for posting.
- **Discord `/nuggie ask <question>` slash command** — single-turn LLM chat in Discord. Bot defers, calls `POST /internal/bot/nuggie-chat`, replies with persona-voiced answer. Cost ceiling: forces cheapest model per `PROVIDER_DEFAULTS` regardless of admin's web-chat default. `maxTokens: 256`. In-memory sliding-window rate limit: max 10 calls per user per hour. Per-call cost still tracked via existing `recordAiCost` pipeline.
- **Web AI chat** swapped to Nuggie persona: `apps/api/src/routes/aiChat.ts` system prompt now uses `buildSystemPrompt(getNuggiePersona(), "web")` instead of the old hardcoded "Island AI" string. Web UI in `Games.tsx` shows `🍗 Nuggie` header + "Ask Nuggie — …" placeholder. Crew context block still appended after persona prompt.

SECURITY HARDENING (May 2026, pre-beta):
- **Log redaction** (`apps/api/src/lib/logger.ts`): `installRedactor()` called at startup in `server.ts` monkey-patches `console.{log,error,warn,info,debug}` so any string containing one of the loaded secret env values (anything matching `*_TOKEN`/`*_SECRET`/`*_KEY`/`*_PASSWORD` + DATABASE_URL password) gets replaced with `[REDACTED]` before printing. Catches third-party libraries that log via `console`.
- **Tiered rate limits** (`apps/api/src/middleware/rateLimit.ts`, uses `express-rate-limit`): `authLimiter` 10/min IP on `/auth/*`, `aiLimiter` 20/min user on `/ai/*`, `steamLimiter` 30/min user on `/steam/*`, `defaultLimiter` 100/min IP on everything else. `/internal/*` is intentionally unlimited (bot-shared-secret auth). In-memory store — swap for Redis when scaling beyond single instance.
- **Cookie session hardening** (`server.ts`): `keys: [SESSION_SECRET, ...SESSION_SECRET_PREVIOUS]` rotation list lets you swap signing secrets without kicking users out. `secure: NODE_ENV === "production"` (HTTPS-only in prod, off locally). `sameSite: "lax"` (blocks CSRF, allows OAuth callbacks). `httpOnly: true` (blocks XSS exfiltration). 30-day `maxAge`. Startup warns if `SESSION_SECRET` < 32 chars.
- **CORS wildcard rejection**: `WEB_ORIGIN` is Zod-refined to require a fully-qualified http(s) URL with no `*`. Misconfigured `WEB_ORIGIN=*` would fail startup.
- **SSM Parameter Store loader** (`apps/api/src/lib/secrets.ts`, `apps/bot/src/lib/secrets.ts`): when `NODE_ENV=production` AND `SECRETS_SOURCE=ssm`, fetches every parameter under `/boneless/prod/*` and populates `process.env` before Zod parse. KMS-decrypted, CloudTrail-audited, IAM-gated. No-op in dev (dev keeps reading `.env` via dotenv). Top-level `await loadSecrets()` in `config.ts` (api) and `index.ts` (bot) blocks the import chain so dependent code sees populated env.
- **Dockerfiles**: `apps/api/Dockerfile` and `apps/bot/Dockerfile` are single-stage Node 20 Alpine images, run via `tsx` (no compile step). Non-root user, tini as PID 1, env injection at deploy time (never baked in). Multi-stage build with `tsc` is a future optimization. `.dockerignore` at repo root excludes `.git`, `.env*`, `node_modules`, `dist`, editor files.
- **`.env.example`** fully resynced to every `process.env.*` reference: NODE_ENV, API_PORT, WEB_ORIGIN, API_BASE_URL, VITE_API_BASE_URL, DATABASE_URL, SESSION_SECRET, SESSION_SECRET_PREVIOUS (rotation slot), DISCORD_* (OAuth + bot creds), PARENT_ROLE_NAME, STEAM_WEB_API_KEY, IGDB_*, ANTHROPIC/OPENAI/GEMINI keys. Organized by purpose with one-line explanatory comments.

ASSISTANT EXPECTATIONS:
- Assume this is a long-lived project
- Do NOT over-scope features
- Bias toward maintainable, incremental solutions
- Explain architectural decisions briefly when relevant
- Ask clarifying questions ONLY if strictly necessary
- Use industry standard best practices