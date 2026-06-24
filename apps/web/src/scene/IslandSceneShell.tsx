import { useEffect, useRef, useState, type ReactNode } from "react";
import { dayThemeVars, islandTheme, nightThemeVars } from "../theme.js";
import { LoginOverlayProvider, useLoginOverlay } from "./LoginOverlayContext.js";
import { DayNightProvider, useDayNight } from "./useDayNight.js";

type IslandSceneShellProps = {
  children: ReactNode;
};

export function IslandSceneShell({ children }: IslandSceneShellProps) {
  return (
    <DayNightProvider>
      <LoginOverlayProvider>
        <SceneGlobalStyles />
        <SceneBackdrop />
        <PalmFrameLeft />
        <PalmFrameRight />
        {children}
      </LoginOverlayProvider>
    </DayNightProvider>
  );
}

function SceneBackdrop() {
  const { mode } = useDayNight();
  const { loginOverlayActive } = useLoginOverlay();
  const videoRef = useRef<HTMLVideoElement>(null);
  const reducedMotion = useRef(
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ).current;
  const day = mode === "day";
  const src = day ? "/scene-day.mp4" : "/scene.mp4";
  const fallbackBg = day ? "#bfe0f0" : "#0a1424";
  // Scrim sits over the video to preserve topbar text legibility at the top edge.
  // Tune these values in the review phase â€” they're the primary lever for "how much video shows".
  const scrim = day
    ? "linear-gradient(180deg, rgba(255,255,255,.06) 0%, transparent 22%, transparent 70%, rgba(20,40,66,.12) 100%)"
    : "linear-gradient(180deg, rgba(6,14,28,.22) 0%, rgba(6,14,28,.07) 26%, rgba(6,14,28,.14) 64%, rgba(6,14,28,.36) 100%), radial-gradient(130% 90% at 50% 36%, transparent 54%, rgba(6,12,24,.28) 100%)";

  // Defer the heavy backdrop video so it never blocks first paint, and skip the
  // download entirely for reduced-motion users (the fallback bg stands in).
  const [showVideo, setShowVideo] = useState(false);
  useEffect(() => {
    if (reducedMotion) return;
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const schedule = w.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
    const cancel = w.cancelIdleCallback ?? window.clearTimeout;
    const id = schedule(() => setShowVideo(true));
    return () => cancel(id);
  }, [reducedMotion]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !showVideo) return;
    if (loginOverlayActive) {
      v.pause();
    } else {
      v.play().catch(() => {});
    }
  }, [src, showVideo, loginOverlayActive]);

  return (
    <div
      aria-hidden="true"
      data-theme={mode}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -10,
        overflow: "hidden",
        pointerEvents: "none",
        background: fallbackBg
      }}
    >
      {showVideo && !loginOverlayActive ? (
        <video
          ref={videoRef}
          key={src}
          src={src}
          muted
          loop
          autoPlay
          playsInline
          preload="metadata"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover"
          }}
        />
      ) : null}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: scrim,
          pointerEvents: "none"
        }}
      />
      <CelebrationFlourish />
    </div>
  );
}

// â”€â”€ Celebration flourish â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// One-shot shooting star when a celebration fires anywhere in the app
// (milestone rank-up, achievement). Listens for the "bi:scene-flourish"
// window event dispatched by the celebration system â€” no prop threading.

function CelebrationFlourish() {
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    const onFlourish = () => {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      setBurst((n) => n + 1);
    };
    window.addEventListener("bi:scene-flourish", onFlourish);
    return () => window.removeEventListener("bi:scene-flourish", onFlourish);
  }, []);
  if (burst === 0) return null;
  return (
    <div key={burst} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: "12%",
          left: "-12%",
          width: 180,
          height: 2,
          borderRadius: 999,
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.95))",
          boxShadow: "0 0 12px rgba(255,255,255,0.8), 0 0 28px rgba(96,165,250,0.6)",
          transform: "rotate(16deg)",
          animation: "biShootingStar 1700ms ease-in forwards"
        }}
      />
      <style>{`
        @keyframes biShootingStar {
          0%   { opacity: 0; translate: 0 0; }
          8%   { opacity: 1; }
          70%  { opacity: 1; }
          100% { opacity: 0; translate: 130vw 36vh; }
        }
      `}</style>
    </div>
  );
}


function usePalmParallax(side: "left" | "right") {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = side === "right" ? "scaleX(-1)" : "";
    el.style.opacity = "1";
  }, [side]);

  return ref;
}

function PalmFrameLeft() {
  const ref = usePalmParallax("left");
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="bi-palm-frame"
      style={{
        position: "fixed",
        top: 0,
        left: "-3vw",
        width: "30vw",
        maxWidth: 460,
        minWidth: 220,
        height: "100vh",
        zIndex: -5,
        pointerEvents: "none",
        willChange: "transform"
      }}
    >
      <PalmTreeSvg suffix="L" />
    </div>
  );
}

function PalmFrameRight() {
  const ref = usePalmParallax("right");
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="bi-palm-frame"
      style={{
        position: "fixed",
        top: 0,
        right: "-3vw",
        width: "30vw",
        maxWidth: 460,
        minWidth: 220,
        height: "100vh",
        zIndex: -5,
        pointerEvents: "none",
        willChange: "transform",
        transform: "scaleX(-1)"
      }}
    >
      <PalmTreeSvg suffix="R" />
    </div>
  );
}

const TRUNK_PATH = "M 50 920 C 65 720, 88 520, 120 360 C 138 280, 158 240, 180 220";

const TRUNK_RINGS = [
  "M 30 880 q 26 -8 52 0",
  "M 32 825 q 26 -8 52 0",
  "M 38 770 q 26 -8 52 0",
  "M 46 715 q 26 -8 52 0",
  "M 56 660 q 26 -8 52 0",
  "M 66 605 q 26 -8 52 0",
  "M 78 550 q 26 -8 52 0",
  "M 90 495 q 26 -8 52 0",
  "M 102 440 q 26 -8 52 0",
  "M 114 385 q 26 -8 52 0",
  "M 128 332 q 24 -8 50 0",
  "M 144 282 q 22 -7 46 0",
  "M 158 240 q 20 -6 42 0"
];

const FROND_PATHS: Array<{ frondClass: string; d: string; rib?: string }> = [
  {
    frondClass: "frond-1",
    d: "M 180 220 C 240 150, 330 100, 420 60 C 380 110, 310 160, 250 200 C 230 220, 210 235, 195 240 Z",
    rib: "M 180 220 Q 280 145, 418 65"
  },
  {
    frondClass: "frond-2",
    d: "M 180 220 C 270 220, 380 240, 440 290 C 380 270, 300 255, 220 245 C 200 240, 190 232, 195 240 Z",
    rib: "M 180 220 Q 310 240, 438 292"
  },
  {
    frondClass: "frond-3",
    d: "M 180 220 C 200 130, 220 40, 240 -40 C 230 60, 215 150, 200 235 Z",
    rib: "M 180 220 Q 215 100, 240 -38"
  },
  {
    frondClass: "frond-4",
    d: "M 180 220 C 130 140, 60 80, -20 40 C 60 110, 130 175, 195 240 Z",
    rib: "M 180 220 Q 90 130, -20 42"
  },
  {
    frondClass: "frond-5",
    d: "M 180 220 C 100 220, -10 240, -60 290 C 0 270, 80 255, 175 245 C 195 240, 200 232, 195 240 Z",
    rib: "M 180 220 Q 60 240, -58 292"
  },
  {
    frondClass: "frond-6",
    d: "M 180 220 C 230 290, 290 380, 320 480 C 280 400, 240 320, 200 240 Z",
    rib: "M 180 220 Q 250 360, 320 482"
  },
  {
    frondClass: "frond-1",
    d: "M 180 220 C 130 290, 70 370, 30 470 C 80 390, 130 320, 195 240 Z",
    rib: "M 180 220 Q 110 360, 30 472"
  },
  {
    frondClass: "frond-2",
    d: "M 180 220 C 250 180, 340 165, 420 170 C 350 190, 280 215, 200 235 Z",
    rib: "M 180 220 Q 290 180, 420 170"
  },
  {
    frondClass: "frond-3",
    d: "M 180 220 C 110 180, 20 165, -60 170 C 10 190, 90 215, 195 235 Z",
    rib: "M 180 220 Q 70 180, -60 170"
  },
  {
    frondClass: "frond-4",
    d: "M 180 220 C 230 110, 280 30, 320 -30 C 290 60, 240 150, 200 235 Z",
    rib: "M 180 220 Q 250 100, 322 -28"
  },
  {
    frondClass: "frond-5",
    d: "M 180 220 C 130 110, 80 30, 40 -30 C 70 60, 120 150, 195 235 Z",
    rib: "M 180 220 Q 110 100, 38 -28"
  },
  {
    frondClass: "frond-6",
    d: "M 180 220 C 200 290, 200 360, 195 440 C 188 360, 188 290, 200 235 Z"
  }
];

function PalmTreeSvg({ suffix }: { suffix: "L" | "R" }) {
  const trunkId = `trunk-${suffix}`;
  const frondId = `frond-${suffix}`;
  const clipId = `trunk-clip-${suffix}`;
  return (
    <svg
      viewBox="0 0 400 900"
      preserveAspectRatio="xMidYMax meet"
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        filter: "drop-shadow(0 30px 40px rgba(0,0,0,0.4))"
      }}
    >
      <defs>
        <linearGradient id={trunkId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#3a2417" />
          <stop offset="0.5" stopColor="#7a4d2a" />
          <stop offset="1" stopColor="#2a1810" />
        </linearGradient>
        <radialGradient id={frondId} cx="0.5" cy="0.5">
          <stop offset="0" stopColor="#3aa05c" />
          <stop offset="1" stopColor="#0d4a22" />
        </radialGradient>
        <clipPath id={clipId}>
          <path
            d={TRUNK_PATH}
            stroke="black"
            strokeWidth={42}
            fill="none"
            strokeLinecap="round"
          />
        </clipPath>
      </defs>

      <path
        d={TRUNK_PATH}
        stroke={`url(#${trunkId})`}
        strokeWidth={42}
        fill="none"
        strokeLinecap="round"
      />

      <g clipPath={`url(#${clipId})`} fill="none" stroke="#1a0e08" strokeWidth={3} opacity={0.6} strokeLinecap="round">
        {TRUNK_RINGS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>

      <path
        d="M 55 920 C 70 720, 92 520, 124 360 C 142 280, 162 240, 184 220"
        stroke="rgba(255,200,140,0.18)"
        strokeWidth={6}
        fill="none"
        strokeLinecap="round"
      />

      <g
        className={`island-palm-canopy island-palm-canopy-${suffix.toLowerCase()}`}
        style={{ transformOrigin: "180px 220px" }}
      >
        <g>
          <ellipse cx={170} cy={225} rx={14} ry={16} fill="#2a1810" stroke="#1a0e08" strokeWidth={2} />
          <ellipse cx={188} cy={232} rx={13} ry={15} fill="#3a2417" stroke="#1a0e08" strokeWidth={2} />
          <ellipse cx={202} cy={222} rx={12} ry={14} fill="#2a1810" stroke="#1a0e08" strokeWidth={2} />
          <ellipse cx={158} cy={240} rx={11} ry={13} fill="#3a2417" stroke="#1a0e08" strokeWidth={2} />
          <ellipse cx={195} cy={250} rx={12} ry={14} fill="#2a1810" stroke="#1a0e08" strokeWidth={2} />
          <ellipse cx={167} cy={220} rx={3} ry={2} fill="rgba(255,255,255,0.18)" />
          <ellipse cx={185} cy={227} rx={3} ry={2} fill="rgba(255,255,255,0.18)" />
        </g>
        {FROND_PATHS.map((f, i) => (
          <g key={i} className={`island-frond ${"island-" + f.frondClass}`} style={{ transformOrigin: "180px 220px" }}>
            <path d={f.d} fill={`url(#${frondId})`} stroke="#0a3a1a" strokeWidth={2} />
            {f.rib ? <path d={f.rib} stroke="#0a3a1a" strokeWidth={1.5} fill="none" /> : null}
          </g>
        ))}
      </g>
    </svg>
  );
}

function buildVarBlock(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k}: ${v};`)
    .join("\n          ");
}

function SceneGlobalStyles() {
  const { font } = islandTheme;
  return (
    <style>
      {`
        /* â”€â”€ Cross-browser reset â”€â”€ */
        *, *::before, *::after { box-sizing: border-box; }

        :root {
          --bi-topbar-h: 62px;
          ${buildVarBlock(nightThemeVars)}
        }
        :root[data-theme="day"] {
          ${buildVarBlock(dayThemeVars)}
        }

        html {
          /* Reserve scrollbar lane so layout never shifts between scrollable/non-scrollable pages.
             Windows browsers have ~17px opaque scrollbar; macOS uses overlay â€” this normalises them. */
          scrollbar-gutter: stable;
        }
        html, body {
          margin: 0;
          background: var(--bi-app-bg);
          /* Kill rubber-band overscroll. Without this, scrolling past the top or
             bottom of the scene exposes the flat body background underneath the
             gradient sky/water â€” looks like the page "changes color". */
          overscroll-behavior: none;
        }
        body {
          min-height: 100vh;
          font-family: ${font.body};
          color: var(--bi-text-primary);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          overflow-x: hidden;
          transition: color 600ms ease;
        }
        /* Prevent media from overflowing their container */
        img, video, canvas, svg { max-width: 100%; }
        h1, h2, h3, h4, h5, h6 {
          font-family: ${font.display};
          letter-spacing: -0.01em;
        }
        code, pre, kbd, samp {
          font-family: ${font.mono};
        }
        .island-display { font-family: ${font.display}; font-weight: 700; letter-spacing: -0.01em; }
        .island-mono { font-family: ${font.mono}; }

        .island-palm-canopy-l { animation: islandPalmSwayLeft 7s ease-in-out infinite; }
        .island-palm-canopy-r { animation: islandPalmSwayRight 8s ease-in-out infinite; animation-delay: -2s; }
        .island-frond-1 { animation: islandFrondFlex 5s ease-in-out infinite; }
        .island-frond-2 { animation: islandFrondFlex 6s ease-in-out infinite; animation-delay: -1s; }
        .island-frond-3 { animation: islandFrondFlex 5.5s ease-in-out infinite; animation-delay: -2s; }
        .island-frond-4 { animation: islandFrondFlex 6.5s ease-in-out infinite; animation-delay: -3s; }
        .island-frond-5 { animation: islandFrondFlex 5s ease-in-out infinite; animation-delay: -4s; }
        .island-frond-6 { animation: islandFrondFlex 7s ease-in-out infinite; animation-delay: -2.5s; }

        @keyframes islandPalmSwayLeft {
          0%, 100% { transform: rotate(-2deg); }
          50% { transform: rotate(2.5deg); }
        }
        @keyframes islandPalmSwayRight {
          0%, 100% { transform: rotate(-2deg); }
          50% { transform: rotate(2.5deg); }
        }
        @keyframes islandFrondFlex {
          0%, 100% { transform: rotate(-1.5deg); }
          50% { transform: rotate(2deg); }
        }
        @keyframes islandWaveDrift {
          from { background-position: 0 0; }
          to { background-position: -220px 0; }
        }
        @keyframes islandTwinkle {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(0.6); }
        }
        @keyframes islandCloudDrift {
          from { transform: translateX(0); }
          to { transform: translateX(120vw); }
        }
        @keyframes islandSkeletonPulse {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 0.9; }
        }
        @keyframes bi-badge-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* â”€â”€ Ambient flourishes â”€â”€ */
        .island-celestial-reflection {
          animation: islandReflectionShimmer 6s ease-in-out infinite;
        }
        @keyframes islandReflectionShimmer {
          0%, 100% { opacity: 0.75; transform: translateX(-50%) scaleX(1); }
          50% { opacity: 1; transform: translateX(-50%) scaleX(1.12); }
        }
        .island-firefly {
          animation-name: islandFireflyDrift;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
        @keyframes islandFireflyDrift {
          0%   { transform: translate(0, 0); opacity: 0; }
          12%  { opacity: 0.9; }
          35%  { transform: translate(26px, -22px); opacity: 0.5; }
          55%  { transform: translate(-12px, -38px); opacity: 0.95; }
          78%  { transform: translate(18px, -14px); opacity: 0.4; }
          100% { transform: translate(0, 0); opacity: 0; }
        }
        .island-bird {
          position: absolute;
          left: -5%;
          animation-name: islandBirdFly;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        @keyframes islandBirdFly {
          0%   { transform: translateX(0) translateY(0); }
          25%  { transform: translateX(28vw) translateY(-10px); }
          50%  { transform: translateX(56vw) translateY(4px); }
          75%  { transform: translateX(84vw) translateY(-8px); }
          100% { transform: translateX(115vw) translateY(0); }
        }
        .island-bonfire {
          animation: islandBonfireFlicker 3.2s ease-in-out infinite;
        }
        @keyframes islandBonfireFlicker {
          0%, 100% { filter: brightness(1); }
          40% { filter: brightness(1.25); }
          70% { filter: brightness(0.9); }
        }

        /* â”€â”€ Occasional shooting star (night flourish) â”€â”€ */
        .island-shooting-star {
          position: absolute;
          width: 90px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.85));
          border-radius: 999px;
          opacity: 0;
          transform: rotate(18deg);
          filter: drop-shadow(0 0 3px rgba(190,225,255,0.7));
          animation: islandShootingStar 16s ease-in infinite;
          pointer-events: none;
        }
        @keyframes islandShootingStar {
          0%, 92% { opacity: 0; transform: translate(0, 0) rotate(18deg); }
          93% { opacity: 0.9; }
          100% { opacity: 0; transform: translate(180px, 60px) rotate(18deg); }
        }

        /* â”€â”€ Motion primitives (StatusDot pulse, button shine, NuggieChip flip) â”€â”€ */
        @keyframes re-pulse {
          0%, 100% { box-shadow: 0 0 0 0 var(--dotc); }
          70% { box-shadow: 0 0 0 6px transparent; }
        }
        @keyframes re-shine {
          from { transform: translateX(-120%) skewX(-18deg); }
          to   { transform: translateX(320%) skewX(-18deg); }
        }
        @keyframes re-flip {
          0%   { transform: rotateY(0); }
          100% { transform: rotateY(1800deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .re-pulse-el { animation: none !important; }
          .re-flip-el  { animation: none !important; }
        }

        /* â”€â”€ Tabular figures â€” prevents counter jitter on live numbers â”€â”€ */
        .island-tnum {
          font-variant-numeric: tabular-nums lining-nums slashed-zero;
        }

        /* â”€â”€ Button base states â”€â”€ */
        .island-btn {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          transition: transform 160ms cubic-bezier(.2,.8,.2,1), box-shadow 200ms ease, filter 200ms ease, opacity 140ms ease;
        }
        .island-btn:hover:not(:disabled) {
          transform: translateY(-2px);
        }
        .island-btn:active:not(:disabled) {
          transform: translateY(1px) scale(.985);
        }
        .island-btn .bi-sheen { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
        .island-btn:hover .bi-sheen::after {
          content: "";
          position: absolute;
          top: 0; bottom: 0;
          width: 34%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent);
          animation: re-shine .7s ease forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .island-btn:hover .bi-sheen::after { animation: none; }
        }
        .island-btn:focus-visible {
          outline: 2.5px solid #8fb4ff;
          outline-offset: 2px;
        }
        .island-btn:disabled {
          opacity: 0.48;
          cursor: not-allowed;
          filter: none;
          transform: none;
          box-shadow: none;
        }

        /* â”€â”€ Nuggies showcase ("trophy case") slot lift â”€â”€ */
        .nuggie-showcase-slot {
          transition: transform 180ms cubic-bezier(.2,.8,.2,1), filter 180ms ease;
        }
        .nuggie-showcase-slot:hover {
          transform: translateY(-3px);
          filter: brightness(1.12);
        }
        @media (prefers-reduced-motion: reduce) {
          .nuggie-showcase-slot:hover { transform: none; }
        }

        /* â”€â”€ Input / textarea / select focus â”€â”€ */
        input:focus, textarea:focus, select:focus {
          outline: 2px solid var(--bi-primary-glow);
          outline-offset: 0;
          border-color: var(--bi-primary-glow) !important;
        }

        /* â”€â”€ Universal keyboard focus ring â”€â”€
           Most interactive elements are styled inline without the .island-btn
           class; default UA outlines are nearly invisible on glass panels.
           One rule makes every focusable element keyboard-discoverable. */
        :focus-visible {
          outline: 2.5px solid #8fb4ff;
          outline-offset: 2px;
          border-radius: 6px;
        }

        /* â”€â”€ Responsive layout utilities â”€â”€ */

        /* Home page top row: Nuggies | Logo | Friends Online
           Collapses to 2-col (logo hidden) at tablet, 1-col at mobile. */
        .bi-home-top {
          display: grid;
          gap: 16px;
          align-items: stretch;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .bi-home-top > * { min-width: 0; }

        /* Below desktop the three cards stack full-width. */
        @media (max-width: 900px) {
          .bi-home-top { grid-template-columns: 1fr; }
        }

        /* Nuggies page top row: summary cards on the left, activity on the right.
           Collapses to a single column on narrow viewports. */
        .bi-nuggies-top {
          display: grid;
          gap: 12px;
          align-items: start;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        }
        .bi-nuggies-top > * { min-width: 0; }
        @media (max-width: 860px) {
          .bi-nuggies-top { grid-template-columns: 1fr; }
        }

        /* Main app content wrapper */
        .bi-main {
          max-width: 1200px;
          width: 100%;
          margin: 1.25rem auto;
          padding: clamp(0.9rem, 2.5vw, 1.5rem);
          border-radius: 14px;
        }

        /* Topbar spacer â€” height tied to --bi-topbar-h so a single change keeps them in sync */
        .bi-topbar-spacer { height: var(--bi-topbar-h, 62px); }

        /* Admin / settings two-column forms â€” stack on phones */
        .bi-admin-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .bi-admin-grid > * { min-width: 0; }

        /* Home trending row â€” stack art above copy on narrow screens */
        .bi-trending-row {
          display: grid;
          grid-template-columns: 18px 92px minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
        }

        /* Games stream drawer â€” bottom sheet on phones */
        .bi-stream-drawer {
          position: fixed;
          right: 0;
          top: calc(var(--bi-topbar-h, 62px) + 8px);
          bottom: 0;
          z-index: 55;
          transform: translateX(100%);
          transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .bi-stream-drawer--open { transform: translateX(0); }
        .bi-stream-tab {
          position: fixed;
          right: 0;
          top: 44%;
          z-index: 60;
        }

        /* Admin member roster table */
        .bi-admin-member-head,
        .bi-admin-member-row {
          display: grid;
          grid-template-columns: 1.2fr 1.6fr 90px 80px;
          gap: 12px;
          align-items: center;
        }

        /* Toast host â€” clear bottom tab bar on phones */
        .bi-toast-host {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 90;
        }

        /* Forums sticky thread header */
        .bi-forum-sticky-head {
          position: sticky;
          top: calc(var(--bi-topbar-h, 62px) + 8px);
          z-index: 20;
        }

        /* â”€â”€ Topbar narrow (â‰¤640px) â”€â”€ */
        @media (max-width: 640px) {
          /* Tab bar carries primary nav â€” hide duplicate hamburger */
          .bi-megamenu-trigger { display: none !important; }

          .bi-topbar-search-label { display: none; }
          .bi-topbar-search {
            padding: 8px !important;
            justify-content: center;
          }
          .bi-topbar-user-handle,
          .bi-topbar-user-chevron { display: none; }
          .bi-topbar-user-trigger { padding: 4px !important; }

          .bi-toast-host {
            bottom: calc(88px + env(safe-area-inset-bottom, 0px));
            left: 12px;
            right: 12px;
            width: auto !important;
            max-width: none !important;
          }

          .bi-stream-drawer {
            left: 0;
            right: 0;
            top: auto;
            bottom: calc(88px + env(safe-area-inset-bottom, 0px));
            width: 100% !important;
            max-width: none !important;
            max-height: 55vh;
            border-top-left-radius: 14px;
            border-top-right-radius: 14px;
            border-right: 1px solid var(--bi-border);
            transform: translateY(100%);
          }
          .bi-stream-drawer--open { transform: translateY(0); }
          .bi-stream-tab {
            right: 12px;
            bottom: calc(96px + env(safe-area-inset-bottom, 0px));
            top: auto;
            transform: none;
            writing-mode: horizontal-tb;
            border-radius: 999px;
            padding: 10px 14px !important;
          }

          .bi-trending-row {
            grid-template-columns: 18px minmax(0, 1fr);
            grid-template-rows: auto auto;
          }
          .bi-trending-row-art {
            grid-column: 1 / -1;
            justify-self: start;
          }

          .bi-admin-grid { grid-template-columns: 1fr; }
          .bi-admin-member-head { display: none; }
          .bi-admin-member-row {
            grid-template-columns: 1fr;
            gap: 8px;
            align-items: start;
          }
        }

        @media (max-width: 480px) {
          .bi-brand-tagline { display: none; }
          .bi-brand { max-width: 52px !important; }
          .bi-brand .island-display { display: none; }
        }

        /* â”€â”€ Mobile (â‰¤720px) layout collapses â”€â”€ */
        @media (max-width: 720px) {
          /* Games page: side-by-side split stacks to one column */
          .bi-games-split { grid-template-columns: 1fr !important; }

          /* Palm frames eat too much width on phones â€” hide them */
          .bi-palm-frame { display: none !important; }
        }

        @media (prefers-reduced-motion: reduce) {
          .island-palm-canopy-l,
          .island-palm-canopy-r,
          [class^="island-frond"],
          .island-cloud-a,
          .island-cloud-b,
          .island-cloud-c,
          .island-celestial-reflection,
          .island-bonfire,
          .bi-anchor-flash {
            animation: none !important;
          }
          .island-shooting-star,
          .island-firefly,
          .island-bird {
            display: none !important;
          }
          .island-btn {
            transition: none !important;
          }
        }
      `}
    </style>
  );
}
