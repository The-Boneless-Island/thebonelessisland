# Onboarding Redesign — Plan

> Status: **Phases 1–4 BUILT 2026-06-20** (typecheck + web build clean; uncommitted). Phase 5 polish + commit pending. Created 2026-06-20.

## Build status (2026-06-20)
- [x] **Phase 1 — Backend:** migration 065 `user_client_state` (kv table), `lib/clientState.ts`, `/profile/me` returns `clientState`, `PUT /profile/client-state`, `POST /profile/onboarding/complete`, admin `POST /admin/onboarding/reset-all`.
- [x] **Phase 2 — Migrated 5 flags to server:** forum intro, steam-ack, activity last-seen, achievement cursor, theme pref (theme keeps localStorage cache for first paint).
- [x] **Phase 3 — "Washed Ashore" 8-step tour** (`components/OnboardingFlow.tsx`); App gate on `onboarding_version`; old Steam modal + localStorage skip-flag retired (`SteamOnboarding.tsx` deleted); Steam-step redirect-resume via sessionStorage.
- [x] **Phase 4 — Admin button** "Re-show onboarding to all members" on Members & Roles → reset-all endpoint (window.confirm guard). Delivers the original "reset for all" ask.
- [x] **Phase 5 — Polish:** on-brand mini-preview visuals per step, copy pass, day/night audit, focus-on-open a11y.
- [x] **Reviewed end-to-end** (correctness / security / growth) + fixes applied 2026-06-20: per-key value validation on `PUT /client-state`, single-sourced onboarding version via `/me`, throttled `activity_last_seen_at` + theme-mirror writes, stable celebration dep, typed client-state keys, Steam-step "linked" state.
- [ ] Migration 065 applied to live DB (runs automatically on next app boot).
- [ ] Committed / merged (⚠ main-merge auto-deploys; migration 065 runs on boot).
> Goal: turn the current single Steam-link modal into a real, multi-step, **server-tracked**
> onboarding flow — and, as a free byproduct, make "re-show onboarding to everyone" an actual
> admin action (the original request that the current design can't satisfy).

## 1. Why

Today "onboarding" is one modal (`SteamOnboarding.tsx`) gated by **browser localStorage**
(`island.steam.onboarding.skipped:{discordUserId}`). Consequences:

- No server record of who has onboarded. Can't query it, can't reset it.
- "Reset for all members" is **impossible** — the only state lives in each member's browser.
- It's a single prompt (Steam), not a welcome.

Fix the root: persist onboarding state **server-side**, versioned.

## 2. Tracking model (the keystone decision)

Scope locked 2026-06-20: migrate **all 6 server-worthy flags** (onboarding + forum intro + Steam share-ack + theme pref + achievement cursor + activity last-seen), not just onboarding. One extensible store beats a column-per-flag.

### `user_client_state` — key/value table (migration 065)

```
user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE
key        TEXT        NOT NULL
value      JSONB       NOT NULL
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
PRIMARY KEY (user_id, key)
```

Keys in scope:

| key | type | replaces (localStorage) |
| --- | --- | --- |
| `onboarding_version` | number | `island.steam.onboarding.skipped:*` |
| `forum_intro_seen` | bool | `bi:forum-onboarding-dismissed` |
| `steam_share_ack` | bool | `island.steamShareConsent` |
| `theme_pref` | `"auto"\|"day"\|"night"` | `useDayNight` STORAGE_KEY |
| `last_unlock_seen_at` | ISO string | `boneless.lastUnlockToastAt` |
| `activity_last_seen_at` | number (ms) | Home `ACTIVITY_LAST_SEEN_KEY` |

Why kv, not columns: heterogeneous flags, and the next "seen/pref" flag becomes free (no migration). Fits "composable data models."

### Onboarding gating (the version trick)

Server constant `CURRENT_ONBOARDING_VERSION = 1`. Show onboarding when stored `onboarding_version < CURRENT` (absent = 0 = show). On finish/skip → set = CURRENT.

- Add a step later → bump the constant → **everyone re-onboards**.
- Admin "reset for all" = `DELETE FROM user_client_state WHERE key = 'onboarding_version'` (parent-gated). The real, repeatable "reset onboarding for all members."

### ⚠ `theme_pref` caveat

`useDayNight` applies theme on first paint, **before** auth/profile loads, and must work logged-out. Do **not** rip out its localStorage. Pattern: localStorage = fast local cache for first paint; server = source of truth; on profile load, reconcile (server wins when logged in). The other 5 flags are read after profile loads — straight swap.

## 3. The flow — "Washed Ashore"

User-facing name: **Washed Ashore** (a new member washes up on the island). Code/component can stay `OnboardingFlow`.

### Presentation (SaaS product-tour pattern)
- **Dim scrim** over the live app — darken the background to spotlight the tour (honor the glass/scene theme).
- **Centered tour card** (`IslandCard` on the scrim): step title, a real **feature preview** (mini screenshot / illustration — not just words), 1–2 genuinely useful tips, progress dots, Back / Next, and a persistent **Skip tour**.
- **Content rule:** teach *how to get value*, not "this button exists." Every step earns its place.
- On finish or Skip → scrim fades, lands on **Home**, marks `onboarding_version` done.
- v1 = content-rich cards. Element-anchored spotlight (highlight the actual nav item) is a **v2** option — it's the fragile part; do not let it block v1.

### Steps
1. **Welcome ashore** — what Boneless Island is, the Crew, the vibe.
2. **Your profile** — confirm Discord identity; optional `profile_blurb`.
3. **Link Steam** *(optional)* — library overlap, group wishlist, patch notes. Reuse `SteamOnboarding` content.
4. **Gaming News** — AI-curated feed; vote to tune what surfaces for you.
5. **Forums** — start/join threads; where the crew actually talks.
6. **Nuggies** — the currency; daily claim; how to earn & spend.
7. **Nuggie Casino** — blackjack / coinflip / guess number; spend Nuggies for fun.
8. **You're in** — drop to Home.

Tradeoff: 8 steps is long — **Skip** (§7) is the mitigation. Option if testing shows fatigue: merge 6+7 into one "Economy" step with two beats.

## 4. Work breakdown

### Phase 1 — Backend (DB + API)
- **Migration 065** `065_user_client_state.sql`: create the kv table (§2). *(Verify next number — 064 on disk; tracker has drifted.)*
- `MeProfile` (`apps/web/src/types.ts`): add `clientState: Record<string, unknown>`.
- `/profile/me` (`apps/api/src/routes/profile.ts`): return all the caller's `user_client_state` rows as a `clientState` object.
- `PUT /profile/client-state` (`requireSession`): upsert one `{ key, value }` for the caller. **Whitelist** allowed keys.
- `POST /profile/onboarding/complete` (`requireSession`): set `onboarding_version = CURRENT_ONBOARDING_VERSION`.
- `POST /admin/onboarding/reset-all` (`requireSession` + `requireParentRole`): `DELETE … WHERE key='onboarding_version'`. Mirror the parent-gated pattern at `apps/api/src/routes/generalNews.ts:240`.
- *(Optional)* `POST /admin/onboarding/reset/:discordUserId` — reset one member.

### Phase 2 — Client-state infra + migrate the 5 existing flags
- `useClientState(key, default)` hook: reads from `profileData.clientState`, writes through to `PUT /profile/client-state` (optimistic).
- Swap localStorage → hook: Forums intro (`forum_intro_seen`), Profile share-ack (`steam_share_ack`), App achievement cursor (`last_unlock_seen_at`), Home activity last-seen (`activity_last_seen_at`).
- `useDayNight` (`theme_pref`): keep localStorage as first-paint cache; reconcile with server on profile load (server wins when logged in). **Do not** remove its localStorage — see §2 caveat.
- Delete the retired keys' old reads/writes.

### Phase 3 — "Washed Ashore" flow
- `OnboardingFlow` component: 8-step tour (§3), dim scrim, `IslandCard`, progress dots, Back / Next, persistent **Skip tour**.
- Extract `SteamOnboarding` body into a reusable step.
- Replace the effect at `apps/web/src/App.tsx:326-338`: show when `isAuthenticated && profileData && (clientState.onboarding_version ?? 0) < CURRENT`.
- Finish/Skip → `POST /profile/onboarding/complete` → `loadProfile(true)`.

### Phase 4 — Admin control
- "Reset onboarding for everyone" button (parent-gated) on an admin page (Guild Identity, or a small new Onboarding entry). Follow the gaming-news backfill button pattern. **Confirm dialog** — it re-nags every member.

### Phase 5 — Polish
- Copy pass (Nuggie voice where the mascot speaks; Boneless Island voice for control text).
- Day/night-aware scene integration; real feature preview per step.

## 5. Files in play

| File | Change |
| --- | --- |
| `apps/api/src/db/migrations/065_user_client_state.sql` | NEW — kv table |
| `apps/api/src/routes/profile.ts` | return `clientState`; add `client-state` setter + `onboarding/complete` |
| `apps/api/src/routes/` (admin) | add `onboarding/reset-all` (parent-gated) |
| `apps/web/src/types.ts` | `MeProfile.clientState` |
| `apps/web/src/hooks/useClientState.ts` | NEW — read/write-through hook |
| `apps/web/src/App.tsx` | version-gate onboarding; migrate `boneless.lastUnlockToastAt` |
| `apps/web/src/components/OnboardingFlow.tsx` | NEW — 8-step tour + scrim |
| `apps/web/src/components/SteamOnboarding.tsx` | extract body → reusable step; drop skip-localStorage |
| `apps/web/src/pages/Forums.tsx` | `forum_intro_seen` → server |
| `apps/web/src/pages/Profile.tsx` | `steam_share_ack` → server |
| `apps/web/src/pages/Home.tsx` | `activity_last_seen_at` → server |
| `apps/web/src/scene/useDayNight.tsx` | `theme_pref` → server (keep localStorage cache; §2 caveat) |
| admin page + `adminNav.ts` | reset-all button |

## 6. Risks / notes
- **Skip ethos**: every step skippable; Steam never mandatory (project invariant).
- **Migration drift**: confirm next number on disk before writing (was 063 in notes, 064 on disk).
- **Single-instance**: no scaling concern for this feature.
- **Don't** re-introduce game-night voting or any removed feature in the "what's here" step.

## 7. Decisions (LOCKED 2026-06-20)
1. **Name** → **Washed Ashore** (user-facing). ✅
2. **Steps** → 8-step tour incl. Gaming News, Forums, Nuggie Casino (see §3). ✅
3. **Render** → SaaS product-tour: dim scrim + stepped content cards, lands on Home. Element-spotlight deferred to v2. ✅
4. **Skip** → persistent Skip-tour control; skipping marks done (no re-nag). ✅
5. **Old localStorage flag** → retire `island.steam.onboarding.skipped:*`. ✅

Decide during build: step-count fatigue (merge Nuggies + Casino?); v2 element-spotlight; which **other** localStorage flags to migrate alongside (see §8).

## 8. Related localStorage — migrate alongside? (full sweep 2026-06-20)

Swept `apps/web/src` (42 hits / 8 files). "Same pattern" = a per-member *seen / dismissed / preference* flag stuck in per-device storage — those benefit from the same server treatment as onboarding (follows the member across devices/browsers).

### Strong candidates — same shape as onboarding, cheap to fold in
| Key | File | What it is | Note |
| --- | --- | --- | --- |
| `island.steam.onboarding.skipped:{id}` | `SteamOnboarding.tsx:11` | onboarding skip | **Already migrating** (this plan) |
| `bi:forum-onboarding-dismissed` | `Forums.tsx:320` | forum getting-started "intro read" tick | Identical "seen" flag — fold into the same server store |
| `island.steamShareConsent` | `Profile.tsx:15` | one-time "library is shared — got it" banner ack | Privacy-adjacent notice ack; server-side = no re-nag on other devices. (Real control is server `steam_visibility`.) |

### Medium — nice cross-device, lower urgency
| Key | File | What it is | Benefit |
| --- | --- | --- | --- |
| theme pref (`auto/day/night`) | `scene/useDayNight.tsx:28` | day/night choice | preference follows the member |
| `boneless.lastUnlockToastAt` | `App.tsx:156` | achievement/milestone "celebrate once" cursor | celebrate-once works across devices |
| activity last-seen | `Home.tsx:1500` | "new since last visit" marker | consistent "new" badge across devices |

### Leave local — device/session UI, local is correct
`island.selectedMemberIds`, `island.memberSearch` (crew-picker convenience), `bi:games-view` (view toggle), `bi:forum-last-category` (compose convenience), `returnTo` (OAuth transient — sessionStorage), `hero_seen` (per-session animation — sessionStorage), forum reply/thread **drafts** (sessionStorage), `bi:ai-cost-banner-dismissed` (admin session UI).

**Scope (locked 2026-06-20):** all **strong + medium** flags migrate this build (see §2 key table + §4 Phase 2). Only the device/session-UI keys above stay local.

---

### Execution note (10-80-10)
This doc = the 10% plan (Opus). Build phases 1–4 = the 80% (Sonnet). Final review = 10% (Opus).
Signal the model switch when sign-off lands and build starts.
