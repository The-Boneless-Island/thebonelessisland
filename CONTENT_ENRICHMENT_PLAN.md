# Content Enrichment Plan

> **STATUS — IMPLEMENTED 2026-06-11.** All 6 phases built on branch `claude/intelligent-liskov-1938c1`. web + api + bot typecheck clean, vite build green. Migrations 049–053 added (additive; apply on next boot). Deferred minor polish: forum last-reply avatars, Friends-Online role badges, activity-feed per-type icons, CrewAchievements real per-user icons. See the per-phase checkboxes below — substantive items done; a few low-value `(verify)` micro-items intentionally skipped and listed in the closing notes.


Audit date: 2026-06-11 (branch `claude/intelligent-liskov-1938c1`). Four-agent code survey + spot verification.
Goal: surface the data the site already has (or can get nearly for free) — game art, store metadata, Discord identity, Steam player stats — everywhere the UI currently shows plain text or nothing.

**Verification notes:** Findings marked ✅ were spot-checked against current code. Items from agent sweeps not individually re-verified are marked (verify) — confirm file:line at implementation time. One agent claim was found stale and removed (Community page mock arrays — already wired). Voting UI was deliberately removed project-wide; nothing in this plan reintroduces vote tallies.

---

## Phase 0 — Privacy fix (do first, blocks everything that adds more player data)

**`steam_visibility` is not enforced on the game detail endpoint.** ✅ Verified: `GET /steam/game/:appId` owners query (apps/api/src/routes/steam.ts:1490-1509) and the achievements query below it join `user_games`/`user_game_progress` with **no** `steam_visibility` filter — per-user playtime and achievement counts leak for users set `private`. The profile endpoint does it right (members.ts:332-439, `steamHidden` check).

- [ ] Add `AND u.steam_visibility <> 'private'` (or mirror the members.ts gating) to the owners + achievements queries in `/steam/game/:appId`.
- [ ] Sweep other aggregate readers for the same hole: trending/"Hot this week" (steam.ts:1351-1388), CrewAchievements feed source, crew-owned/crew-wishlist endpoints. Decide policy for aggregates: either exclude private users' rows or only show de-identified totals.
- [ ] Add a regression test: private user owns game X → not listed in game detail owners.

Everything later in this plan adds *more* per-player data to more surfaces, so this gate must be right first.

---

## Phase 1 — Surface what's already stored (zero new API calls, zero migrations)

Pure render work. Every field below is already in the DB and already returned (or one SELECT column away) from existing endpoints.

### Game night cards get cover art ✅ Verified
`NightCard` and the "Tonight's pick" panel render the selected game as text only (apps/web/src/pages/Games.tsx:1017-1019, 1082-1083) even though `selected_app_id` is stored and `games.header_image_url` exists.
- [ ] Join `header_image_url` (+ capability flags) onto the game-nights response when `selected_app_id` is set.
- [ ] NightCard: cover art thumbnail beside title; Tonight's-pick panel: wide header image with gradient, matching the featured-pick card treatment.
- [ ] Activity feed `game_night.*` events: include the night's selected-game art the way game events already carry `target_header_image_url` (activity.ts builds this for games; extend to nights). (verify)

### Library rows
Library shows name, first tag, owners, capability pills, header image — and stops there (Library.tsx:359-458). Stored but absent:
- [ ] Sale/price badge: `price_final_cents`, `price_discount_pct`, `is_free` (currently wishlist-only).
- [ ] "Coming soon" badge from `release_coming_soon` (stored, never read anywhere ✅ per sweep).
- [ ] Show 2–3 tags instead of only `tags[0]`; full list in the drawer.
- [ ] Release year (from `release_date_parsed`, fall back to `release_date_text`).

### Game detail drawer
- [ ] "Last played X ago" per owner from `user_games.last_played_at` — stored, never queried anywhere (verify).
- [ ] MSRP strikethrough: `price_initial_cents` next to final price when discounted.
- [ ] Coming-soon state: release countdown instead of price block.

### Wishlist cards (Games.tsx:1135-1282)
- [ ] Capability mode pills (`is_online_coop` etc.) — shown in Library/drawer but not wishlist.
- [ ] MSRP strikethrough next to sale price.
- [ ] Coming-soon badge + release date text.

### News surfaces (verify file:lines at impl)
- [ ] Game-news rows: render the game's `header_image_url` thumbnail consistently (returned by gameNews.ts:132-153; rendering inconsistent/absent).
- [ ] General-news cards: AI label badge (🔥/🌊/🎮 currently tab-only), spoiler-warning badge (`ai_spoiler_warning` stored, never rendered), vote counts next to the existing vote arrows.
- [ ] Source favicon per row: derive from source domain (`https://www.google.com/s2/favicons?domain=<host>&sz=32` — no storage needed).
- [ ] Drift-log news cards: creator attribution (avatar + "posted by") — `createdBy` already in the response (newsCards.ts:34-52); clickable-link affordance when `sourceUrl` set.

### Activity feed polish
- [ ] Per-event-type icon/color chip (event kinds already categorized server-side, activity.ts:31-39).
- [ ] Achievement events: show the emoji/name payload it already carries at full fidelity; game art for game-targeted events on Community page (Home list already does some of this — unify). (verify)

### Forums (verify)
- [ ] Category list: last-reply avatar (`last_user_avatar` already fetched, forums.ts:77-149), reply/view counts on thread previews.
- [ ] "You reacted" state on the reaction button (reaction rows exist; UI shows only aggregate).

### Friends Online / crew rows
- [ ] Role badges (`role_names` stored + returned, only status dot shown).
- [ ] Same-voice-channel grouping hint (`voice_channel_id` stored; UI only shows boolean badge).

---

## Phase 2 — Game art pipeline: Steam CDN derivable images (no API calls, no migration)

Steam serves multiple art formats derivable from `app_id` alone — no fetch, no storage:

| Format | URL pattern | Use |
|---|---|---|
| Tall capsule | `https://steamcdn-a.akamaihd.net/steam/apps/{appid}/library_600x900.jpg` | Library grid view, wishlist cards |
| Hero banner | `.../{appid}/hero.jpg` | Game detail drawer header |
| Logo (transparent) | `.../{appid}/logo.png` | Overlay on hero, night-card chips |
| Wide capsule | `.../{appid}/capsule_616x368.jpg` | Featured/trending cards |

- [ ] Add a `steamArt(appId)` helper in apps/web (and shared if bot wants it) returning these URLs + `onError` fallback chain (tall → header → placeholder mascot art). Not every app has every asset — fallback is mandatory.
- [ ] Game detail drawer: hero.jpg backdrop with logo.png overlaid (Steam-library look).
- [ ] Library: optional grid view using tall capsules (current table view stays default).
- [ ] Featured pick + trending cards: wide capsule instead of header.jpg where the aspect fits.

---

## Phase 3 — Widen appdetails ingestion (1 migration + parser fields, still zero new API calls)

`fetchSteamAppDetails` already pays for the full appdetails JSON; the type keeps a subset (gameCatalogEnrichment.ts:7-27). The 2026-06 enrichment deferred screenshots/descriptions "until a consumer exists" — the game detail drawer now exists and is the consumer.

**Migration (next free number — check at impl time; 045 store-details / 046 weekly_digests / 047 player-col drop are taken, and the news de-AI initiative will claim numbers too — coordinate before merging):**

```sql
ALTER TABLE games
  ADD COLUMN short_description TEXT,
  ADD COLUMN screenshots JSONB,          -- [{thumb, full}] capped at ~6
  ADD COLUMN background_url TEXT,
  ADD COLUMN metacritic_score INT,
  ADD COLUMN metacritic_url TEXT,
  ADD COLUMN platform_windows BOOLEAN,
  ADD COLUMN platform_mac BOOLEAN,
  ADD COLUMN platform_linux BOOLEAN,
  ADD COLUMN controller_support TEXT;    -- 'full' | 'partial' | null
```

- [ ] Widen `SteamAppDetails` type + the UPDATE in `enrichGameMetadataFromSteam` (gameCatalogEnrichment.ts:349-371 region). Backfill rides the existing `store_details_checked_at` staleness gate — re-check that enriched rows get re-touched (gate on the new columns being NULL OR checked_at older than the static TTL).
- [ ] Drawer: short_description paragraph, screenshot strip (lightbox optional later), metacritic badge (score + link), platform icons, controller-support chip.
- [ ] Library/wishlist: platform icons where space allows.
- [ ] Skip `movies` and `dlc` for now — no consumer yet (same rule as before).

---

## Phase 4 — Discord identity enrichment

### 4a. Parse what the existing OAuth call already returns (no new scopes)
`/users/@me` with the `identify` scope **already includes** `banner`, `accent_color`, `global_name`, `premium_type`, `avatar_decoration_data` — auth.ts:70-79 keeps only id/username/avatar. (One agent claimed a "profile scope" is needed — wrong; no such scope exists. Bio/"About Me" is genuinely **not** exposed by Discord's API at all — see 4e.)

- [ ] Migration: add `banner_url`, `accent_color`, `global_name`, `premium_type` to `discord_profiles`.
- [ ] Parse + store at login; banner CDN URL: `https://cdn.discordapp.com/banners/{user_id}/{hash}.png?size=600` (`a_` prefix → `.gif`).
- [ ] Refresh on each login (currently avatar_url is written once and never refreshed ✅ per sweep).

### 4b. Member sync keeps more of the guild member object (members.ts:132-166)
- [ ] Store `joined_at` (guild join date), `premium_since` (booster), guild-specific avatar (`member.avatar`, prefer over user avatar when set).
- [ ] Banners for *other* members: bot `GET /users/:id` returns banner/accent_color — fetch lazily on profile view or via a slow daily cron (small guild; trivial volume). Reuse the 30-min-cooldown pattern used by sibling syncs.
- [ ] Avatar URL hygiene: append `?size=128`/`?size=512` per surface; handle animated (`a_` hash → gif) in `CrewAvatar`.

### 4c. Real rich presence (highest-impact single item in this plan)
Bot already runs with `GuildPresences` intent and pushes `presence_status`, but `rich_presence_text` is hardcoded to "In a voice channel" (members.ts:237; bot index.ts:522-566 discards `activities`).
- [ ] Bot: on PresenceUpdate, capture `activities[0]` → `{name, type, state}`; push alongside status.
- [ ] API: store `activity_name`, `activity_type` on `guild_members` (same migration as 4b).
- [ ] UI: Friends Online + crew rows show "Playing Valheim" / "Streaming" with a type icon; falls back to "In a voice channel". This also feeds the existing presence rail on Games.

### 4d. Profile + crew card UI
- [ ] Profile page hero: Discord banner as backdrop (fallback: accent_color gradient; fallback: theme art), avatar decoration if present.
- [ ] Profile facts row: guild join date ("Islander since …"), booster badge, role badges (already stored).
- [ ] Accent color as a subtle card-edge tint on member cards/leaderboard rows.
- [ ] Nitro badge: optional, only if it fits brand voice — decide at impl.

### 4e. Site-native bio (Discord bio is unavailable)
Discord does not expose About Me via any API/scope. If member descriptions are wanted:
- [ ] Add `profile_blurb TEXT` (user-editable, length-capped, same migration), edit field on own profile, render on profile + crew cards. Nuggie-voice placeholder for empty.

---

## Phase 5 — Steam player layer (new, free API calls)

Nothing today calls `GetPlayerSummaries` — one call covers 100 users, so the whole guild syncs in a single request.

- [ ] New sync (cron, reuse existing cadence/cooldown patterns): `GetPlayerSummaries` for all linked users → store `steam_persona_name`, `steam_avatar_url`, `steam_profile_url`, `steam_persona_state`, `steam_game_extra_info` (current in-game name), `steam_time_created`.
- [ ] `GetSteamLevel` per user on the slow path → `steam_level`.
- [ ] Profile "Steam card": persona + avatar + "View on Steam" + "Level 47 · On Steam since 2015". Gate the whole card on `steam_visibility`.
- [ ] Presence merge: in-game status from Steam (`gameextrainfo`) enriches Friends Online when Discord activity absent — single merged "now playing" precedence: Discord activity > Steam in-game > voice > status dot.
- [ ] Library/drawer: optionally badge owners currently in-game in this title.

Skipped deliberately: GetBadges (low value), ResolveVanityURL (no use case), Steam groups display (synced but low-value — candidate for deletion instead; decide at impl).

---

## Phase 6 — Achievements depth + leftovers

### Steam achievement schema + rarity (the only non-trivial new ingestion)
CrewAchievements shows raw unlocked/total counts; Steam has names, descriptions, icons, and global rarity, all free:
- [ ] `GetSchemaForGame` per game (static — cache forever in a new `game_achievements` table: `app_id, api_name, display_name, description, icon_url, icon_gray_url, hidden`). Sync only for games appearing in `user_game_progress` (top-played already capped at 15/user).
- [ ] `GetGameAchievementStats` per game → `global_unlock_pct` column; refresh ~monthly.
- [ ] `GetPlayerAchievements` already called for counts — keep per-achievement `achieved` + `unlocktime` for the latest N unlocks (new `user_achievement_unlocks` table or JSONB on progress row) instead of discarding.
- [ ] UI: CrewAchievements rows get real icons; "rarest unlocks" strip on profile ("Unlocked by 2.3% of players"); achievement-diff activity events (already emitted) carry the icon.

### Nuggies/Milestones polish
- [ ] Show `unlockedAt` date on earned milestones (stored, not rendered — verify).
- [ ] Earned-vs-purchased badge on inventory items.

### Price extras (optional)
- [ ] CheapShark historical low: fetch `price_history`/lowest from the existing price cron → `historical_low_cents`; wishlist shows "lowest ever $X".

---

## Sequencing + constraints

1. **Order:** Phase 0 → 1 → 2 ship as one fast wave (no migrations, mostly render code). Phase 3 and 4 are independent — either next. Phase 5 depends on nothing but is best after 4c so presence merge lands once. Phase 6 last (only new ingestion of real complexity).
2. **Migration numbering:** next free is 048 *today*, but the deferred news de-AI initiative also reserves future numbers — claim numbers at merge time, never in parallel branches (the 2026-06 plan's collision lesson).
3. **Rate limits:** all new Steam calls are key-authed free endpoints; ride existing cron/cooldown patterns (30-min cooldowns, daily slow paths). GetPlayerSummaries batches 100 ids/call. appdetails widening adds zero calls.
4. **Hotlinking:** Steam CDN + Discord CDN images are hotlinked (existing precedent: header_image_url, avatars). Every new `<img>` needs the onError fallback chain — CDN art has gaps (older games lack library_600x900/logo).
5. **Privacy:** every new player-data surface (Steam card, in-game status, achievements strip, last-played) respects `steam_visibility`; Phase 0 establishes the enforcement pattern.
6. **No voting:** game-night vote data stays dead; attendee avatars + counts only.
7. **Verify-stale rule:** agent-sweep line numbers marked (verify) must be re-checked; one finding (Community mock arrays) was already stale at planning time.
