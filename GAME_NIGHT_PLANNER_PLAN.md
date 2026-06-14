# Game Night Planner — Rebuild Plan

Status: **implemented** (2026-06-13). Owner branch: `claude/practical-rubin-47f39a`.

## Build log (2026-06-13)

All phases landed. Files changed: `gameNights.ts` (Phase 0 endpoint + create-with-game
+ GET enrich), `types.ts`, `App.tsx`, `Games.tsx` (PlanNightCard + night-card visuals),
new `gameAccent.ts`, `steamArt.tsx` (`LogoCover`). No migration needed (`selected_app_id`
exists since 004). Verification: typecheck of all changed files is **clean** — remaining
worktree errors (`react-router`, `express-session`, `web-vitals`, `sharp` modules; the
`req.session` augmentation) are pre-existing missing-deps noise, not from this work. A full
build/app-run is blocked in this worktree by those uninstalled deps + no local Postgres, not
by the code. Reviewer flagged a GROUP BY concern — **false positive**: `games.app_id` is the
PK and is in GROUP BY, so all `selected_game.*` columns are functionally dependent (the
pre-existing query already relied on this).


Rebuild the Tonight-tab game-night planner into a single, no-scroll "Plan a
night" card, **wire the game picker that was never built**, and land 10
visual-appeal upgrades. No new tables required — the core unblock reuses columns
that have existed since migration 004.

---

## 1. Why this exists (problems found in the live code)

1. **The game picker does not exist.** `game_nights.selected_app_id` is read in
   ~10 places ([gameNights.ts](apps/api/src/routes/gameNights.ts),
   [NightCard](apps/web/src/pages/Games.tsx)) but **written nowhere** —
   `grep selected_app_id` across api/bot/web returns only SELECTs. Every night is
   permanently "Host hasn't picked yet." The AI-pick banner is decorative: you
   select crew, get a recommendation, and there is no control to attach it to a
   night.
2. **Two disconnected surfaces.** `SessionComposer` (members + AI pick,
   [Games.tsx:297](apps/web/src/pages/Games.tsx)) and `CreateNightStrip`
   (title + datetime, [Games.tsx:1028](apps/web/src/pages/Games.tsx)) don't talk.
   In the Everything tab the Nuggie `CrewChat` sits *between* them → the scroll
   the user reported. `createGameNight` ([App.tsx:1441](apps/web/src/App.tsx))
   sends only `title + scheduledFor + attendeeIds`; the recommended game is lost.
3. **Roster hard-capped at 8** (`.slice(0, 8)`,
   [Games.tsx:481](apps/web/src/pages/Games.tsx)) with no search/scroll.
4. **Dead `ModeBar`** — 5 tabs (Tonight/Weekend/Quick/Cozy/Spicy) with zero
   effect on the pick ([Games.tsx:396](apps/web/src/pages/Games.tsx)).
5. **Always-grey night cards** — game art, mode pills, "tonight's pick" all
   render off `selected_app_id`, which is always null.

### Grounding facts the plan relies on

- `selected_app_id` + `selected_at` columns exist since
  [migration 004](apps/api/src/db/migrations/004_game_night_finalized_pick.sql).
  Migration head is **063**; core work needs **no new migration**.
- Activity categorizer **already** maps `game_night.game_picked`
  ([activity.ts:40](apps/api/src/routes/activity.ts)) → emit that exact string.
- `whatCanWePlay(input)` returns `{appId,name,owners,score,reason,...}`
  ([recommend.ts](apps/api/src/lib/recommend.ts)); it reads the privacy-aware
  `shareable_user_games` view.
- `ConfettiBurst({trigger})` is a reusable card-scoped burst that respects
  `prefers-reduced-motion` ([celebration.tsx:414](apps/web/src/system/celebration.tsx)).
- `steamArt` derives every format from the appid alone — `hero()` =
  `library_hero.jpg`, `logo()` = `logo.png` (transparent wordmark), plus
  `header`/`capsule`; `GameCover` walks a fallback chain
  ([steamArt.tsx](apps/web/src/steamArt.tsx)).
- `CrewOwnedGame` already carries `tags`, `maxPlayers`, `mpMaxPlayersApprox`,
  `medianSessionMinutes`, mode flags, `owners[]`
  ([types.ts:129](apps/web/src/types.ts)); `FeaturedRecommendation` carries
  `tags` + `maxPlayers`. `modePills()` is the shared label util
  ([gameModes.ts](apps/web/src/gameModes.ts)).

---

## 2. Locked contracts

These are fixed up front so phases can land independently.

- **Endpoint:** `PATCH /game-nights/:id/game`, body `{ appId: number | null }`.
  `appId` null = "decide later" (clears the pick).
- **Create extension:** `POST /game-nights` body gains optional
  `selectedAppId: number | null`.
- **Event:** emit `game_night.game_picked` (payload `{ appId, name }`) —
  matches the existing categorizer, no categorizer change.
- **Permission:** only the night's `created_by_user_id` (or a guild admin) may
  set/clear the game. *(Default — see Decisions.)*
- **New GET `/game-nights` fields** (additive, never drop existing):
  - `selectedMaxPlayers: number | null` (from `games.mp_max_players_approx`)
  - `selectedTags: string[]`
  - `selectedMedianSessionMinutes: number | null`
  - each `attendees[]` entry gains `ownsSelected: boolean`
    (LEFT JOIN `shareable_user_games` on `selected_app_id`; privacy-aware).
- **No-drop rule:** existing response fields (`selectedGameName`,
  `selectedGameImage`, `selectedGameModes`, `selectedAt`, …) stay as-is.

---

## 3. Phase 0 — Backend: make the picker real (the unblock)

File: [apps/api/src/routes/gameNights.ts](apps/api/src/routes/gameNights.ts)

1. **Set-game endpoint.**
   ```
   PATCH /game-nights/:id/game   { appId: number | null }
   ```
   - `requireSession`; load authed user.
   - 404 if night missing; **403 unless `created_by_user_id === user.id`** (or
     admin via existing role check).
   - If `appId` non-null, verify it exists in `games` (FK already enforces, but
     return a clean 400 on miss).
   - `UPDATE game_nights SET selected_app_id = $1, selected_at = CASE WHEN $1 IS NULL THEN NULL ELSE NOW() END WHERE id = $2`.
   - On non-null: `recordEvent({ eventType: "game_night.game_picked",
     actorDiscordUserId, targetGameNightId: id, targetAppId: appId,
     payload: { appId, name } })`; `broadcast("nights-changed")`.

2. **Create-with-game.** Extend `createGameNightSchema` with
   `selectedAppId: z.number().int().positive().nullish()`. INSERT sets
   `selected_app_id` + `selected_at` when present. If set at create, also emit
   `game_night.game_picked`.

3. **Enrich GET `/game-nights`.** Add to the SELECT off the existing
   `selected_game` join: `mp_max_players_approx`, `tags`,
   `median_session_minutes`. Extend the attendee subquery with a per-attendee
   `ownsSelected` (`EXISTS` against `shareable_user_games` for
   `gn.selected_app_id`). Map into the JSON per the locked contract.

4. *(Optional)* migration **064** — `CREATE INDEX IF NOT EXISTS
   idx_game_nights_selected_app_id ON game_nights(selected_app_id);`. Tiny;
   include only if the attendee/ownership join shows up hot. Default: skip.

**Verify:** `PATCH` then `GET` returns the game + modes + `ownsSelected` flags;
event row lands with category `achievements`→ no, `game_night.game_picked` maps
to **achievements** per [activity.ts:40](apps/api/src/routes/activity.ts) (note:
keep that mapping; the Home feed already renders it).

---

## 4. Phase 1 — Frontend: consolidate into one card

File: [apps/web/src/pages/Games.tsx](apps/web/src/pages/Games.tsx),
[App.tsx](apps/web/src/App.tsx), [types.ts](apps/web/src/types.ts)

Replace `SessionComposer` + `ScheduledNights`'s `CreateNightStrip` with a single
**`PlanNightCard`**:

```
Plan a night                         [ AI pick | Search | Later ]   ← source segmented
┌ hero art band (selected/draft game) — logo overlay, match ring, crew stack ┐
│  stat chips: players · co-op · genre · ~session    [ Swap game ]            │
├ WHEN   [Tonight] [Fri 8pm] [Sat] [Custom…]                                  │
├ WHO    [search crew…]  N ready   · scrollable roster, online dots, toggles  │
└ preview: Game · time · N going                     [ Lock the night ]       ┘
```

- **Draft state** (App.tsx): `draftAppId: number | null`, `draftWhen` (resolved
  from chip → ISO). Source segmented:
  - *AI pick* → `draftAppId = composerRecommendations[0]?.appId ?? featured`.
  - *Search* → typeahead over `crewGames` (already loaded); pick sets `draftAppId`.
  - *Later* → `draftAppId = null`.
- **Lock the night** → `createGameNight` now posts
  `{ title, scheduledFor: draftWhen, selectedAppId: draftAppId,
  attendeeIds: selectedMemberIds }`. Host auto-joins (already does).
- **Existing-night game change** → "Swap game" on a selected night calls the new
  `PATCH` via a `setNightGame(nightId, appId)` handler in App.tsx.
- **Roster:** drop the `.slice(0, 8)`; render a scroll box (max-height) with a
  search filter over `filteredGuildMembers`; keep online-status dots.
- **Time chips:** `Tonight` (today 20:00), `Fri 8pm` (next Friday), `Sat night`
  (next Saturday 20:00), `Custom…` (reveals the existing `datetime-local`).
- **Nuggie `CrewChat`** moves out of the create path → rendered below the
  scheduled nights (both tabs) as a helper, never between picker and time.
- **ModeBar:** wire `Quick/Cozy/Spicy/Weekend` to filter/re-rank the AI pick
  (session-length + genre hints fed to `/recommendations`), OR delete. *(Default:
  wire — see Decisions.)*

New types (types.ts): add `selectedMaxPlayers`, `selectedTags`,
`selectedMedianSessionMinutes` to `GameNight`; add `ownsSelected` to the
attendee avatar type; add `selectedAppId?` to the create payload.

---

## 5. Phase 2 — The 10 visual features

New util file **`apps/web/src/gameAccent.ts`**: `gameAccent(tags) →
{ accent, soft, label }` (genre→color map, client-side), `countdownLabel(iso) →
{ text, tone }`, `seatPips(count, max)`. Reused by `PlanNightCard` + `NightCard`.

| # | Feature | Where | How |
|---|---------|-------|-----|
| 1 | **Live art-wash reacts to pick** | `PlanNightCard`, `NightCard` | Background = `steamArt.hero(appId)` under a scrim tinted by `gameAccent(tags).accent`. Updates as `draftAppId` changes. |
| 2 | **Genre-tinted accents** | both cards | `gameAccent(tags)` drives match-ring stroke, chip borders, card border, CTA glow. ≤1 accent per card. |
| 3 | **Hover / press motion** | `NightCard`, chips, segmented | CSS transform lift + art sharpen on hover; chip/button press `scale(0.98)`. All under a `@media (prefers-reduced-motion: reduce)` guard (mirror the existing `bi-nuggie-dot` pattern). |
| 4 | **Seat meter** | `NightCard`, preview | Pip row `seatPips(attendeeCount, selectedMaxPlayers)` → ●●●○; falls back to "N crew" when max unknown. |
| 5 | **Island texture** | `PlanNightCard` header | Faint inline-SVG palm/wave watermark, low opacity, `aria-hidden`. |
| 6 | **Urgent countdown** | `NightCard` | `countdownLabel(scheduledFor)`: >1wk grey → ≤2d amber → ≤2h pulsing green pill. |
| 7 | **Inviting empty hero** | `PlanNightCard` (Later / no game) | Illustrated dice/island placeholder + "Host picks at game-time", not flat grey. |
| 8 | **Logo-on-capsule tiles** | small tiles | `GameCover` gains an optional `logoOverlay` so 60px tiles show `capsule` + transparent `logo.png` instead of a truncated name. |
| 9 | **Lock cheer** | `PlanNightCard` | On successful lock, bump a `confettiNonce`; render `<ConfettiBurst trigger={confettiNonce} />` inside the card (position:relative). Reuses existing component. |
| 10 | **Won't-run badge** | `NightCard` attendee avatars | `attendee.ownsSelected === false` → faded avatar + `title="doesn't own this game"`; small count "2 missing". Uses the Phase-0 `ownsSelected` flag. |

---

## 6. Phase 3 — Polish & verify

- **a11y:** match ring `role="img"` + label; roster buttons `aria-pressed`;
  countdown/seat pips have text equivalents; won't-run badge has `title`/`aria`.
- **Reduced motion:** every animation (art sharpen, hover lift, countdown pulse,
  confetti) gated — confetti already self-gates.
- **Mobile:** card reflows to one column; CTA full-width; chips wrap.
- **Build gate:** `pnpm -r typecheck && pnpm -r lint && pnpm -r build`; then run
  the app and exercise: create-with-game, swap game, decide-later, RSVP,
  won't-run badge, confetti, reduced-motion.

---

## 7. Files touched

| File | Change |
|------|--------|
| [apps/api/src/routes/gameNights.ts](apps/api/src/routes/gameNights.ts) | `PATCH /:id/game`, create schema `selectedAppId`, GET enrich (maxPlayers/tags/session + `ownsSelected`) |
| `apps/api/src/db/migrations/064_*.sql` | *optional* index only |
| [apps/web/src/types.ts](apps/web/src/types.ts) | `GameNight` + attendee + create-payload fields |
| [apps/web/src/pages/Games.tsx](apps/web/src/pages/Games.tsx) | `PlanNightCard` (replaces composer+strip), `NightCard` art/seat/countdown/badge, move CrewChat |
| [apps/web/src/App.tsx](apps/web/src/App.tsx) | draft state, `setNightGame`, create payload, props, confetti nonce |
| `apps/web/src/gameAccent.ts` | **new** genre→color, countdown, seat utils |
| [apps/web/src/steamArt.tsx](apps/web/src/steamArt.tsx) | `GameCover` optional logo overlay / hero variant |

---

## 8. Decisions (defaults chosen — override before Phase 0 if needed)

1. **Who can set the game?** → *creator or admin* (not any attendee). Keeps a
   single host accountable; matches "Hosts pick the game" copy.
2. **"Search library" scope?** → *crew-owned games only* (`crewGames`, already
   loaded) — guarantees ownership signal + art; avoids a full Steam catalog
   search. All-Steam search is a later add.
3. **Genre tint source?** → *client-side genre map from `tags`* now; a stored
   `games.dominant_color` is a future enhancement, not blocking.
4. **ModeBar?** → *wire it* to the recommendation (session-length / genre), since
   a dead control erodes trust. Delete only if wiring proves noisy.

## 9. Explicitly out of scope (separate follow-on)

Discord push on lock, edit/cancel a night, recurring nights, `.ics` calendar
drop, time-consensus chips. These are the *functionality* backlog from the
earlier brainstorm — not the 10 visual items — and ship after this lands.
