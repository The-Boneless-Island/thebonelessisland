# Boneless Island — UI/UX Improvement Plan

_Last updated: 2026-06-11. Based on a full code audit of `apps/web/src` (admin panel, all user-facing pages, theme system, scene shell)._

This document is the implementation plan for the next round of UX work. It is organized as six phases, each independently shippable. Phase 1 (admin reorganization) is the priority and is specified in the most detail.

---

## 1. Current-state summary (what the audit found)

### Admin panel
- The hub → domain (People / Content / Engagement / System) → Operations/Settings-tab structure is sound at the top level, but **settings are separated from the features they configure**. Example: the news feed on/off lives both in Content → News Pipeline (status banner, `Admin.tsx:2856`) *and* as a `news_general_enabled` settings card — and they don't stay in sync without a refresh.
- **AI configuration is split across two pages**: AI Health (status, cost, read-only enabled badge — `Admin.tsx:283`) and AI Settings (provider, model, keys, interactive toggle — `Admin.tsx:3869`). Users hunting "where do I turn AI off" have two plausible destinations.
- **News Pipeline is five concerns on one page** (`Admin.tsx:1023`): external feeds config, game-news curation, AI validation failures, Steam profile context stats, and the hand-authored Drift Log.
- **Content domain is overloaded**: Library metadata, news, patch sources, game nights, and recommendation tuning all live there.
- **Save patterns are inconsistent**: settings cards always show Save; Discord Bridge hides Save until dirty; News Sources toggles save instantly with no button; AI Settings has per-section Saves.
- **Placeholder UI consumes real estate**: disabled member Edit buttons (`Admin.tsx:1615`), an empty "Live log" section (`Admin.tsx:1418`), an always-empty active-sessions block (`Admin.tsx:1644`).
- High-danger settings define `confirmPhrase` metadata (`settingMeta.ts`) but the UI never prompts for it.
- Global settings search is good, but it only indexes settings — not operations pages (e.g. searching "AI" doesn't surface AI Health), and in-domain search only covers the Settings tab.
- `Admin.tsx` is a ~4,800-line single file, which makes every one of these fixes harder.

### User-facing pages
- **Loading**: almost no skeletons. Achievements and Milestones block the whole page on a "Loading…" line; most other pages pop in.
- **Readability**: 10–11px uppercase mono labels throughout; `textMuted` (`#94a3b8`) is borderline WCAG AA on dark glass; news subtitles render at 12px with 0.8 opacity; some feeds have no max line width.
- **Keyboard/a11y**: no `:focus-visible` styles anywhere (browser default only, often invisible on glass); game art is CSS `background-image` with no accessible name; carousels are scroll-only.
- **Topbar search is decorative** — accepts input, filters nothing.
- **Two nav items lead to "Coming soon" pages** (Leaderboard, Nuggies History).

### Visual system
- Token architecture (theme.ts + islandUi.tsx + scene shell) is strong and cohesive. Day/night with celestial dip animation is a highlight feature.
- Gaps: ~40 hardcoded hex values bypass tokens (tag colors, avatar palettes, gradients, shadows); border radii drift (6/8px where tokens say 10/12/14); no generic shadow tokens for card hover states.
- Only two local image assets exist (logo + Steam mark). Game tiles hotlink Steam CDN headers hardcoded in `assets.ts`. The mascot ("boneless nugget") exists only as a concept — every empty-state slot says `TODO: real art`.
- The login screen has its own one-off palm SVGs with hardcoded greens, disconnected from the scene shell.

---

## 2. Phase 1 — Admin panel reorganization (priority)

### Design principles

1. **One concern, one page.** No page hosts two unrelated workflows.
2. **Settings live with their feature.** Kill the Operations/Settings tab split. The page that *operates* the news pipeline also *configures* it. A "Settings" section sits on each feature page; the standalone settings browser survives only as the search surface.
3. **One control per fact.** A toggle appears in exactly one place. Anything shown elsewhere is a read-only status chip that links to the control.
4. **Search-first.** A persistent search box in the admin header indexes settings *and* pages *and* named sections, and deep-links to an anchored, briefly-highlighted target.
5. **Placeholders earn their space or leave.** Unbuilt features collapse to a single muted "planned" line or disappear.
6. **Danger is a place, not a sprinkle.** High-risk settings render in a visually distinct "Danger zone" block at the bottom of their feature page, and `confirmPhrase` is actually enforced.

### New information architecture

Replace hub→domain drill-down with a **persistent admin sidebar** (collapsible on mobile), grouped by task area. Every page gets its own route under `/admin/*` so everything is deep-linkable and the browser back button works.

```
/admin                     Dashboard
├─ PEOPLE
│  ├─ /admin/members       Members & Roles (roster, presence, role mapping)
│  └─ /admin/forums        Forum Moderation (reports, categories, bans, mod log)
├─ GAMES
│  ├─ /admin/library       Game Library (featured pick, tag overrides)
│  ├─ /admin/game-nights   Game Nights (defaults, active sessions)
│  └─ /admin/recommender   Recommendation Engine (weights, test-run)
├─ NEWS
│  ├─ /admin/news          Gaming News (external feeds + curation + validation failures)
│  ├─ /admin/patch-sources Patch Sources (per-game RSS escape hatch)
│  └─ /admin/drift-log     Drift Log (hand-authored cards)
├─ ECONOMY
│  ├─ /admin/economy       Economy Operations (grant/deduct, attendance, top holders)
│  ├─ /admin/shop          Shop Items
│  └─ /admin/economy-rules Economy Rules (all nuggies_* settings + danger zone)
├─ NUGGIE AI
│  ├─ /admin/ai            AI Provider (merged Health + Settings: status, provider,
│  │                       model, keys, cost, test connection — one page)
│  └─ /admin/persona       Nuggie Persona (system prompt, tone, emoji, announcements)
├─ DISCORD
│  ├─ /admin/guild         Guild Identity (guild id, display name, role names — danger zone)
│  └─ /admin/bridge        Discord Bridge (milestone channel, tier roles)
└─ SYSTEM
   ├─ /admin/sync          Data Sync (connectors, future live log)
   └─ /admin/audit         Audit Log
```

Rationale for the notable moves:

| Move | Why |
|---|---|
| Merge AI Health + AI Settings → `/admin/ai` | Ends the two-destination problem. Page order: status banner (single enabled toggle) → provider/model → keys → cost warning + today's spend → test connection. |
| AI validation failures → `/admin/news` | They are a news-curation quality signal; the person tuning curation needs them next to the re-curate button. Add a "configure AI →" link chip for the cross-cutting case. |
| Steam profile context stats → `/admin/sync` | It's sync telemetry, not news config. |
| Drift Log → own page | Manual authoring is a different workflow from pipeline configuration. |
| Split Game Nights from Recommender | Sliders + test-run is a tuning console; game-night defaults are event config. Different mindsets. |
| Split Economy into Operations / Shop / Rules | The current single page mixes daily ops (grants) with rarely-touched policy (loan rates). Rules page hosts all 14 `nuggies_*` settings, with `nuggies_enabled` in its danger zone. |
| Guild identity gets its own small page | `discord_guild_id` and `parent_role_name` are the two most dangerous settings in the app; they deserve isolation, not a "People settings" tab. |

### Dashboard (`/admin`)

Replaces the hub. Contents:
- **Health strip**: AI status chip, news pipeline last-run chip, Steam sync chip, open-reports count, onboarding-queue count. Each chip links to its page. (Reuses existing status data; this is where read-only duplicates of toggles are allowed.)
- **Quick actions**: keep the existing six cards (`Admin.tsx:594`) — they map cleanly onto the new routes.
- **Persistent search** (also in the header on every admin page — see below).

### Admin search v2

- Extend the index in `settingMeta.ts` to cover three record types: `setting`, `page`, `section`. Pages and sections get the same `label/description/tags` treatment settings already have.
- Result rows show type badges (⚙ setting / 📄 page / § section) and navigate to `route#anchor`; the target section flashes its border (reuse the 2200ms "Saved" flash pattern).
- Mount the search input in the admin header bar on every admin page, not only the hub. Add a `/` keyboard shortcut to focus it.

### Unified save model

Adopt one rule everywhere:
- **Toggles and selects**: save immediately on change, confirmation toast, no Save button. (Matches News Sources today.)
- **Text, number, textarea, key inputs**: explicit Save button, always visible, disabled until dirty. (Matches SettingCard today; Discord Bridge's hidden-until-dirty button changes to disabled-until-dirty.)
- **High-danger settings**: Save opens a confirm dialog that requires typing the `confirmPhrase` from `settingMeta.ts`. Build one `ConfirmPhraseDialog` component; replace bare `window.confirm` for destructive deletes (categories, patch sources) with it too (without phrase, just styled confirm).

### Placeholder policy

- Members roster: remove disabled Edit buttons; keep the explanatory note as one line under the section title.
- Data Sync live log: collapse to a single muted line "Streaming log planned — telemetry not collected yet."
- Game Nights active sessions: render the section only when sessions exist; otherwise one-line empty state.

### Implementation steps (sequenced)

1. **Split `Admin.tsx`.** Mechanical extraction first, zero behavior change: one file per subpage under `apps/web/src/pages/admin/` (`MembersPage.tsx`, `NewsPage.tsx`, …), shared bits (`Field`, `smallBtn`, status banner) into `pages/admin/adminUi.tsx`. The status banner gets formally componentized (`AdminStatusBanner` with icon/title/toggle props) since four pages re-implement it.
2. **Add admin routes.** Register `/admin/*` child routes; build `AdminLayout` with sidebar + header (search slot) that wraps all admin pages. Old query/tab-state navigation redirects to the new routes.
3. **Re-slice pages** per the IA table: move AI Health content into `/admin/ai`, move validation failures into `/admin/news`, move Steam context stats into `/admin/sync`, split economy, split game nights/recommender, isolate guild identity.
4. **Inline settings onto feature pages.** Each page imports its settings from `settingMeta.ts` by key list and renders them via the existing `SettingCard` in a "Settings" section; remove the per-domain Settings tab. Delete the duplicated news toggle banner control (banner becomes read-only status + the SettingCard is the single control) — or wire both to shared state; single control preferred.
5. **Search v2** (index pages/sections, header mount, anchor flash, `/` shortcut).
6. **Save-model pass + `ConfirmPhraseDialog`.**
7. **Placeholder cleanup.**

Steps 1–2 are pure refactor and can merge alone. Steps 3–4 are the visible reorganization. 5–7 are polish and can trail.

### Acceptance criteria

- Every admin concern reachable in ≤ 2 clicks from `/admin` (sidebar group → page).
- Every setting key from `settingMeta.ts` renders on exactly one feature page; the global search still finds all of them and now also finds all 17 pages.
- No interactive control for the same setting exists in two places.
- Typing the wrong confirm phrase blocks saving `discord_guild_id`, `parent_role_name`, `nuggies_enabled`, `ai_provider`, and key fields.
- `Admin.tsx` is under 300 lines (routing glue only).

---

## 3. Phase 2 — Readability & accessibility pass

Small, high-leverage, mostly token-level changes.

1. **Minimum text size 12px.** Raise all 9–11px uppercase mono labels (MegaMenu group labels, news kickers, tag chips, admin section labels) to 12px; where the tiny look matters, keep tracking/uppercase but not sub-12px sizes.
2. **Contrast bump for muted text.** Night `textMuted` `#94a3b8` → `#a3b2c7`; day `#64748b` → `#566273`. Verify both ≥ 4.5:1 against `panelBg` over the busiest scene region (use the ocean band as worst case, since panels are translucent). Remove the `opacity: 0.8` stacked on already-muted news subtitles (`GamingNews.tsx`).
3. **Global `:focus-visible` style.** Add to `SceneGlobalStyles`: `outline: 2px solid var(--bi-primary-glow); outline-offset: 2px; border-radius: inherit`. This single rule fixes keyboard navigation across the whole app.
4. **Accessible names for image cards.** Game cards/tiles that use CSS `background-image` get `role="img"` + `aria-label={game.title}`; the topbar logo button gets `aria-label="Home"`.
5. **Line-length caps.** `maxWidth: "68ch"` (token already exists in theme.ts) on activity feed rows, news list bodies, and forum post bodies.
6. **Keyboard access for the crew carousel** (`Community.tsx`): make cards focusable, arrow-key scroll, or at minimum ensure native tab order reaches each card.
7. **Reduced-motion audit**: already good in the scene shell; extend the same media query to card hover transforms and the hero entrance animation.

Acceptance: axe-core scan of Home, Library, News, Forums, Admin dashboard reports no contrast or name violations; every interactive element shows a visible focus ring when tabbing.

---

## 4. Phase 3 — Loading, empty states & feedback

1. **Skeleton primitives.** Add `IslandSkeleton` (shimmering glass block honoring `prefers-reduced-motion`) and compose: `SkeletonCard`, `SkeletonRow`, `SkeletonStatRow` in `islandUi.tsx`.
2. **Kill full-page blockers.** Achievements (`Achievements.tsx:87`) and Milestones render their layout immediately with skeleton fills instead of a centered "Loading Nuggies…" line.
3. **Skeletons on**: Home (news card, activity feed), Games (patches rolodex, scheduled nights), Community (leaderboard), Gaming News (list), admin tables (roster, top holders, audit log).
4. **Empty states get the mascot slot.** One `IslandEmptyState` component: art slot (placeholder gradient until Phase 5 art lands) + island-voiced copy from `islandCopy.emptyStates` + optional action button. Replace ad-hoc empty paragraphs everywhere.
5. **Topbar search: make it real or remove it.** Recommended: client-side quick-switcher over pages + library games + crew names, opened with `Ctrl/Cmd+K`, reusing the admin search list UI. If descoped, remove the input — a dead search box damages trust in the whole UI.
6. **"Coming soon" honesty.** Remove Leaderboard and History from the MegaMenu (they already carry "soon" badges) *or* keep the badge but route to a single styled teaser card with the roadmap line. Don't ship two different placeholder pages.

---

## 5. Phase 4 — Visual-debt cleanup (tokens)

1. **Shadow tokens.** Add `islandTheme.shadow = { cardIdle, cardHover, focusRing, glowPrimary, glowTool }`; replace the one-off hover shadows in `islandUi.tsx:313`, `GamingNews.tsx:556`, `LoginScreen.tsx:367`, Milestones/Achievements tier glows (tier glow colors can stay data-driven, but the shadow *shape* becomes the token).
2. **Categorical palettes into the theme.** Move `TAG_CATEGORY_COLORS` (21 hexes, `islandUi.tsx:622`), avatar palettes (`CrewAchievements.tsx:35`), and `COMMUNITY_ACTOR_COLORS` (`Community.tsx:301`) into `theme.ts` as `palette.tags`, `palette.avatars`. They can stay theme-static (intentional), but one definition each.
3. **Radius normalization.** Sweep `borderRadius: 6` and `borderRadius: 8` → `islandTheme.radius.control` (10) except tag chips/thumbnails where 6–8px is a deliberate compact look — if kept, name it `radius.chip`.
4. **Fallback-gradient token** for missing game art (replaces hardcoded `#0b1220→#132640` in `IslandGameCard`).
5. **Login screen joins the scene.** Drop the one-off palm SVGs in `LoginScreen.tsx`; render the login card inside `IslandSceneShell` (it already mounts globally — remove the redundant local decoration and hardcoded greens).

---

## 6. Phase 5 — Aesthetic & vibes upgrades

The scene shell is the product's signature; these deepen it without redesigning it. All ambient additions must respect `prefers-reduced-motion` and stay GPU-cheap (transform/opacity only).

1. **Water reflection of the celestial body.** A vertical glimmer column on the ocean band under the sun/moon (gradient + slow opacity shimmer). Highest vibe-per-effort item; it also visually ties the sky layer to the ocean layer during the day/night dip animation.
2. **Night ambience**: 3–5 slow-drifting firefly dots near the beach band; existing shooting star stays.
3. **Day ambience**: 1–2 distant bird silhouettes (tiny SVG, long-period flight path), optional sail on the horizon.
4. **Beach props layer**: small static SVGs at the beach band — driftwood, a bottle, at night a faint bonfire glow. Pure decoration, one component, randomized per visit from a small set (seeded by date, matching the existing shooting-star date trick).
5. **Mascot art program.** This is the single biggest "vibes" unlock — the brand has a mascot with zero artwork. Define the asset list now so commissioning/generation is concrete:
   - `nugget-wave.svg` — empty states (friendly greeting)
   - `nugget-snooze.svg` — "nothing live right now" states
   - `nugget-shrug.svg` — error states / 404
   - `nugget-diver.svg` — loading (replaces text spinners; nods to the submarine motif in STYLE_GUIDE.md)
   - `nugget-crown.svg` — leaderboard / milestones celebration
   Store in `apps/web/public/mascot/`, wire into `IslandEmptyState` and the celebration overlay. Until real art exists, ship the slots with a simple silhouette placeholder so layout is final.
6. **Per-page scene accents (subtle).** Keep one global scene, but let pages tint it: a CSS variable the scene reads for vignette hue — e.g. News leans cooler, Casino leans warmer/sunset. One variable, big perceived variety, no extra layers.
7. **Own the tile imagery.** `assets.ts` hardcodes Dota 2 / CS:GO Steam CDN headers for the Games/Tools tiles — neither game is brand-relevant and hotlinks can break. Replace with either (a) commissioned island-style tile art, or (b) dynamic selection from the crew's actual most-played library games (more personal, zero art cost). Game-night banner rotation can keep Steam headers since those *are* the games being played.
8. **Day-mode polish check.** Day theme is newer than night; audit every page in day mode for washed-out glass (the `rgba(255,255,255,0.78)` app background over the bright sky needs spot checks, especially text on the sand-colored `panelMutedBg`).

---

## 7. Phase 6 — Page-level UX refinements

Smaller items, batched by page:

- **Home**: the 4s hero entrance is long for returning users — play it on first visit per session only (sessionStorage flag), instant thereafter.
- **Library**: persist filter/sort in the URL query so links and refreshes keep state; add result count ("23 games · 14 owned by crew").
- **Gaming News**: filter pills + tabs + genre + platform is a lot of chrome — collapse genre/platform behind one "Filters" popover; keep the four main tabs.
- **Forums**: compose view should preserve draft text on accidental navigation (sessionStorage); thread view needs the 68ch cap from Phase 2.
- **Games page**: the 1.4fr/1fr split row works, but SessionComposer's AI pick deserves a stronger result presentation — reuse the featured-news card treatment for the picked game (art + gradient overlay).
- **Recommender weight sliders** (admin, but UX): add one-line explanations under each slider ("Library overlap — how much owning the game matters") and a "reset to defaults" link; surfaced in Phase 1's `/admin/recommender` page.
- **UserMenu**: add the day/night toggle's current mode label ("Night · auto") so users discover the auto mode exists.

---

## 8. Sequencing, sizing, and dependencies

| Phase | Scope | Size | Depends on |
|---|---|---|---|
| 1. Admin reorg | Routing, sidebar, page re-slice, search v2, save model | L (the file split is half the work) | — |
| 2. Readability & a11y | Tokens, focus ring, sizes, aria | S | — |
| 3. Loading & empty states | Skeletons, empty-state component, topbar search decision | M | benefits from 2's tokens |
| 4. Visual-debt cleanup | Shadow/palette/radius tokens, login scene merge | S–M | — |
| 5. Vibes | Scene ambience, mascot program, tile imagery | M (art is the long pole) | 3 (empty-state slots) |
| 6. Page refinements | Per-page batch | S | 2, 3 |

Recommended order: **1 → 2 → 3 → 4 → 6 → 5**, with the mascot art commissioned/generated in parallel from day one since it gates Phase 5's payoff.

Phases 2 and 4 are safe "in-between" work whenever Phase 1 review is pending.

### Out of scope (deliberately)

- No voting UI anywhere (removed by design — see STYLE_GUIDE.md).
- No redesign of the scene shell architecture or the day/night system — additions only.
- No nav IA changes to the user-facing MegaMenu beyond the Coming-soon cleanup; the Games/Community/Nuggies grouping tests fine.
- Friends Online card stays in the top-right of Home (locked decision).

---

## 9. Quick-reference: settings → new admin page map

| Setting keys | New home |
|---|---|
| `discord_guild_id`, `guild_display_name`, `parent_role_name` | `/admin/guild` (danger zone) |
| `news_general_enabled`, `news_rss_sources`, `newsapi_key`, `news_dev_cap` | `/admin/news` |
| All 14 `nuggies_*` | `/admin/economy-rules` (`nuggies_enabled` in danger zone) |
| `ai_enabled`, `ai_provider`, `ai_model`, `*_api_key`, `bedrock_region`, `ai_daily_cost_warn_usd` | `/admin/ai` |
| `nuggie_system_prompt`, `nuggie_tone_rules`, `nuggie_emoji_palette`, `achievement_announcements_enabled` | `/admin/persona` |
| `milestone_announcements_enabled`, `milestone_channel_id`, `milestone_role_rank_*` | `/admin/bridge` |
