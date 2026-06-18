# Boneless Island UI — how to build with it

A **dark, island-themed** React design system: light text on deep-ocean glass surfaces,
playful but mature (adult gamers, a tropical-island Discord community, a "Nuggies" points
economy). Everything renders from `window.IslandUi.*`.

## Styling idiom — props + tokens, NOT utility classes
There are **no Tailwind/utility classes and no CSS-module class maps**. You style two ways:

1. **Component props.** Pass the documented props (`variant`, `tone`, `selected`, `size`, …).
   Each component owns its look — e.g. `<IslandButton variant="primary">`,
   `<IslandTag tone="success">`, `<IslandStatusPill tone="danger">`.
2. **Tokens for your own layout glue.** Color with the `--bi-*` CSS custom properties, or read
   the exported **`islandTheme`** object (`window.IslandUi.islandTheme`). Never hard-code hexes.

### Token vocabulary (real names)
- **Color vars** (set on a root by the theme; the shipped `styles.css` defines the night
  defaults): `--bi-app-bg`, `--bi-panel-bg`, `--bi-menu-bg`, `--bi-panel-muted-bg`,
  `--bi-text-primary`, `--bi-text-secondary`, `--bi-text-muted`, `--bi-text-subtle`,
  `--bi-border`, `--bi-card-border`, `--bi-primary`, `--bi-primary-text`, `--bi-secondary`,
  `--bi-info`, `--bi-tool-accent`.
- **`islandTheme` scales**: `islandTheme.color.*` (mirrors the vars + brand statics like
  `nuggieGold`, `limeEarned`, `danger`/`success`), `islandTheme.space[1..6]` (4px base, 1=4px),
  `islandTheme.radius.{control,card,surface,chip}`, `islandTheme.text.{xs,sm,md,base,lg,xl,h2,display}`,
  `islandTheme.shadow.*`, `islandTheme.gradient.*`, `islandTheme.glass.blur`,
  `islandTheme.font.{display,body,mono}` (Bricolage Grotesque / Inter / JetBrains Mono).

## Wrapping & setup
- **Surfaces are dark and translucent.** Render content over a dark backdrop (the app uses
  `IslandSceneShell`, an animated day/night island scene). On a white background the glass
  panels and light text look washed out — give content a dark ancestor.
- **Most components need no provider.** Exceptions:
  - **`UserMenu`** reads the day/night context — wrap it in **`<DayNightProvider>`** (exported).
  - **`MegaMenu`, `Topbar`, `MobileTabBar`** render router `<Link>`s — mount them inside a
    Router (`<BrowserRouter>` in a real app).
- **Data components** (`AiModelSelect`, `NotificationBell`, `GameDetailDrawer`) fetch from the
  app API; with no backend they show their styled empty/loading state.

## Where the truth lives
Read **`styles.css`** and its `@import` closure (the token `:root` block + `_ds_bundle.css`)
for the exact token values, each component's **`.d.ts`** for its prop contract, and its
**`.prompt.md`** for usage. Those files are authoritative — prefer them over this summary.

## One idiomatic example
```tsx
const { IslandCard, IslandButton, IslandStatusPill, islandTheme } = window.IslandUi;

<IslandCard style={{ display: "grid", gap: islandTheme.space[3], maxWidth: 360 }}>
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <strong style={{ color: "var(--bi-text-primary)" }}>Steam sync</strong>
    <IslandStatusPill tone="success">Steam: Synced</IslandStatusPill>
  </div>
  <p style={{ color: "var(--bi-text-muted)", fontSize: islandTheme.text.md }}>
    Your library is on the island. Pick tonight's co-op pick from the crew.
  </p>
  <IslandButton variant="primary">Plan a game night</IslandButton>
</IslandCard>
```
(`IslandCard` brings the glass surface; the design language carries through props + tokens —
write only layout glue yourself.)
