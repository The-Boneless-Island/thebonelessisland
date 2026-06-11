# Steam Library Privacy — Implementation Plan

> **STATUS — IMPLEMENTED & VERIFIED 2026-06-11.** Migration 054 (table + 3 views) applied; every crew consumer reads the views; emit-time + read-time event gating live; server-persisted per-game exclusions + 2-tier UI + consent notice shipped. web/api/bot typecheck + web build green. Self-check `apps/api/src/db/checks/steam_privacy_check.sql` PASSED against live Postgres (rolled back). The old localStorage-only exclusion control was never enforced and is discarded.


Decided 2026-06-11. Supersedes the partial gating in Phase 0 of `CONTENT_ENRICHMENT_PLAN.md`.

## Goal

Members must be able to trust that hiding Steam data actually hides it — everywhere — while the crew features stay functional for everyone who shares. Two controls:

1. **Whole library** — `steam_visibility`: `Private` (only me) vs `Crew-shared`.
2. **Per-game** — a member who shares their library can still exclude individual games.

A hidden game (private library OR per-game excluded) must vanish from **every** crew-facing surface, including **achievements** for that game — because achievements trivially reveal ownership.

## Locked decisions

| Question | Decision |
|---|---|
| Recommender + a private member in a session | **Ignore them entirely** — their library contributes zero games; the pick is built only from sharers. They can still attend. |
| Default + tiers | **Shared by default, two tiers** (Private / Crew-shared). Collapse the old `private/members/public` enum. Keep the default-flip + backfill (migration 049). Add a one-time "your library is shared with the crew" consent. |
| Wishlist | **Same control** — private library hides the wishlist too; a per-game exclusion hides that game from the Group Wishlist. |
| Event enforcement | **Never emit + filter on read** — if a game is hidden when an event would fire, no row is written; reads also re-filter as a safety net. |

Scope: **Steam-derived data only** — owned games, playtime, wishlist, Steam achievements, Steam "in-game" status. Discord presence ("Playing X" from Discord rich presence), Nuggies, forums, game-night RSVPs are the member's own live Discord/site presence and stay visible.

## Architecture — one canonical rule, enforced by views

A `(user, app)` pair is **shareable** when:

```
users.steam_visibility <> 'private'
AND NOT EXISTS a row in steam_game_exclusions for (user, app)
```

Encode it once as SQL views so a consumer that *forgets* to filter is the visible exception, not the silent leak:

```sql
CREATE VIEW shareable_user_games AS
  SELECT ug.*
  FROM user_games ug
  JOIN users u ON u.id = ug.user_id
  WHERE u.steam_visibility <> 'private'
    AND NOT EXISTS (
      SELECT 1 FROM steam_game_exclusions e
      WHERE e.user_id = ug.user_id AND e.app_id = ug.app_id
    );

CREATE VIEW shareable_user_game_progress AS  -- achievements
  SELECT p.* FROM user_game_progress p
  JOIN users u ON u.id = p.user_id
  WHERE u.steam_visibility <> 'private'
    AND NOT EXISTS (SELECT 1 FROM steam_game_exclusions e
                    WHERE e.user_id = p.user_id AND e.app_id = p.app_id);

CREATE VIEW shareable_user_wishlists AS
  SELECT w.* FROM user_wishlists w
  JOIN users u ON u.id = w.user_id
  WHERE u.steam_visibility <> 'private'
    AND NOT EXISTS (SELECT 1 FROM steam_game_exclusions e
                    WHERE e.user_id = w.user_id AND e.app_id = w.app_id);
```

**Every crew-facing consumer reads the view; only the owner's own views read the raw tables.**

## Data model — migration 054

```sql
CREATE TABLE steam_game_exclusions (
  user_id    BIGINT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id     INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, app_id)
);
-- + the three views above.
```

Tier collapse: keep the `steam_visibility` column; UI offers only `Private` / `Crew-shared` (writes `'private'` / `'members'`). Existing `'public'` rows already behave as shared under `<> 'private'` — optionally normalize `public → members` in this migration. Default stays `'members'` (049).

The old localStorage `excludedOwnedGameAppIds` was never enforced; **discard it** (do not migrate) — start members fresh on a now-real control so nobody silently un-hides a game they think is hidden.

## Enforcement matrix — convert every reader

Replace the Phase-0 inline `<> 'private'` gates with the views (the views also honor per-game exclusion, which Phase 0 missed).

**Owned-games readers → `shareable_user_games`:**
- `lib/recommend.ts` (whatCanWePlay) — private members contribute nothing; they fall out naturally, but also re-check the `HAVING owners >= members-1` math so a ghost member doesn't skew the threshold.
- `lib/recommendBlurb.ts`, `routes/recommendations.ts` (featured)
- `routes/steam.ts`: crew-games, crew-trending, game/:appId owners
- `lib/weeklyDigest.ts`
- `lib/generalNewsIngestion.ts`, `lib/newsCurator.ts`, `routes/gameNews.ts`, `routes/gameNewsSources.ts` (crew-owned genre/news signal)
- `routes/aiChat.ts` (owned-games context for Nuggie answers)
- `routes/members.ts` `:id/profile` topGames

**Achievement readers → `shareable_user_game_progress`:**
- `routes/steam.ts`: crew-achievements, game/:appId achievements
- `routes/members.ts` `:id/profile` achievements showcase
- any digest/announcement that counts achievements

**Wishlist readers → `shareable_user_wishlists`:**
- `routes/steam.ts` crew-wishlist
- `lib/priceSync.ts` operates on the union of wishlists — fine to keep syncing prices for hidden games (no leak), but the crew-wishlist *display* uses the view.

**Steam in-game status (Phase 5 `game_extra_info`/`game_app_id`):** in `routes/profile.ts` (`/me` is self, OK) and `routes/members.ts` `:id/profile` + GET `/members` list — hide when the member is private OR the current game is excluded.

**Activity events — never-emit + read filter:**
- Emit-time: `lib/activityEvents.recordEvent` (or its callers) skips writing any `steam.*` / `achievement.*` event tied to an app when that `(user, app)` is not shareable. Add a small `isGameShareable(userId, appId)` helper (single query) used at every steam/achievement event emission site (Steam sync diffs, achievement-unlock detector, bot round-ups).
- Read-time: activity feed (`routes/activity.ts`), member profile `recentActivity`, weekly digest, and any bot announcement re-filter steam/achievement events through the shareable rule as defense-in-depth.

**Owner's own surfaces read RAW tables (see everything, incl. hidden):** their own Library "★ Mine", their own `/profile/me`, and the Settings exclusion picker.

## UI

- **Visibility select** → two options: `Private (only you)` / `Crew-shared`. ([Settings.tsx](apps/web/src/pages/Settings.tsx), [Profile.tsx](apps/web/src/pages/Profile.tsx))
- **Per-game exclusion → server-persisted.** New endpoints: `GET /profile/steam-exclusions` (list app_ids) and `PUT /profile/steam-exclusions/:appId` + `DELETE` (toggle). The checkbox list writes to the server, not localStorage. Show a "Hidden from crew 🔒" tag on excluded games in the owner's own Library.
- **One-time consent.** On first sign-in / first Steam link while `Crew-shared`, a clear notice: "Your Steam library is shared with the crew — what you own, your playtime, and achievements appear in crew features. Make it Private or hide individual games anytime in Settings." Dismiss = acknowledged.

## Verification (this is the trust contract — write the tests)

For a member set to **Private**, and separately for a **single excluded game**, assert absence from each of: crew-owned, crew-trending, crew-wishlist, crew-achievements, game-detail owners + achievements, `whatCanWePlay` output, weekly digest, news genre signal, activity feed (playtime + achievement events — both not-emitted and not-shown), Steam in-game status. And assert the **owner still sees their own** hidden games in their own Library/profile. One excluded game's **achievement** must not appear anywhere crew-facing.

## Migrations

- **054** — `steam_game_exclusions` table + the three `shareable_*` views (+ optional `public → members` normalize).
- No further schema needed; everything else is query/route/UI rewiring.

## Relationship to already-shipped Phase 0

Phase 0's five inline `<> 'private'` gates become redundant once those queries read the views — replace, don't stack. Net effect: Phase 0 was whole-library-only and browse-endpoints-only; this plan makes it whole-library **+ per-game**, across **every** consumer, with **emit-time** event suppression.
