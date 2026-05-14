PROJECT NAME: The Boneless Island

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
Top nav: Home · Games · Community · Achievements · Admin (gated to "Parent" role)
Topbar uses `position: fixed` (not sticky) so it stays locked to the viewport during overscroll/rubber-band. A 62px spacer div in App.tsx compensates for the removed document-flow space.
User menu (avatar dropdown): Discord profile + custom status + rich presence + status picker + theme toggle (Day/Night) + Profile + Sign out
Sub-pages: Games → Library; Admin hub → 8 sub-pages (Configuration, News, Data Sync, Members & Roles, Game Nights & Events, Forum Moderation, Game Library, Audit Log)

CORE FEATURE PILLARS:

1. COMMUNITY HUB (HOME)
- Hero with day/night scene + parallax palms + sun-or-moon arc-dip on theme switch
- Featured Game card
- Friends Online widget (live Discord presence)
- Discord-style Activity Feed (friends/achievements/milestones/patches tabs) — capped at 5 events; "View full feed" footer button + "Open community →" header link both navigate to Community page
- Drift Log news cards (curated patches/updates)
- Bot CTA + Crew ritual cards

2. GAMES (replaces voting flow)
- AI-recommended session composer:
  - AI pick header with match strength + reasoning
  - Mode bar (Tonight/Weekend/Quick/Cozy/Spicy)
  - Crew roster picker (live members) → invite list
  - When/Where strip
  - Send invite footer
- Patches & Updates rolodex (featured + filterable list)
- Scheduled game nights with RSVP (no voting)
- Group wishlist (pooled Steam wishlists with hype bars)
- Library snapshot → full Library sub-page
- Live streams drawer (right-edge tab)
**The voting mechanic is intentionally removed from the UI.** Hosts pick the game directly. Vote-related API endpoints remain alive for backwards compat but are no longer called from the web app.

3. LIBRARY (sub-page of Games)
- Steam library list with search, category filter chips, sort, co-ownership avatar stacks, PLAN shortcut

4. COMMUNITY
- Crew carousel (admin button gated to Parent)
- Recent clips & captures grid
- Activity timeline
- Forums table (channels)
- Clubs cards
- Upcoming events with date tiles + RSVP
- Weekly leaderboards

5. ACHIEVEMENTS (placeholder)
- Island-specific badges for attendance/participation/milestones
- No competitive pressure or grind

6. DISCORD + STEAM INTELLIGENCE (CORE VALUE)
PRIMARY PROBLEM TO SOLVE:
"Who can play what together right now?"
- Detect online Discord members
- Cross-reference Steam libraries
- Recommend games that everyone owns + fit group size + session length
- Surface best matches, near matches (one missing), dormant libraries

7. DISCORD INTEGRATION
- Thin Discord bot backed by website logic
- Slash commands: /whatcanweplay (live), more planned
- Future: automated weekly digest

8. ADMIN
- Hub of 8 tinted tiles → sub-pages
- Role-gated to Discord "Parent" role
- Configuration (Discord server + AI provider merged), News (external feeds + game news curation + drift log merged), Data Sync (connectors + live log), Members & Roles, Game Nights & Events (game night mod + recommendation tester merged), Forum Moderation, Game Library, Audit Log
- Tournaments deliberately removed — no near-term plans to implement

VISUAL SYSTEM:
- Tropical sky/ocean/beach scene (full-bleed fixed background, z-index -10)
- Day/night themes:
  - Night = deep navy sky + stars + moon
  - Day = blue sky + clouds + sun
  - Toggle in user menu; sun/moon does an arc-dip transition (1.1s drop, 1.5s rise) during switch
- Palm trees frame the viewport (left + right SVG silhouettes with chunky trunks, rings clipped to trunk, 12 fronds, coconut cluster) with sway loop + scroll parallax (rise + scale + fade)
- Theme color tokens are CSS variables (`--bi-app-bg`, `--bi-panel-bg`, etc.) swapped via `:root[data-theme="day"]` so components stay token-driven
- Translucent glass panels (`backdrop-filter`) sit over the scene
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
- Many activity/news/streams/wishlist/forum/club/event/leaderboard cards currently render mock data — wire to real API endpoints as backend grows

CURRENT STATE:
- React + Vite + TypeScript monorepo (`apps/web`, `apps/api`, `apps/bot`, `packages/shared`)
- Discord OAuth + guild gate working
- Steam linking via official Steam OpenID 2.0 (`GET /steam/openid/start` → `GET /steam/openid/return` with check_authentication round trip). Surfaced in the UI through:
  - **Onboarding modal** shown post-login if the user hasn't linked Steam and hasn't dismissed it (Steam-branded panel, big "Sign in through Steam" CTA, tiny "no thanks, skip for now" link; dismissal stored per-user in `localStorage`).
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
- Home Activity Feed: capped at 5 events (`ACTIVITY_FEED_LIMIT`). "View full feed — N more →" button + section header "Open community →" both navigate to Community. `SectionHead` now accepts optional `onAction` callback.
- General news ingestion: 60-minute server-side cooldown (`lastIngestedAt` + `INGEST_COOLDOWN_MS`) prevents hammering RSS feeds; frontend news/activity poll interval 20 minutes (was 5). AI summaries computed once per article and shared across all users — no per-user AI queries.
- News pipeline (v3, May 2026):
  - **Source registry** (`news_source_registry`, migration 037): RSS / Reddit / YouTube / GNews providers behind a `NewsProvider` interface. ~36 curated presets + admin-added custom sources. Pluggable. See `apps/api/src/lib/news/providers/`.
  - **Embeddings clustering** (`embedding vector(1536)`, pgvector, migration 040): OpenAI `text-embedding-3-small` ($0.02/1M) on every new article; cosine similarity > 0.85 against last-14d curated primaries absorbs duplicates as siblings (URL folded into parent's `ai_sources`, no LLM curation needed). Deterministic, replaces fragile fingerprint-only clustering. Postgres runs `pgvector/pgvector:pg16` image. Backfill via admin "Embed Missing Articles" button (POST `/news/general/embed-backfill`).
  - **Multi-layer dedup**: (1) pre-cluster AI pass assigns `ai_story_fingerprint` `<entity>:<event-topic>`, (2) AI in-batch merge if siblings co-located, (3) AI cross-pass merge against recent primaries, (4) display-time SQL collapse by entity + week bucket (`GET /news/general` window function). Layers stack — each catches what prior misses.
  - **Re-curate job** (`POST /news/general/recurate` → background, polled via `GET /news/general/recurate/status`, cancellable via `POST /news/general/recurate/cancel`). Tracks `processed / curated / merged / duplicates / failed / costUsd`. Surfaced live in admin with progress bar + breakdown.
- AI provider stack (May 2026):
  - **Per-provider API key slots** (migration 041): `anthropic_api_key` / `openai_api_key` / `gemini_api_key` — independently configurable, legacy `ai_api_key` kept as fallback. Each pasted in Admin → System → AI Settings.
  - **Three providers wired**: Anthropic (Claude), OpenAI (GPT), Google (Gemini). Provider class per vendor in `apps/api/src/lib/ai/providers/`. Default Gemini model is `gemini-2.5-flash-lite` (~30× cheaper than Sonnet, sufficient for structured curation).
  - **Cost telemetry** (`ai_cost_ledger`, migration 042): every billable AI call upserts into today's row via `recordAiCost` in `lib/ai/usageTally.ts`. Surfaced in admin AI Health card as `Today: $0.XX · N calls (warn ≥ $5)` chip; warn-only banner appears when over `ai_daily_cost_warn_usd` threshold (default $5). Endpoint `GET /settings/ai-cost-today`. Per-call cost also logged inline (`[ai:usage] ... est=$0.0XXX`).
  - **Tagline generator** now uses `getAIProvider()` abstraction (was hardcoded Anthropic).
- Background news refresh: `setInterval` in `server.ts` triggers `ingestAndCurateGeneralNews()` every 4 hours guaranteeing fresh content even with zero traffic. Page-load triggers still fire (≥1hr cooldown). Manual admin button bypasses cooldown entirely.
- Admin panel: consolidated from 12 tiles to 8. Server Config + AI Settings → Configuration; News Sources + News Curation → News (+ game news curation trigger); Game Night Mod + Recommendation Tester → Game Nights & Events. Tournaments removed entirely. Data Sync is now observability-only (connectors + live log).
- Real-data wired pages: Home (Featured + Friends Online + Activity Feed + Drift Log), Games (AI session composer reads composer recs / falls back to featured, Patches rolodex from Steam News, Group Wishlist from real crew wishlists), Library (full crew list with avatars + MINE badge), Community (activity timeline), Admin (News Curation CRUD + server settings + AI settings + news sources), Profile, Topbar, scheduled-nights cards. Live streams drawer + remaining Community cards (crew carousel, clips, forums, clubs, events, leaderboards) + most other Admin sub-pages remain mock until ingestion pipelines land.

ASSISTANT EXPECTATIONS:
- Assume this is a long-lived project
- Do NOT over-scope features
- Bias toward maintainable, incremental solutions
- Explain architectural decisions briefly when relevant
- Ask clarifying questions ONLY if strictly necessary
- Use industry standard best practices