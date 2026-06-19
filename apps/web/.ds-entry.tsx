// design-sync scoped entry barrel (gitignored build input — not app code).
// Re-exports only the design-system surface so the bundle never pulls in
// main.tsx (which renders at module top-level). One window.<GLOBAL> namespace.
export * from "./src/islandUi";
export * from "./src/theme";
export * from "./src/scene/IslandSceneShell";
export * from "./src/scene/useDayNight";

// react-router Router for previews of nav components that render <Link>.
// Exported here so previews import the SAME react-router instance the bundle
// uses (a preview-side copy has a separate RouterContext and never matches).
export { MemoryRouter } from "react-router";

export * from "./src/components/NuggieBadge";
export * from "./src/components/NuggieCoin";
export * from "./src/components/PosterCard";
export * from "./src/components/QuickActionCard";
export * from "./src/components/SettingCard";

export * from "./src/components/MegaMenu";
export * from "./src/components/Topbar";
export * from "./src/components/UserMenu";
export * from "./src/components/MobileTabBar";
export * from "./src/components/NotificationBell";
export * from "./src/components/QuickSwitcher";
export * from "./src/components/SteamOnboarding";
export * from "./src/components/AiModelSelect";
export { default as GameDetailDrawer } from "./src/components/GameDetailDrawer";
