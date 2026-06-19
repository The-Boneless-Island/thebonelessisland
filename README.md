# The Boneless Island

Discord-first community web platform with optional Steam linking. Tropical island theme, day/night themes, parallax palms, live AI-driven session planning and news curation.

## What is included

- `apps/web`: React + Vite + TypeScript. Fixed topbar with a MegaMenu (Games / Community / Nuggies groups) + an Admin link; Home is the root route via the brand logo. Discord-style user menu, full-bleed scene shell (sky + sun/moon + ocean + beach + parallax palms), day/night theme switch.
- `apps/api`: Express API with Discord OAuth, profile routes, Steam link/sync, rule-based + AI recommendations, game-night CRUD + RSVP, AI chat, AI news curation (Steam game news + external RSS/GNews pipeline).
- `apps/bot`: Thin Discord bot exposing `/whatcanweplay` and delegating recommendation logic to the API.
- `packages/shared`: shared cross-app TypeScript types.
- `infra/docker-compose.yml`: local Postgres container.

## Data and privacy defaults

- Discord OAuth is the only sign-in method.
- Discord user ID is the canonical identity key.
- Login is restricted to members of the configured Discord guild (`DISCORD_GUILD_ID`).
- Steam linking is optional and can be removed by users. Linking is done via the official Steam OpenID 2.0 flow ("Sign in through Steam"); we never ask for or store Steam credentials.
- Steam data is used read-only for overlap/recommendation features.
- Recommendations API access is restricted to authenticated web sessions or trusted bot requests.
- No password or email account storage.

## Authentication behavior

- The web app shows a login landing page for unauthenticated visitors.
- Users authenticate via `GET /auth/discord/login`.
- OAuth callback enforces guild membership by checking:
  - `GET https://discord.com/api/users/@me/guilds/{DISCORD_GUILD_ID}/member`
- Non-members are redirected back to the web app with an auth error state.

## Local setup

1. Copy `.env.example` to `.env` and fill required Discord/Bot/Steam values.
   - Set `BOT_API_SHARED_SECRET` to the same value for both API and bot runtime.
   - **AI (optional)**: set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` as env-var fallbacks. You can also configure these at runtime in Admin → AI Settings — the DB value takes priority over the env var.
2. Start Postgres:
   - `docker compose -f infra/docker-compose.yml up -d`
3. Install dependencies:
   - `npm install`
4. Run DB migrations (includes AI settings, news curation columns, playtime columns, general_news table + news settings):
   - `npm run db:migrate -w @island/api`
5. Start all services:
   - `npm run dev`

Web app: `http://localhost:5173`
API health: `http://localhost:3000/health`

`VITE_API_BASE_URL` (web) defaults to `http://localhost:3000`. Vite is locked to port 5173 (`strictPort`) and reads env from the repo root via `envDir: "../../"`.

## Information architecture

Top nav (fixed topbar with backdrop blur — `position: fixed` so it stays anchored during overscroll/rubber-band):
- **Home** — hero with online count + display headline + CTAs, Gaming News feed (external RSS/GNews, AI-curated, tab-filtered by label, article detail modal), Friends Online widget (live Discord presence), Discord-style Activity Feed (5-tab filter, capped at 5 events with "View full feed" link to Community), Drift Log news cards, Bot CTA + Crew Ritual cards
- **Games** — AI session composer (combined AI pick + crew roster + invite), Patches & Updates rolodex (sticky right column), scheduled game nights with RSVP, group wishlist with hype bars, library snapshot, live streams drawer (right-edge tab)
- **Community** — crew carousel (admin button gated to Parent), recent clips, activity timeline, forums table, clubs, upcoming events, weekly leaderboards
- **Crew Achievements** (under Community) — placeholder
- **Admin** — sidebar over 18 deep-linkable pages (Dashboard, Members & Roles, Forum Moderation, Game Library, Game Nights, Recommendation Engine, Gaming News, Patch Sources, Drift Log, Economy Operations, Shop Items, Economy Rules, AI Provider, Nuggie Persona, Guild Identity, Discord Bridge, Data Sync, Audit Log). Gated to Parent role.

User menu (avatar dropdown): Discord profile + custom status + rich presence + status picker + theme toggle (Day / Night) + Profile + Sign out.

## Member activity and voice status

- "Friends online" pulls from synced snapshots in `guild_members`.
- The web app auto-syncs profile/member/game-night data in the background for live updates.
- `POST /members/sync` can still be called directly for operational/manual sync workflows.
- Voice status is resolved by per-user Discord voice state lookups (`GET /guilds/{guildId}/voice-states/{userId}`).
- If a user is not in voice, Discord returns `404` for that user, which is treated as normal.

## Game image sourcing

- Game image enrichment is modularized in `apps/api/src/lib/gameCatalogEnrichment.ts`.
- Image provider order is declarative via `GAME_IMAGE_PROVIDER_PRIORITY`.
- Current provider chain: `steam -> cheapshark -> igdb` (IGDB scaffolded and disabled by default).
- Game metadata stores image provenance/check fields (`header_image_provider`, `header_image_checked_at`).
- Optional IGDB fallback envs: `IGDB_IMAGE_FALLBACK_ENABLED`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`.

## Game nights — voting mechanic removed

The voting flow that previously surfaced game blades + Hype/Maybe/Skip is **intentionally removed from the UI**. The new flow:
- Hosts schedule a night and pick the game directly (or accept the AI recommendation).
- Crew RSVPs to lock a seat.
- The AI session composer (Games page) surfaces a recommended pick with reasoning, mode chips (Tonight/Weekend/Quick/Cozy/Spicy), crew roster, when/where, and a Send invite footer.

Vote-related API endpoints (`/game-nights/:id/votes`, `/finalize`) remain alive on the API for backwards compat but are no longer called from the web app.

## UI design system

- Theme tokens + shared copy: `apps/web/src/theme.ts` (CSS variables + tropical palette + glass + motion + font + prose).
- Reusable themed primitives: `apps/web/src/islandUi.tsx`.
- Scene shell + day/night context: `apps/web/src/scene/`.
- Brand and design guidance: `STYLE_GUIDE.md`.
- Cursor project rules for persistent style behavior: `.cursor/rules/`.

### Visual system

- Full-bleed sky → ocean → beach scene fixed behind content (z-index -10).
- Day mode: blue sky + white clouds + sun.
- Night mode: navy sky + stars + moon.
- Sun/moon arc-dip transition during theme switch (1.1s drop, 1.5s rise).
- Palm trees (left + right SVG silhouettes) sway with wind loops, rise + scale + fade as you scroll past the hero.
- Translucent glass panels over the scene via `backdrop-filter`.
- Fonts: Bricolage Grotesque (display), Inter (body), JetBrains Mono (mono).
- Honors `prefers-reduced-motion`.

## AI features

All AI features are provider-agnostic. The active provider, model, and API key are configured at runtime via **Admin → AI Settings** — no code changes or redeploys needed to switch providers.

### Supported providers
- **Anthropic** — `claude-haiku-4-5` (default), `claude-sonnet-4-6`, `claude-opus-4-7`, `claude-opus-4-6`
- **OpenAI** — GPT-4o Mini (default), GPT-4o
- **Google Gemini** — `gemini-2.5-flash-lite` (default)
- **AWS Bedrock** — Claude via cross-region inference profile (authenticates through the AWS credential chain; no API key)

### Features

**AI-curated Steam game news** (`apps/api/src/lib/newsCurator.ts`)
- Scores every Steam news article for community relevance (0–1) using live crew context: games played this week, owned titles, genre tags.
- Deduplicates stories covering the same event across multiple sources.
- Assigns a feed label — `personal` (crew is playing the game), `community` (crew trending), `top_news` (high-impact industry news).
- Flags spoilers for story-driven games with a warning badge.
- Articles are ordered by AI relevance score in the Patches & Updates rolodex.
- Developer diversity cap (`news_dev_cap` setting) limits how many games per studio enter the ingestion scope, preventing one prolific publisher from dominating the feed.
- Admin can trigger a full re-curate from Admin → Data Sync.

**External gaming news feed** (`apps/api/src/lib/generalNewsIngestion.ts`, `GET /news/general`)
- Pulls from up to 5 RSS outlets (PC Gamer, Rock Paper Shotgun, Eurogamer, Kotaku, IGN) and optionally GNews API.
- Articles are matched against crew game tags (genre/category from owned library) to build per-article `matchedTags`.
- New articles are AI-curated with the same scoring pipeline (relevance score, summary, label, spoiler gate).
- Results are served on the Home page Gaming News feed — separate from Steam game updates on the Games page.
- Ingestion runs automatically in the background on feed load; admin can trigger immediately from Admin → News Sources.

**Article detail modal** (Home page)
- Clicking any news card opens an in-app bottom sheet — no external navigation until the user explicitly chooses "Read full article".
- Sheet shows: hero image, source/author/timestamp, AI summary panel, "Why it's relevant to your crew" section (matched tags), full article text, and source link.
- Spoiler-gated articles blur the summary and require a tap to reveal before the modal will show the content.

**AI recommendation blurbs** (`apps/api/src/lib/recommendBlurb.ts`)
- Generates a one-sentence island-flavored blurb for the top game recommendation.
- Includes ownership count, session length, and which crew members played the game this week.
- Results are cached in memory for 30 minutes per (game, owner count) pair to avoid redundant calls.

**Crew chat** (`POST /ai/chat`)
- Conversational assistant with live crew context: who's in voice, best current pick, top owned games, this week's playtime.
- Chat history is trimmed server-side to an 800-char budget to keep input tokens predictable.
- Returns specific error codes (503 = AI not configured, 502 = provider error) for graceful UI handling.

### Token efficiency
- **Anthropic prompt caching**: system prompts are sent with `cache_control: { type: "ephemeral" }` — repeated calls within 5 minutes pay ~10% of normal input token cost for the cached portion.
- **Usage logging**: every AI call logs `in=Xtok out=Ytok cache_hit=Ztok` to stdout.
- **Compact crew context**: crew data is formatted in compact key-value style ("Game A(12) Game B(8)") rather than verbose prose.
- **In-flight guard**: a module-level lock prevents duplicate concurrent news curation batches.
- **Blurb cache**: 30-minute in-memory TTL per recommendation eliminates repeated blurb calls.

### Admin → AI Settings
Configure AI without redeploying:
- Enable / disable AI features globally
- Switch provider (Anthropic / OpenAI / Google Gemini / AWS Bedrock)
- Select or enter a custom model
- Store API key (masked in UI, never overwritten by placeholder values)
- Test the connection live

### Admin → News Sources
Configure the external gaming news pipeline without redeploying:
- Toggle individual RSS outlets on/off (PC Gamer, RPS, Eurogamer, Kotaku, IGN)
- Store GNews API key (optional; masked in UI)
- Set developer diversity cap (max games per studio in Steam ingestion scope)
- Enable/disable the external news feed globally
- Manual "Fetch & Curate" and "Curate Existing Articles" trigger buttons with live result feedback

## Phase 1 feature coverage (backend / API)

- Discord OAuth login + session cookie auth.
- Auto-create user/profile on first login.
- Profile read/update endpoint with safe preference fields. `/profile/me` now exposes `steamLastSyncedAt` so the UI can show a live sync timestamp.
- Steam linking via official Steam OpenID 2.0:
  - `GET /steam/openid/start` redirects to `https://steamcommunity.com/openid/login`.
  - `GET /steam/openid/return` performs the `check_authentication` round trip, extracts SteamID64 from `openid.claimed_id`, upserts `steam_links`, fires a `steam.linked` activity event, and bounces back to the web app with `?steam=linked`.
  - Falls back to `?steam=error&steamReason=...` for cancelled / verification-failed / not-authenticated cases.
- Steam owned-games + wishlist sync:
  - `POST /steam/sync-owned-games` — full library sync; captures all-time playtime (`playtime_minutes`) and 2-week playtime (`playtime_2weeks`) from `IPlayerService/GetOwnedGames`.
  - `POST /steam/sync-recent-games` — lightweight sync via `IPlayerService/GetRecentlyPlayedGames`; updates `playtime_2weeks` and `last_played_at` for recently active games, zeros out stale entries. Runs every 5 minutes in the background.
  - `POST /steam/sync-wishlist` — standalone wishlist sync.
- Rule-based recommendation endpoint:
  - exact overlaps
  - near matches (one missing owner)
  - scored ranking based on ownership, group fit, session length
  - protected access (logged-in user session or bot shared secret header)
- Featured recommendation endpoint (`GET /recommendations/featured`):
  - powers the Home Featured Game card
  - resolves scope to `voice` (members in voice) → falls back to `crew` (full guild)
  - enriches the top pick with header image / tags / player count / session length
  - attaches an AI-generated blurb when AI is enabled
- Crew library endpoint (`GET /steam/crew-games`):
  - powers the Library page and the AI session composer cover art
  - aggregates owners across the guild with display name + avatar URL
  - on-demand metadata + image enrichment for sparse rows
- Crew wishlist endpoint (`GET /steam/crew-wishlist`):
  - powers the Group Wishlist card on the Games page
  - aggregates pooled wishlists with hype count + earliest add date + crew avatars
- Steam game news endpoint (`GET /games/news`):
  - powers the Games page Patches & Updates rolodex
  - lazily ingests Steam News for the most relevant crew-owned apps (6h staleness window)
  - developer diversity cap limits each studio to `news_dev_cap` games (default 2) in the ingestion scope
  - filters out zero-score duplicates; orders results by AI relevance score
- External news endpoint (`GET /news/general`):
  - powers the Home page Gaming News feed
  - serves curated articles from `general_news` table (RSS + GNews)
  - background ingestion triggers automatically on each load
  - admin endpoints: `POST /news/general/ingest` (fetch + curate), `POST /news/general/curate` (curate only)
- Activity ledger (`activity_events` + `GET /activity`):
  - emitted by game-night creates / RSVPs / picks and Steam link / unlink / sync
  - powers Home page Activity Feed and Community activity timeline
  - server-side category mapping (`friends` / `achievements` / `milestones` / `patches`)
- News cards (`GET /news-cards`, Parent-only `POST/PATCH/DELETE`):
  - powers Home page Drift Log
  - admin CRUD lives in Admin → News Curation; gated by `requireParentRole` middleware (`PARENT_ROLE_NAME` env var, defaults to `Parent`)
- Discord slash command `/whatcanweplay` calling the API endpoint.

## Front-end implementation status

The full Boneless Island design (handoff bundle from Claude Design) has been ported across 8 phases:

1. **Foundation** — fonts, day/night theme switch, sun/moon arc-dip, stars + clouds, richer palm SVGs, scroll parallax, theme CSS variables.
2. **Topbar + IA** — sticky topbar with brand mark + nav + search + admin pill + user menu trigger; Discord-style user menu.
3. **Home redesign** — hero, featured game, friends online, activity feed, drift log, bot/ritual CTAs.
4. **Games rebuild** — AI session composer, patches rolodex, scheduled nights, group wishlist, library snapshot, live streams drawer. Voting UI removed.
5. **Library** — full Steam library page with filters, sort, co-ownership stacks.
6. **Community** — crew carousel, clips, activity, forums, clubs, events, leaderboards.
7. **Admin** — admin hub (since rebuilt into a sidebar over 18 deep-linkable `/admin/*` pages — see the admin description above).
8. **Polish + parity** — voting state cleanup; App.tsx down 62%.
9. **External news pipeline** — RSS + GNews ingestion, GeneralNewsItem type, article detail modal, developer diversity cap.

**Wired to real data**: Topbar profile + **Steam status badge** (logo + sync indicator next to the avatar), **Steam onboarding modal** (post-login prompt with Steam-branded "Sign in through Steam" button + tiny "no thanks, skip for now" link, dismissal persisted per-user in `localStorage`), **User-menu Steam panel** (Steam logo, "Synced 5m ago" / "Not linked" status, ID, Sync now / Sign in through Steam buttons), Home Friends Online widget, **Home Featured Game card** (top crew-overlap pick from `/recommendations/featured`, with AI blurb when enabled), **Home Activity Feed** (live `activity_events` ledger from game-night + Steam emitters), **Home Drift Log** (Parent-curated news cards via `/news-cards`), **Games AI session composer** (real recommendation for the selected crew with AI-generated blurb, falls back to the featured pick), **Games Patches & Updates rolodex** (live Steam News with AI relevance ranking, label chips — For You / Crew Trending / Top Gaming News — and ⚠ Spoilers badge), **Games Crew Chat** (conversational AI with live crew context — voice status, recent playtime, top recommendation), **Games Group Wishlist** (pooled crew wishlists from `/steam/crew-wishlist` with real cover art + hype bar), **Library page** (full crew library from `/steam/crew-games` with real owner avatars + per-game `★ MINE` badge), **Community activity timeline** (same `/activity` ledger), **Admin → News Curation** (full CRUD for drift-log cards), **Admin → AI Settings** (provider / model / API key / enable-disable / live connection test), **Admin → Data Sync** (manual re-curate news button), **Admin → News Sources** (RSS toggles, GNews API key, dev cap, ingest/curate triggers), Games scheduled-nights cards + RSVP, Profile (Steam link visibility + owned-games exclusions).

**Still mock for now**: live streams drawer, Community crew carousel + clips + forums + clubs + events + leaderboards, most Admin sub-pages outside News Curation. These need new ingestion pipelines (Twitch API, clips storage, forum schema) and will land incrementally.
