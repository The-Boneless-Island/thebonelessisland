# design-sync NOTES — @island/web

Repo-specific gotchas for future syncs. Append as you learn things.

## Source shape
- **Not a packaged DS.** The design system lives inside the `@island/web` vite app
  (`apps/web/src/`), no `dist/`, no Storybook. Shape is forced to `package` with a
  **synth/scoped entry**.
- The build entry is a hand-written barrel, `apps/web/.ds-entry.tsx` (**committed sync
  input** — a `.ds-*` dotfile the app never imports), re-exporting only the DS surface so the
  bundle never pulls in `main.tsx` (which calls `render()` at module top-level and would crash
  previews). Set as `cfg.entry`. It also re-exports `DayNightProvider`, `useDayNight`, and
  `MemoryRouter` so context/router-dependent previews can wrap from the same module instance.
- `componentSrcMap` is the component list (there is no `.d.ts` to discover from). All
  `Island*` primitives map to `src/islandUi.tsx`; the rest to `src/components/<File>.tsx`.
  Note: `SteamOnboarding.tsx`'s component export is `SteamOnboardingModal`;
  `GameDetailDrawer` is a **default** export (barrel uses `export { default as … }`).
- No path aliases (`@/`) in web src — plain relative imports, so no tsconfig-paths needed.

## Theming / tokens (CRITICAL)
- Tokens are runtime-injected CSS custom properties (`--bi-*`) set by JS objects in
  `theme.ts` (`nightThemeVars` / `dayThemeVars`). **No stylesheet ships them.**
- `apps/web/.ds-tokens.css` (**committed sync input**, `cfg.cssEntry` — must live under
  `apps/web` because `cssEntry` is bounded to the package dir) materializes the default
  **night** theme as `:root { --bi-*: … }` and `@import`s the brand fonts from Google
  Fonts (→ `[FONT_REMOTE]`, expected, no action).
- **Preview cards render on a white `body` (hardcoded by the emit contract — do NOT
  fork emit).** This DS is dark-themed (light text + translucent glass panels), so any
  component without its own opaque dark surface reads as broken on white.

## Stage convention (REQUIRED for every authored preview)
- Wrap every preview's content in the shared `Stage` decorator: `import { Stage } from "./_stage";`
  (`.design-sync/previews/_stage.tsx`). It paints the app's night-island backdrop so
  components are graded as they actually appear in-product.
- Use `<Stage inline>` for small inline elements (buttons, pills, tags); `<Stage style={{ width: N }}>`
  for cards / panels / full-width components.
- Components import from `@island/web` → shimmed to `window.IslandUi` at preview-compile.

## Known render quirks
- Mascot art (`/mascot/*.svg`) is not served in previews → `IslandEmptyState` mascot
  `<img>` 404s and **self-hides via onError** (by design — not a failure).
- Game card images use remote URLs; previews omit `imageUrl` so the deterministic
  art-fallback ("Island art incoming") renders instead of a network image.

## Bucket-D risk (app-coupled components)
- `NotificationBell`, `GameDetailDrawer`, `AiModelSelect` import `apiFetch` from
  `../api/client.js` — they fetch in `useEffect`, so at render they may show empty/error
  states. `useDayNight` is a React context hook (throws without a provider) — check
  whether nav components (Topbar/MegaMenu/UserMenu) read it.
- These may need `cfg.provider` or richer mock props. If a provider/context need shows
  up, it's an orchestrator-level config change (subagents must flag, not hack).

## Bucket-D resolution (what the fan-out found + fixed)
- **react-router context (MegaMenu, Topbar, MobileTabBar).** These render `<Link>`, which
  needs a Router. The bundle and each preview inline SEPARATE react-router copies, so a
  preview-side `<MemoryRouter>` from `react-router` has a different `RouterContext` and never
  matches. **Fix:** the entry barrel re-exports `MemoryRouter` from `react-router`, and these
  previews import `{ MemoryRouter }` from `@island/web` (same instance) and wrap each cell.
  Keep this barrel line — removing it re-breaks all three.
- **MobileTabBar** is `display:none` above 640px and `position:fixed`; its preview injects a
  scoped `<style>` forcing `display:grid; position:static` inside a 390px phone frame so it's
  gradable statically.
- **QuickSwitcher** portals to `document.body` as a `position:fixed; inset:0` overlay → escapes
  the card. Handled with `cfg.overrides.QuickSwitcher = {"cardMode":"single","viewport":"640x560"}`.
- **SteamOnboardingModal / GameDetailDrawer** are also `position:fixed; inset:0` but are kept
  contained by wrapping in a `Stage` with `position:relative; overflow:hidden; minHeight` — no
  override needed. Fallback overrides (if the pipeline ever strips that wrap) are noted in their
  previews' history: `{"cardMode":"single","viewport":"720x760"}` / `"720x680"`.
- **Data components render empty/loading states by design.** `NotificationBell` (resting bell,
  no `open` prop), `AiModelSelect` ("enter a model id manually" fallback), `GameDetailDrawer`
  ("couldn't load this game") all fetch via `apiFetch` with no backend in preview — their styled
  empty/error state IS the gradable surface. Do not try to mock the network.
- **DayNightProvider** is required ONLY by `UserMenu` (and anything composing it). Its preview
  wraps in `<DayNightProvider>` from `@island/web`. Not set as a global `cfg.provider` so the
  other 27 components' grades aren't invalidated.

## Re-sync risks
- Tokens CSS is a hand-materialized snapshot of `nightThemeVars` — if `theme.ts` night
  values change, regenerate `apps/web/.ds-tokens.css`.
- The scoped entry barrel must be updated if components are added/removed from scope.
- Upload was NOT performed in the originating session (claude.ai design login
  unavailable to the managed session token). Build + previews are verified locally;
  upload pending an authed session.
