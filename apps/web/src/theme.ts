export const islandTheme = {
  color: {
    appBg: "var(--bi-app-bg)",
    panelBg: "var(--bi-panel-bg)",
    menuBg: "var(--bi-menu-bg)",
    panelMutedBg: "var(--bi-panel-muted-bg)",
    textPrimary: "var(--bi-text-primary)",
    textSecondary: "var(--bi-text-secondary)",
    textMuted: "var(--bi-text-muted)",
    textSubtle: "var(--bi-text-subtle)",
    textInverted: "var(--bi-text-inverted)",
    border: "var(--bi-border)",
    cardBorder: "var(--bi-card-border)",
    primary: "var(--bi-primary)",
    primaryText: "var(--bi-primary-text)",
    primaryStrong: "var(--bi-primary-strong)",
    primaryGlow: "var(--bi-primary-glow)",
    secondary: "var(--bi-secondary)",
    info: "var(--bi-info)",
    infoText: "var(--bi-info-text)",
    toolAccent: "var(--bi-tool-accent)",
    danger: "#7f1d1d",
    dangerSurface: "#3f1d1d",
    dangerText: "#fee2e2",
    dangerAccent: "#ef4444",
    success: "#14532d",
    successText: "#dcfce7",
    successAccent: "#22c55e",
    // Soft on-dark text variants for inline status copy (readable on panelBg
    // where successAccent/dangerAccent are too saturated for body-size text).
    successSoft: "#86efac",
    dangerSoft: "#fca5a5",
    warnAccent: "#f59e0b",
    // The Nuggies brand gold — balances, claim CTAs, trending highlights.
    nuggieGold: "#fbbf77",
    // "Earned/unlocked" lime — achievement chips.
    limeEarned: "#a3e635",
    // Game-night vote feedback (theme-static, identifies actions not surfaces).
    voteUp: "#38bdf8",
    voteDown: "#f87171",
    voteMaybe: "#facc15",
    textDark: "#0f172a"
  },
  // Semantic type scale (px). Use instead of inline fontSize literals so
  // hierarchy stays consistent and globally tunable.
  text: {
    xs: 11,
    sm: 12,
    md: 13,
    base: 14,
    lg: 16,
    xl: 20,
    h2: 22,
    display: "clamp(28px, 4vw, 38px)"
  },
  // 4px-base spacing scale. space[1]=4 … space[6]=32.
  space: [0, 4, 8, 12, 16, 24, 32],
  radius: {
    control: 10,
    card: 12,
    surface: 14,
    chip: 6
  },
  spacing: {
    cardPadding: "0.95rem",
    pagePaddingWide: "1.2rem",
    pagePaddingNarrow: "0.9rem"
  },
  layout: {
    appMaxWidth: 1200,
    authMaxWidth: 900,
    proseMaxWidth: "68ch",
    heroProseMaxWidth: "60ch",
    menuMinWidth: 240,
    menuMaxWidth: 320,
    menuMobileMaxWidth: 360,
    listMaxWidth: 560,
    formMaxWidth: 480
  },
  prose: {
    readable: { maxWidth: "68ch", lineHeight: 1.45 },
    hero: { maxWidth: "60ch", lineHeight: 1.45 }
  },
  gradient: {
    gameNightTile: "linear-gradient(160deg, rgba(7,15,35,0.45), rgba(10,18,30,0.8))",
    toolsTile: "linear-gradient(160deg, rgba(7,15,35,0.45), rgba(10,18,30,0.82))",
    comingSoonTile: "linear-gradient(160deg, #0b1220, #0f172a)",
    gameArtFallback: "linear-gradient(140deg, #0b1220, #132640)",
    crownAmber: "linear-gradient(135deg, #f59e0b, #d97706)",
    nuggieCoin: "linear-gradient(135deg, #fbbf77, #ef8354)",
    progressDone: "linear-gradient(90deg, #16a34a, #4ade80)",
    progressActive: "linear-gradient(90deg, #0369a1, #38bdf8)"
  },
  shadow: {
    tileIdle: "0 4px 14px rgba(2,6,23,0.45)",
    tileComingSoon: "0 4px 14px rgba(2,6,23,0.35)",
    tileGameNightHover: "0 0 0 1px #60a5fa, 0 0 24px rgba(96,165,250,0.55)",
    tileToolsHover: "0 0 0 1px #22d3ee, 0 0 24px rgba(34,211,238,0.55)",
    toast: "0 8px 24px rgba(2, 6, 23, 0.42)",
    cardIdle: "0 6px 16px rgba(2,6,23,0.28)",
    cardHover: "0 12px 32px rgba(0,0,0,0.28)",
    cardHoverStrong: "0 20px 45px rgba(0,0,0,0.35)",
    bladeHover: "0 0 0 1px rgba(96,165,250,0.6), 0 10px 24px rgba(10,20,45,0.5)",
    menu: "0 20px 48px rgba(0,0,0,0.45)"
  },
  // Theme-static categorical palettes. These deliberately do not flip with
  // day/night — they identify entities (people, tags), not surfaces.
  categorical: {
    avatars: ["#fbbf77", "#22d3ee", "#a855f7", "#4ade80", "#ef8354", "#86efac", "#facc15", "#60a5fa"]
  },
  motion: {
    dur: {
      fast: "140ms",
      med: "240ms",
      slow: "480ms",
      ambient: "8s"
    },
    ease: {
      out: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
      spring: "cubic-bezier(0.5, 1.6, 0.4, 1)"
    }
  },
  palette: {
    skyHigh: "#0b1c3a",
    skyMid: "#1f3a6b",
    skyLow: "#3a5680",
    dawn: "#f0a47a",
    sunset: "#ff8a5c",
    sunsetDeep: "#e85a3c",
    coral: "#ff6b6b",
    horizon: "#2a4a6e",
    oceanShallow: "#3aa3b8",
    oceanMid: "#1f6e8a",
    oceanDeep: "#0e3a52",
    foam: "#cfeef5",
    sand: "#e6c9a0",
    sandWarm: "#d4a574",
    sandDeep: "#a3784f",
    palm: "#3d8259",
    palmMid: "#2a5e3f",
    palmDeep: "#1a3d2a",
    palmBark: "#5c3d24",
    palmShadow: "#0f2418",
    sandWarmAccent: "#f4a261",
    sandLight: "#e9c46a",
    sunsetAccent: "#ef8354",
    reefDeep: "#14532d"
  },
  glass: {
    blur: "blur(14px) saturate(125%)",
    blurStrong: "blur(20px) saturate(130%)",
    blurMenu: "blur(28px) saturate(150%)",
    edge: "1px solid rgba(120, 180, 230, 0.18)"
  },
  font: {
    display: '"Bricolage Grotesque", "Inter", system-ui, sans-serif',
    body: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace'
  }
} as const;

type ThemeColorVars = {
  "--bi-app-bg": string;
  "--bi-panel-bg": string;
  "--bi-menu-bg": string;
  "--bi-panel-muted-bg": string;
  "--bi-text-primary": string;
  "--bi-text-secondary": string;
  "--bi-text-muted": string;
  "--bi-text-subtle": string;
  "--bi-text-inverted": string;
  "--bi-border": string;
  "--bi-card-border": string;
  "--bi-primary": string;
  "--bi-primary-text": string;
  "--bi-primary-strong": string;
  "--bi-primary-glow": string;
  "--bi-secondary": string;
  "--bi-info": string;
  "--bi-info-text": string;
  "--bi-tool-accent": string;
};

export const nightThemeVars: ThemeColorVars = {
  "--bi-app-bg": "rgba(10, 24, 44, 0.62)",
  "--bi-panel-bg": "rgba(15, 32, 54, 0.74)",
  "--bi-menu-bg": "rgba(10, 22, 40, 0.97)",
  "--bi-panel-muted-bg": "#0b1220",
  "--bi-text-primary": "#e5e7eb",
  "--bi-text-secondary": "#e2e8f0",
  "--bi-text-muted": "#a3b2c7",
  "--bi-text-subtle": "#cbd5e1",
  "--bi-text-inverted": "#f8fafc",
  "--bi-border": "#334155",
  "--bi-card-border": "#253042",
  "--bi-primary": "#2563eb",
  "--bi-primary-text": "#eff6ff",
  "--bi-primary-strong": "#3b82f6",
  "--bi-primary-glow": "#60a5fa",
  "--bi-secondary": "#1e293b",
  "--bi-info": "#1e3a8a",
  "--bi-info-text": "#dbeafe",
  "--bi-tool-accent": "#22d3ee"
};

export const dayThemeVars: ThemeColorVars = {
  "--bi-app-bg": "rgba(255, 255, 255, 0.78)",
  "--bi-panel-bg": "rgba(255, 255, 255, 0.86)",
  "--bi-menu-bg": "rgba(255, 252, 245, 0.97)",
  "--bi-panel-muted-bg": "rgba(243, 233, 208, 0.92)",
  "--bi-text-primary": "#1e293b",
  "--bi-text-secondary": "#334155",
  "--bi-text-muted": "#566273",
  "--bi-text-subtle": "#475569",
  "--bi-text-inverted": "#ffffff",
  "--bi-border": "#b8c9d8",
  "--bi-card-border": "#d8e3ec",
  "--bi-primary": "#0284c7",
  "--bi-primary-text": "#f0f9ff",
  "--bi-primary-strong": "#0369a1",
  "--bi-primary-glow": "#0ea5e9",
  "--bi-secondary": "#f1f5f9",
  "--bi-info": "#0c4a6e",
  "--bi-info-text": "#e0f2fe",
  "--bi-tool-accent": "#0891b2"
};

export const islandCopy = {
  labels: {
    steamSynced: "Steam: Synced",
    steamNotSynced: "Steam: Not synced"
  },
  emptyStates: {
    activeMembers: "No island crew in voice right now. Ask an admin to refresh crew sync.",
    noNights: "No game nights docked yet."
  },
  news: {
    placeholderOneTitle: "Placeholder headline #1",
    placeholderOneMeta: "Source: curated feed · tag: co-op",
    placeholderTwoTitle: "Placeholder headline #2",
    placeholderTwoMeta: "Source: curated feed · tag: survival"
  },
  presence: {
    pending: "Presence pending",
    unavailable: "Presence not yet available"
  },
  placeholders: {
    title: "Friday Island Session",
    memberSearch: "Search island members"
  }
} as const;
