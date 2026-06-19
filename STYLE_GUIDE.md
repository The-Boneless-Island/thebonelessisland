# The Boneless Island UI Theme Guide

Default style baseline for new screens, placeholders, and UX copy.

## Source of Truth
- Theme tokens + shared copy: `apps/web/src/theme.ts`
- Reusable UI primitives: `apps/web/src/islandUi.tsx`
- Day/night context + hook: `apps/web/src/scene/useDayNight.tsx`
- Scene shell (sky, sun/moon, ocean, beach, palms, parallax): `apps/web/src/scene/IslandSceneShell.tsx`
- Apply tokens/primitives first before introducing new one-off styles.

## Brand Intent
- Community vibe: friendly adult gamer hangout, not a corporate dashboard.
- Setting: tropical island hub (sand, palms, shoreline, warm sky glow, ocean horizon).
- Mascot identity: boneless nugget island citizens with personality and playful tone.

## Day / Night Theme System
- Two modes selected by the user via a toggle in the user menu.
- Mode is stored on `document.documentElement` as `data-theme="day"` or `data-theme="night"`.
- Color tokens flip via CSS variables defined in `theme.ts` (`nightThemeVars` and `dayThemeVars`).
- Components reference tokens like `islandTheme.color.appBg` which resolve to `var(--bi-app-bg)`. Components stay token-driven; the theme switch updates the variable values, not the components.
- The sun (day) and moon (night) animate behind the horizon during the switch (~1.1s dip, ~1.5s rise).
- Ambient effects: stars (night), clouds (day), drifting waves, palm sway loop, scroll parallax.
- Honor `prefers-reduced-motion` — palms, clouds, frond flex, and wave drift disable on that media query.

## Color Tokens (semantic)
Resolved via CSS variables for theme awareness.
- `appBg`, `panelBg`: translucent glass surfaces
- `panelMutedBg`: opaque inner panels (inputs, code blocks)
- `textPrimary`, `textSecondary`, `textMuted`, `textSubtle`, `textInverted`: text scale
- `border`, `cardBorder`: edge tones
- `primary`, `primaryStrong`, `primaryGlow`, `primaryText`: blue CTA chain (sky blue `#0284c7` in day mode; cyan `#0891b2` is `toolAccent`, not the primary)
- `secondary`: secondary surface
- `info`, `infoText`: informational tone
- `toolAccent`: cyan tool accent
- `danger`, `dangerSurface`, `dangerText`: destructive (static across modes)
- `success`, `successText`: success (static across modes)

## Tropical Palette (`islandTheme.palette.*`)
Static accent values for scene + branded components.
- Sky: `skyHigh`, `skyMid`, `skyLow`
- Light: `dawn`, `sunset`, `sunsetDeep`, `sunsetAccent`, `coral`
- Ocean: `oceanShallow`, `oceanMid`, `oceanDeep`, `horizon`, `foam`
- Sand: `sand`, `sandWarm`, `sandDeep`, `sandWarmAccent`, `sandLight`
- Palm: `palm`, `palmMid`, `palmDeep`, `palmBark`, `palmShadow`, `reefDeep`

## Glass + Motion + Prose Tokens
- `glass.blur` / `glass.blurStrong`: backdrop-filter values for translucent surfaces
- `glass.edge`: standard 1px translucent border
- `motion.dur.{fast,med,slow,ambient}`: 140ms / 240ms / 480ms / 8s
- `motion.ease.{out,inOut,spring}`: cubic-bezier curves
- `prose.readable`: `{ maxWidth: "68ch", lineHeight: 1.45 }`
- `prose.hero`: `{ maxWidth: "60ch", lineHeight: 1.45 }`

## Typography
- Display: **Bricolage Grotesque** (h1–h6 by default; opt in via `.island-display` for non-heading display text)
- Body: **Inter** (default body font on `<body>`)
- Mono: **JetBrains Mono** (code/pre/kbd/samp by default; opt in via `.island-mono` for tags, meta, eyebrows, stat labels)

## Layout + Shape
- Radius: 10px controls, 12px cards, 14px hero tiles/surfaces.
- Spacing soft and breathable; avoid dense enterprise packing.
- Favor rounded controls + layered glass cards over rigid grid-heavy chrome.
- 2-column hero rows used on Home (Featured + Friends) and Games (Session composer + Patches rolodex). Stack under ~720px.

## Voice + Copy
- Tone: playful but mature, clear, concise, lightly self-aware.
- Prefer island-flavored phrasing where natural: "shoreline", "drift log", "crew", "dock", "lagoon", "reef", "tide".
- Avoid overly meme-heavy or juvenile writing.

## Visual Language
- Tropical/ocean gradients + warm highlights for key affordances.
- Translucent glass panels over the scene; never opaque slate slabs.
- Keep contrast accessible.
- Avoid default SaaS placeholders ("No data available", "Enter value"). Use thematic empty states.

## Component Defaults
- Primary button: `primary` background + `primaryText`.
- Secondary button: `secondary` background + neutral border.
- Inputs: `panelMutedBg` background + `cardBorder` border.
- Cards: `panelBg` background + `cardBorder` border + glass blur.

## Information Architecture
- Top nav: a **MegaMenu** with three hover groups — **Games** · **Community** · **Nuggies** — plus an **Admin** link (gated to Parent role). Home is the root route reached via the brand logo (no "Home" nav item); "Crew Achievements" lives under Community.
- User menu (avatar dropdown): banner gradient, large avatar with presence dot, name/handle/Discord ID, custom status, rich presence card (when in voice), 3-stat strip, status picker (online/idle/dnd/hidden), View profile, Steam link state, Theme toggle row, Sign out
- Sub-routes:
  - **Library** under Games (full Steam library with co-ownership)
  - **Admin** has 18 deep-linkable pages (Dashboard, Members & Roles, Forum Moderation, Game Library, Game Nights, Recommendation Engine, Gaming News, Patch Sources, Drift Log, Economy Operations, Shop Items, Economy Rules, AI Provider, Nuggie Persona, Guild Identity, Discord Bridge, Data Sync, Audit Log)

## Shared UI Primitives
Use `apps/web/src/islandUi.tsx` primitives before writing custom inline control styles.
- `IslandButton` — `primary` / `secondary` / `danger` variants
- `IslandCard` — sectional shell with glass blur
- `IslandTileButton` — large promo tile with background image (used on Home)
- `IslandMemberChip` — selectable member pill
- `IslandGameCard` — selectable game row/card
- `IslandGameBlade` — dense interactive game row (dead/unused; its definition still carries voting UI but nothing imports or renders it — slated for removal)
- `IslandComingSoonTile` — placeholder reserved-feature tile
- `IslandNewsPlaceholderCard` — temporary news entry shell
- `IslandActiveMemberRow` — member status row
- `IslandStatusPill` — compact state badge
- `islandButtonStyle(...)` — manual button-style helper for special layouts

## Scene Shell
- Wraps every page via `<IslandSceneShell>` in `main.tsx`. Provides `<DayNightProvider>` context.
- Layered z-index: sky (back) → stars / clouds → sun/moon → ocean → beach → vignette → palms → page content (front).
- Body background defaults to the sky color so corners feel cohesive.
- The shell injects global CSS for fonts, theme variables, and palm sway/frond keyframes.

## Voting Mechanic — REMOVED
- The Games page intentionally does **not** ship voting UI.
- Hosts pick the game directly; the AI session composer surfaces a recommendation.
- Vote API endpoints remain alive for backwards compat. Do not re-introduce the voting UI.

## Mascot Slots
- Boneless nugget art is treated as identity. Real illustration not yet commissioned.
- Custom SVGs that exist today: submarine character on the Home featured-game card.
- Reserve mascot slots in empty states + hero overlays + presence indicators. Mark `TODO: real art` until commissioned.

## Mock Data
Many cards still render hardcoded mock content (Activity Feed, Drift Log news, AI pick, patches, group wishlist, streams, community modules, admin tables). Wire to real API endpoints as backend models are added.

## Next Improvements
- Mobile responsive deep pass (2-col hero rows still get cramped under ~720px without manual breakpoints).
- Split `islandUi.tsx` into `ui/` (generic primitives) + `features/` (concrete feature components) — phase-A2 deferred.
- Real mascot illustration suite.
- Wire activity / news / wishlist / streams / forums / clubs / events / leaderboards to real APIs.
