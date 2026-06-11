# UI Review — June 2026

A fresh-eyes pass over the whole web app, judged against what the site is *for*:
a small crew answering "what can we play tonight?", bragging about it afterward,
and poking the economy/forums in between. Not tied to prior plan docs.

Legend: 💥 big swing · 🔧 solid improvement · ✨ polish

---

## 1. The big idea: you're sitting on a free art department

Steam serves header / hero / tall-capsule / logo art for every appId with no API
key (`steamArt.tsx` already knows this). The site uses it timidly — small 92px
thumbs and drawer images — while most surfaces are text-on-glass. The fastest
way to make the site visually interesting is to let game art carry the load:

- 💥 **Library → poster wall.** Swap the current text-forward grid for
  `library_600x900` tall capsules, Steam-shelf style. Hover/focus flips the
  poster to an info back-face (owners, modes, "Plan" button). Category accent
  becomes a colored shelf-edge under each poster instead of a tinted card.
- 💥 **Home hero → crew collage.** The hero currently self-dismisses into
  nothing special. Build its backdrop from 3–4 `library_hero` images of the
  crew's most-played games this fortnight (data already in `/steam/crew-trending`),
  cross-faded under the existing gradient scrim. The home page then *looks like
  what the crew is playing* without a single new asset.
- 🔧 **Game night cards get hero backdrops.** A scheduled night for Lethal
  Company should look like Lethal Company: hero art at ~20% opacity under the
  card content, logo.png floated right. One `GameCover` variant, reused.
- 🔧 **Thread/game cross-linking.** Forum threads in the Gaming category could
  accept an optional appId tag → tiny capsule next to the title. Cheap, makes
  forums feel native to a gaming site.

## 2. Scene shell: lean into the island, gently

The ambient layer (stars, fireflies, birds, bonfire) is the site's most
distinctive feature and it's nearly invisible on content-heavy pages.

- 💥 **Time-of-day continuity.** Tie day/night to the *user's* clock with a
  proper golden-hour band (sunset palette already exists in `theme.ts` and is
  barely used — `dawn`, `sunset`, `coral` tokens). Evening = when the crew
  actually plays; make 6–9pm the prettiest the site ever looks.
- 🔧 **Scene reacts to wins.** Big moments (milestone rank-up, game night
  finalized) trigger a one-shot scene flourish — extra fireflies, a shooting
  star — instead of only a confetti overlay. The celebration system already
  has the hook points.
- ✨ Gate all ambient animation behind `prefers-reduced-motion` at the
  scene-shell level (one check, not 54 scattered ones).

## 3. Systemize the visual language (the boring one that pays the most)

- 💥 **Type + spacing scales.** Inline `fontSize: 12/13/14/15` and gaps of
  6/8/10/12/16/20/24 are scattered everywhere. Add `islandTheme.text.{xs,sm,md,lg,display}`
  and `islandTheme.space.{1..6}` (4px base), migrate page-by-page. Every other
  suggestion gets cheaper after this.
- 🔧 **Kill the rogue hexes.** Known offenders: `Achievements.tsx` (#0f172a,
  #a3e635, #f59e0b), `Community.tsx` amber gradient, `CrewAchievements.tsx`
  gradients, `Profile.tsx` consent border, vote-flash colors in `islandUi.tsx`,
  admin status greens/reds (#86efac/#fca5a5). All have token equivalents or
  deserve new ones (`successAccent`, `warnAccent` exist).
- 🔧 **One accent-pill primitive.** Forum categories, admin nav, tags, and
  health chips all hand-roll the same `${accent}1e` background + `${accent}55`
  border pattern. Extract `IslandAccentChip` and reuse.
- ✨ Empty states: Forums now has bespoke ones; port them onto `IslandEmptyState`
  poses (wave/snooze/shrug) so the mascot shows up consistently.

## 4. Identity: members should look like *people*, not initials

Migration 051 added `banner_url`, `accent_color`, `global_name` — mostly unused
in the UI.

- 💥 **Member cards with Discord banners.** Community carousel + IslanderProfile
  header use the member's actual Discord banner (fallback: gradient from their
  `accent_color`). Instant visual variety that's personal to the crew.
- 🔧 **Accent-colored presence.** Leaderboard rows, activity feed actors, forum
  post sidebars pick up the member's accent color as a 2px edge. Subtle thread
  of identity through every surface.
- ✨ Avatar stacks ("3 people in this thread", "5 owners") instead of count text.

## 5. Page-by-page

### Home
- 🔧 "Hot this week" now has rank + art (this branch); next: a delta arrow vs
  the *previous* fortnight (one extra SUM in the same query) — "DBD ↑2".
- 🔧 Activity feed: coalesce runs of the same event type ("Matt claimed daily ×3"
  → one row with a ×3 chip); icon per event type. It reads as a wall right now.
- ✨ Friends Online stays top-right (load-bearing crew habit — confirmed rule).

### Games (session planner)
- 💥 **Two-mode split.** The page tries to be a wizard and a control room at
  once. Default view = "Tonight" flow: who's in → pick a vibe (Tonight/Cozy/
  Spicy chips already exist) → AI pick → lock it. A "details" disclosure opens
  the full composer/patch/wishlist machinery for power use.
- 🔧 Surface the 045 capability columns (online co-op / split-screen / PvP /
  max players) as filter chips in the recommender and on game blades — that
  data was the whole point of the appdetails work and it's mostly invisible.
- ✨ The patch rolodex is placeholder-heavy; fold patch notes into the
  GameDetailDrawer instead of a standalone module.

### Library
- 💥 Poster wall (see §1). 
- 🔧 Search box + capability filter chips (no search exists today).
- ✨ Sort by "crew-playable tonight" (owners online ∩ co-op capable).

### Community
- 🔧 Leaderboard top-3 podium with NuggieCoin sizes scaling by rank.
- ✨ Member status dot semantics already good; add `activity_name` ("Playing
  Deep Rock") under the name — the column exists (051) and is synced.

### Forums (fleshed out this branch: onboarding, markdown-lite, load-more, real errors)
- 🔧 Category accent as a 3px left edge on feed rows — scanability without reading.
- 🔧 Reply count → "hot" flame at threshold (≥10 replies in 24h) tying into the
  existing Top sort.
- ✨ Compose view: live preview pane using the same `renderForumBody`.

### Nuggies / Achievements / Casino
- 🔧 Achievement rarity tints (053 schema has rarity) — common/rare/epic border
  colors on badge tiles.
- 🔧 Balance ticker: animate ₦ changes (count-up) on the SSE `nuggies-changed`
  signal instead of snapping.
- ✨ Casino: felt-green table surface tint + chip-stack iconography; it
  currently looks like every other page with dice emoji.

### Admin (containment + mobile pills landed this branch)
- 🔧 Move every page's hardcoded accent into `adminNav.ts` (single source —
  it already stores accents; pages re-declare their own).
- 🔧 Status colors → theme tokens (`successAccent`/`warnAccent`).
- ✨ Tables (members, library) need `position: sticky` header rows — they're
  long and lose context fast.

## 6. Mobile

The crew lives on Discord mobile; the site should survive a phone.

- 💥 **Bottom tab bar < 640px** (Home / Games / Community / ₦ / Profile),
  topbar collapses to logo + search. The mega-menu is unusable on touch today.
- 🔧 A real breakpoint audit: only 5 ad-hoc breakpoints exist (880/860/820/720/540);
  pick 3 (1024/768/540) and apply consistently.
- ✨ Post cards in forums: the 180px author rail should stack above the body
  on narrow screens.

## 7. Quality-of-life / feedback

- 🔧 Persistent inline errors for data fetch failures (toasts evaporate; the
  forums "empty vs broken" confusion this branch fixed is the pattern —
  audit other pages for the same swallow-and-show-empty bug).
- 🔧 Page transitions: 150ms fade/slide on hash-route changes — the app
  currently hard-cuts.
- ✨ Skeletons match final layout (trending skeleton is a text line; render
  3 ghost rows with art boxes instead).

---

## Suggested order of attack

1. Type/spacing tokens + rogue hex cleanup (multiplies everything after).
2. Library poster wall + Home hero collage (biggest visible wow per hour).
3. Member identity pass (banners/accents).
4. Games page two-mode split.
5. Mobile bottom-tab bar.
6. The ✨ sprinkles, opportunistically.
