# The Boneless Island — Glossary

> Shared vocabulary for the project. When we name a feature, element, or workflow in
> conversation or in code, this is the canonical term. Living doc — add a row when a new
> term is coined; fix a row when meaning drifts.
>
> Companion docs: `.cursor/context.md` (project context), `STYLE_GUIDE.md` (design system),
> `DESIGN_NOTES.md` (durable rationale), `BACKLOG.md` (status).
>
> Last reviewed: 2026-06-20.

---

## 1. Commonly-confused pairs (read this first)

These get mixed up constantly. Get them right.

| This… | …is NOT this | The distinction |
| --- | --- | --- |
| **Patches & Updates** | **Gaming News** | Patches & Updates = per-game **Steam News** for titles the crew owns/wishlists (Games page). Gaming News = AI-curated **external** feed (RSS/Reddit/YouTube/GNews) at `/games/news`. |
| **Nuggies** (economy) | **Crew Achievements** | Nuggies = the in-app **currency / shop / casino**. Crew Achievements = crew-wide **Steam achievement** tracking. Different features, both under Community-ish nav. |
| **Gaming News content vote** | **game-night voting** | The up/down vote on Gaming News articles is a **live, intentional** content surface/sink (ranks articles). Game-night voting was **deliberately removed**. |
| **Friends Online** | **Activity Feed** | Friends Online = **live** Discord presence card (who's online now), top-right on Home. Activity Feed = **historical** ledger of past events. |
| **Drift Log** | **Gaming News** | Drift Log = **hand-authored** cards pinned on Home (admin CRUD). Gaming News = **AI-curated** external feed. |
| **The Boneless Island** | **Nuggie** | "The Boneless Island" = the **org / auth / control** brand (login, header, admin). "Nuggie" = the **AI/bot mascot voice only**. Two separate Discord apps. |
| **Nuggie** (mascot) | **Nuggies** (currency) | Singular capitalized = the mascot/AI persona. Plural = the currency. |

---

## 2. Brand & proper nouns

| Term | Meaning |
| --- | --- |
| **The Boneless Island™** | The platform / org identity. Used on login, header, footer, admin, marketing. The "control surface" brand. |
| **Nuggie** | Chicken-nugget mascot; the AI/bot **voice** (web chat, Discord slash commands, achievement announcements). DB-driven persona. Never used as the site's own brand. |
| **Boneless nuggets** | The mascot characters — nuggets with arms, legs, faces, gaming-themed. |
| **The Island** | The thematic setting: tropical beach, palms, ocean, reef. The ambience/identity layer. |
| **Crew** | The community members, collectively. Worldbuilding term for the guild/server. |
| **Nuggies** | The community currency. Earned via daily claim, attendance, activity; spent in shop/casino. |
| **Islander** | A single member (profile pages live at `/islanders/:userId`). |

---

## 3. Navigation & feature areas

| Feature area | Route | Notes |
| --- | --- | --- |
| **Home** | `/` | Hero, Featured Game, Friends Online (top-right), Activity Feed, Drift Log. |
| **Games** | `/games` | Plan-night composer, Patches & Updates, scheduled nights, Group Wishlist, "in game now" drawer. |
| **Gaming News** | `/games/news` | AI-curated external news feed. |
| **Library** | `/library` | Full crew Steam library; filters, sort, co-ownership. |
| **Community** | `/community` | Crew carousel, forums, activity timeline, events, leaderboards. |
| **Crew Achievements** | `/achievements` | Crew-wide Steam achievement tracking. |
| **Nuggies** | `/nuggies` | Economy home: balance, daily claim, shop, inventory, leaderboard. |
| **Nuggies Casino** | `/nuggies/casino` | Blackjack, Coinflip, Guess Number. |
| **Nuggies History / Milestones** | `/nuggies/history`, `/nuggies/milestones` | Transaction ledger; tier progression. |
| **Sunday Tide Check** | `/tide-check` | Weekly digest of crew activity (cron + announcement). |
| **Islander profile** | `/islanders/:userId` | Per-member profile. |
| **Admin** | `/admin/*` | Sidebar shell over ~18 deep-linkable admin pages, grouped (People / Games / News / Economy / Nuggie AI / Discord / System). |

Nav surfaces: **MegaMenu** (top nav, hover-expand groups), **Topbar** (brand + search + user menu), **MobileTabBar** (bottom nav ≤640px).

---

## 4. UI primitives (`islandUi.tsx`)

Themed building blocks. Prefer these over raw elements.

| Primitive | Purpose |
| --- | --- |
| `IslandButton` | Buttons: primary / secondary / cta / ghost / danger × sm/md/lg. |
| `IslandCard` | Sectional glass-blur panel. |
| `IslandTileButton` | Large promo tile with background image. |
| `IslandMemberChip` | Selectable member pill. |
| `IslandGameCard` | Selectable game row/card. |
| `IslandStatusPill` | Compact state badge (online/syncing/offline/playing/live). |
| `IslandEmptyState` | Empty-state template with mascot pose (wave/snooze/shrug/diver/crown). |
| `IslandIcon` | Icon renderer by name. |
| `CrewAvatar` | Member avatar with optional presence dot. |
| `PresenceRow` | Avatar + name + live activity text. |
| `ActionCard` | Icon + title + subtitle + count, interactive. |
| `NuggieChip` / `NuggieCoin` / `NuggieBadge` | Economy chips, currency glyph, achievement badge. |
| `FilterChip` / `GenreTag` / `SpecStrip` | Filter tag w/ count; genre/capability tag; dense key-value spec row. |

---

## 5. Design system & scene

| Term | Meaning |
| --- | --- |
| **Scene shell** | Full-bleed tropical background (sky/ocean/beach + parallax palms) fixed behind all content. `IslandSceneShell` wraps the app. |
| **Day / Night mode** | Two scene states (sun/clouds vs moon/stars). Driven by `data-theme="day|night"` on `<html>`; `useDayNight()` hook. Sun/moon arc-dip transition. |
| **Glass / translucency rule** | Panels sit at low alpha and **must** pair with `backdrop-filter: blur`. Nothing opaque over the scene. |
| **Design tokens** | Semantic CSS-variable colors in `theme.ts` (`appBg`, `panelBg`, `primary`, `danger`, `success`, `nuggieGold` #fbbf77, `limeEarned` #a3e635, tropical palette). |
| **Type** | Display = Bricolage Grotesque; body = Inter; mono = JetBrains Mono. |

---

## 6. Workflows

| Workflow | Entry |
| --- | --- |
| **Discord login** | `GET /auth/discord/login` → OAuth → `GET /auth/discord/callback`. Guild-gated. Only login method. |
| **Onboarding** / **Washed Ashore** | Post-login welcome flow. "Washed Ashore" = the user-facing name (new member washes up on the island). Implemented as an 8-step product tour (`components/OnboardingFlow.tsx`): dim scrim + `IslandCard` steps with feature previews, progress dots, persistent Skip. Covers Welcome → Profile → Steam (opt-in) → Gaming News → Forums → Nuggies → Casino → Home. Completion is **server-tracked** via `user_client_state` (not localStorage); gated on `onboarding_version < CURRENT_ONBOARDING_VERSION`. The old single Steam-link modal (`SteamOnboarding.tsx`) was retired. |
| **Steam link** | `GET /steam/openid/start` → `GET /steam/openid/return`. Steam OpenID 2.0. Opt-in enhancement, never required. |
| **Steam sync** | `POST /steam/sync-owned-games`, `…/sync-wishlist`. 30-min per-user cooldown; respond-then-enrich. |
| **Game night** | Create (`POST /game-nights`) → host picks game (`PATCH …/game`) → crew RSVP (`POST …/rsvp`). Host-driven, not voted. |
| **News ingest / recurate** | `POST /news/general/ingest`, `…/recurate`. Fetch + AI-curate external news; multi-layer dedup; cost-tracked. |
| **AI chat** | `POST /ai/chat`. Nuggie-voiced, per-user rate-limited, crew-context aware. |

---

## 7. Data & privacy terms

| Term | Meaning |
| --- | --- |
| **Canonical sharing rule** | A `(user, app)` pair is shareable iff `users.steam_visibility <> 'private'` AND no `steam_game_exclusions` row. |
| **`shareable_*` views** | SQL views that enforce Steam privacy. **Single enforcement point** — every crew-facing query reads the view, never the raw table. |
| **`user_client_state`** | Per-member server key/value store (migration 065). Schema: `(user_id, key TEXT, value JSONB, updated_at)`. Single extensible table for per-member flags that should follow the member across devices. Current keys: `onboarding_version`, `forum_intro_seen`, `steam_share_ack`, `theme_pref`, `last_unlock_seen_at`, `activity_last_seen_at`. Read via `GET /profile/me` (`clientState` field); written via `PUT /profile/client-state` (per-key zod-validated upsert). |
| **Nuggie Persona** | DB-driven AI voice config (system prompt, tone rules, emoji palette). |
| **`server_settings`** | Key-value admin settings table; "one control per fact" colocated on feature pages. |
| **Parent role** | The Discord role (`PARENT_ROLE_NAME`) that gates admin/mod endpoints (`requireParentRole`). |

---

*Coined a new term in code or chat? Add it here so we both mean the same thing next time.*
