import { useEffect, useRef, useState, type ReactNode } from "react";
import { dayThemeVars, islandTheme, nightThemeVars } from "../theme.js";
import { DayNightProvider, useDayNight } from "./useDayNight.js";

type IslandSceneShellProps = {
  children: ReactNode;
};

export function IslandSceneShell({ children }: IslandSceneShellProps) {
  return (
    <DayNightProvider>
      <SceneGlobalStyles />
      <SceneBackdrop />
      <PalmFrameLeft />
      <PalmFrameRight />
      {children}
    </DayNightProvider>
  );
}

function SceneBackdrop() {
  const { mode } = useDayNight();
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
        transition: "background 1200ms ease",
        background:
          mode === "day"
            ? "radial-gradient(ellipse 70% 50% at 50% 0%, #fef3c7 0%, transparent 55%), linear-gradient(180deg, #87ceeb 0%, #a8d6ee 30%, #c8e3f1 55%, #e8d4a8 78%, #d4b677 100%)"
            : "radial-gradient(ellipse 80% 60% at 70% 0%, rgba(96,165,250,0.18), transparent 60%), radial-gradient(ellipse 80% 50% at 20% 5%, rgba(192,132,252,0.14), transparent 60%), linear-gradient(180deg, #0b1d3a 0%, #0f172a 35%, #08111f 70%, #06101c 100%)"
      }}
    >
      <Stars active={mode === "night"} />
      <Clouds active={mode === "day"} />
      <Birds active={mode === "day"} />
      <Celestial mode={mode} />
      <OceanBand mode={mode} />
      <CelestialReflection mode={mode} />
      <GoldenHourWash />
      <BeachBand mode={mode} />
      <BeachProps mode={mode} />
      <Fireflies active={mode === "night"} />
      <CelebrationFlourish />
      <SceneVignette mode={mode} />
    </div>
  );
}

// ── Celebration flourish ─────────────────────────────────────────────────────
// One-shot shooting star when a celebration fires anywhere in the app
// (milestone rank-up, achievement). Listens for the "bi:scene-flourish"
// window event dispatched by the celebration system — no prop threading.

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

// ── Golden hour ──────────────────────────────────────────────────────────────
// Dawn (6–8) and sunset (17–19) wash the scene in the tropical sunset palette.
// Deliberately NOT a third theme mode: text/contrast vars stay binary
// day/night; this is pure scene ambience, so evenings — when the crew actually
// plays — get the prettiest sky without a contrast audit.

type GoldenPhase = "dawn" | "sunset" | null;

function goldenPhaseForHour(hour: number): GoldenPhase {
  if (hour >= 6 && hour < 8) return "dawn";
  if (hour >= 17 && hour < 19) return "sunset";
  return null;
}

function useGoldenPhase(): GoldenPhase {
  const [phase, setPhase] = useState<GoldenPhase>(() => goldenPhaseForHour(new Date().getHours()));
  useEffect(() => {
    const id = window.setInterval(() => {
      setPhase(goldenPhaseForHour(new Date().getHours()));
    }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);
  return phase;
}

function GoldenHourWash() {
  const phase = useGoldenPhase();
  const sunset = islandTheme.palette;
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity: phase ? 1 : 0,
        transition: "opacity 2400ms ease",
        background:
          phase === "dawn"
            ? `linear-gradient(180deg, transparent 0%, ${sunset.dawn}26 34%, ${sunset.coral}1f 52%, ${sunset.dawn}14 66%, transparent 84%)`
            : `linear-gradient(180deg, transparent 0%, ${sunset.sunset}2e 32%, ${sunset.coral}29 50%, ${sunset.sunsetDeep}1f 64%, transparent 84%)`
      }}
    />
  );
}

// ── Ambient flourishes ───────────────────────────────────────────────────────
// All of these are decoration-only: transform/opacity animations, hidden under
// prefers-reduced-motion, zero per-frame JS.

/** Shimmering column of light on the ocean directly below the sun/moon. */
function CelestialReflection({ mode }: { mode: "day" | "night" }) {
  const color =
    mode === "day"
      ? "rgba(253, 230, 138, 0.34)"
      : "rgba(186, 230, 253, 0.22)";
  return (
    <div
      aria-hidden="true"
      className="island-celestial-reflection"
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: 110,
        height: "22%",
        transform: "translateX(-50%)",
        background: `linear-gradient(180deg, ${color} 0%, transparent 90%)`,
        maskImage: "linear-gradient(90deg, transparent 0%, black 30%, black 70%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(90deg, transparent 0%, black 30%, black 70%, transparent 100%)",
        mixBlendMode: "screen",
        transition: "background 1200ms ease",
        pointerEvents: "none"
      }}
    />
  );
}

/** A few slow fireflies drifting over the night beach. */
function Fireflies({ active }: { active: boolean }) {
  const flies = [
    { left: "12%", bottom: "9%", dur: "11s", delay: "0s" },
    { left: "28%", bottom: "11%", dur: "14s", delay: "-4s" },
    { left: "64%", bottom: "10%", dur: "12s", delay: "-7s" },
    { left: "82%", bottom: "12%", dur: "16s", delay: "-2s" }
  ];
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        opacity: active ? 1 : 0,
        transition: "opacity 1500ms ease",
        pointerEvents: "none"
      }}
    >
      {flies.map((f, i) => (
        <span
          key={i}
          className="island-firefly"
          style={{
            position: "absolute",
            left: f.left,
            bottom: f.bottom,
            width: 4,
            height: 4,
            borderRadius: 999,
            background: "#fde68a",
            boxShadow: "0 0 8px 2px rgba(253, 230, 138, 0.55)",
            animationDuration: f.dur,
            animationDelay: f.delay
          }}
        />
      ))}
    </div>
  );
}

/** Two distant bird silhouettes crossing the day sky. */
function Birds({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        opacity: active ? 1 : 0,
        transition: "opacity 1500ms ease",
        pointerEvents: "none"
      }}
    >
      <span className="island-bird" style={{ top: "14%", animationDuration: "70s", animationDelay: "-12s" }}>
        <BirdGlyph size={16} />
      </span>
      <span className="island-bird" style={{ top: "22%", animationDuration: "95s", animationDelay: "-50s" }}>
        <BirdGlyph size={11} />
      </span>
    </div>
  );
}

function BirdGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.45} viewBox="0 0 20 9" fill="none" aria-hidden="true">
      <path d="M1 7 Q5 1 10 6 Q15 1 19 7" stroke="rgba(30, 41, 59, 0.55)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Small props scattered on the beach band; selection rotates by day-of-month
 *  (same trick as the shooting star) so the shore feels lived-in but stable
 *  within a day. Night adds a faint bonfire glow. */
function BeachProps({ mode }: { mode: "day" | "night" }) {
  const day = new Date().getDate();
  const props = [
    { key: "driftwood", left: `${10 + (day % 5) * 4}%`, node: <DriftwoodGlyph /> },
    { key: "starfish", left: `${68 + (day % 4) * 5}%`, node: <StarfishGlyph /> }
  ];
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "8%", pointerEvents: "none" }}>
      {props.map((p) => (
        <span
          key={p.key}
          style={{
            position: "absolute",
            left: p.left,
            bottom: "22%",
            opacity: mode === "day" ? 0.5 : 0.3,
            transition: "opacity 1200ms ease"
          }}
        >
          {p.node}
        </span>
      ))}
      {/* Night bonfire glow near the right palm */}
      <span
        className="island-bonfire"
        style={{
          position: "absolute",
          right: "18%",
          bottom: "10%",
          width: 90,
          height: 50,
          borderRadius: "50%",
          background: "radial-gradient(ellipse at 50% 80%, rgba(251, 146, 60, 0.4) 0%, rgba(245, 158, 11, 0.18) 45%, transparent 75%)",
          opacity: mode === "night" ? 1 : 0,
          transition: "opacity 1500ms ease"
        }}
      />
    </div>
  );
}

function DriftwoodGlyph() {
  return (
    <svg width="44" height="12" viewBox="0 0 44 12" aria-hidden="true">
      <path d="M2 9 Q10 4 22 6 Q34 8 42 4 L42 7 Q30 11 18 9 Q8 8 2 11 Z" fill="#5c3d24" opacity="0.85" />
      <path d="M6 8 Q14 5 24 7" stroke="#3d2817" strokeWidth="1" fill="none" opacity="0.6" />
    </svg>
  );
}

function StarfishGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M10 1 L12.2 7 L18.5 7.4 L13.6 11.4 L15.4 17.6 L10 14 L4.6 17.6 L6.4 11.4 L1.5 7.4 L7.8 7 Z"
        fill="#ef8354"
        opacity="0.85"
      />
    </svg>
  );
}

function Stars({ active }: { active: boolean }) {
  // A tiny date-keyed flourish: a single shooting star whose horizontal start
  // position shifts day to day, so the night sky feels a touch different each
  // evening without any per-frame work. The CSS animation handles the motion;
  // prefers-reduced-motion hides it via the .island-shooting-star guard.
  const shootingLeft = `${8 + (new Date().getDate() % 10) * 8}%`;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: active ? 0.85 : 0,
        transition: "opacity 1500ms ease"
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          animation: "islandTwinkle 4s ease-in-out infinite",
          backgroundImage: [
            "radial-gradient(1px 1px at 12% 18%, white, transparent)",
            "radial-gradient(1px 1px at 22% 38%, white, transparent)",
            "radial-gradient(1.5px 1.5px at 35% 12%, white, transparent)",
            "radial-gradient(1px 1px at 48% 28%, white, transparent)",
            "radial-gradient(1px 1px at 62% 8%, white, transparent)",
            "radial-gradient(1.5px 1.5px at 75% 22%, white, transparent)",
            "radial-gradient(1px 1px at 85% 35%, white, transparent)",
            "radial-gradient(1px 1px at 92% 14%, white, transparent)",
            "radial-gradient(1px 1px at 18% 48%, white, transparent)",
            "radial-gradient(1px 1px at 55% 42%, white, transparent)",
            "radial-gradient(1.5px 1.5px at 8% 28%, white, transparent)",
            "radial-gradient(1px 1px at 42% 52%, white, transparent)"
          ].join(", ")
        }}
      />
      {active ? (
        <span
          className="island-shooting-star"
          style={{ left: shootingLeft, top: "8%" }}
        />
      ) : null}
    </div>
  );
}

function Clouds({ active }: { active: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        left: "-10%",
        right: "-10%",
        top: 0,
        height: "40%",
        opacity: active ? 1 : 0,
        transition: "opacity 1500ms ease",
        pointerEvents: "none"
      }}
    >
      <Cloud className="island-cloud-a" left="8%" top="15%" width={180} drift="90s" />
      <Cloud className="island-cloud-b" left="50%" top="8%" width={240} drift="120s" delay="-40s" />
      <Cloud className="island-cloud-c" left="75%" top="22%" width={160} drift="100s" delay="-60s" />
    </div>
  );
}

type CloudProps = {
  className: string;
  left: string;
  top: string;
  width: number;
  drift: string;
  delay?: string;
};

function Cloud({ className, left, top, width, drift, delay = "0s" }: CloudProps) {
  return (
    <div
      className={className}
      style={{
        position: "absolute",
        left,
        top,
        width,
        height: width * 0.2,
        background: "white",
        borderRadius: 100,
        filter: "blur(0.5px)",
        opacity: 0.92,
        animation: `islandCloudDrift ${drift} linear infinite`,
        animationDelay: delay
      }}
    />
  );
}

function Celestial({ mode }: { mode: "day" | "night" }) {
  const { isTransitioning } = useDayNight();
  const ref = useRef<HTMLDivElement | null>(null);
  const [renderMode, setRenderMode] = useState(mode);

  useEffect(() => {
    if (!ref.current) {
      setRenderMode(mode);
      return;
    }
    const el = ref.current;
    el.style.transition = "transform 1100ms cubic-bezier(.55,0,.6,.4), opacity 700ms ease";
    el.style.setProperty("--celestial-y", "60vh");
    el.style.opacity = "0";
    const flipTimer = window.setTimeout(() => {
      setRenderMode(mode);
      el.style.transition = "none";
      el.style.setProperty("--celestial-y", "60vh");
      void el.offsetWidth;
      el.style.transition = "transform 1500ms cubic-bezier(.2,.6,.3,1), opacity 900ms ease";
      el.style.setProperty("--celestial-y", "0px");
      el.style.opacity = "1";
    }, 1100);
    return () => window.clearTimeout(flipTimer);
  }, [mode]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        position: "absolute",
        left: "50%",
        top: "7%",
        width: 160,
        height: 160,
        transform: "translate(-50%, 0) translateY(var(--celestial-y, 0))",
        opacity: isTransitioning ? undefined : 1,
        pointerEvents: "none"
      }}
    >
      {renderMode === "day" ? <SunDisc /> : <MoonDisc />}
    </div>
  );
}

function SunDisc() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 999,
        background:
          "radial-gradient(circle, #fff8d4 0%, #fde68a 30%, #f59e0b 70%, transparent 78%)",
        boxShadow: "0 0 60px rgba(253, 224, 71, 0.6), 0 0 120px rgba(251, 146, 60, 0.4)"
      }}
    />
  );
}

function MoonDisc() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 999,
        background:
          "radial-gradient(circle at 38% 38%, #fffbe7 0%, #e2e8f0 35%, #94a3b8 70%, transparent 78%)",
        boxShadow: "0 0 60px rgba(186, 230, 253, 0.4), 0 0 120px rgba(147, 197, 253, 0.25)"
      }}
    >
      <span
        style={{
          position: "absolute",
          width: 22,
          height: 22,
          left: "35%",
          top: "28%",
          borderRadius: 999,
          background: "rgba(100, 116, 139, 0.25)"
        }}
      />
      <span
        style={{
          position: "absolute",
          width: 14,
          height: 14,
          left: "58%",
          top: "55%",
          borderRadius: 999,
          background: "rgba(100, 116, 139, 0.25)",
          boxShadow: "-36px 12px 0 rgba(100,116,139,0.18)"
        }}
      />
    </div>
  );
}

function OceanBand({ mode }: { mode: "day" | "night" }) {
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          height: "30%",
          background:
            mode === "day"
              ? "linear-gradient(180deg, #4a9fc4 0%, #2d7a99 60%, #1e5f7a 100%)"
              : "linear-gradient(180deg, #0e3a52 0%, #082238 60%, #050f1c 100%)",
          transition: "background 1200ms ease",
          opacity: 0.92
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          height: "8%",
          backgroundImage: `repeating-linear-gradient(110deg,
            rgba(255,255,255,0) 0px,
            rgba(255,255,255,0) 28px,
            rgba(255,255,255,0.10) 28px,
            rgba(255,255,255,0.10) 30px,
            rgba(255,255,255,0) 30px,
            rgba(255,255,255,0) 60px
          )`,
          backgroundSize: "220px 100%",
          mixBlendMode: "screen",
          opacity: 0.85,
          animation: `islandWaveDrift ${islandTheme.motion.dur.ambient} linear infinite`
        }}
      />
    </>
  );
}

function BeachBand({ mode }: { mode: "day" | "night" }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: "8%",
        background:
          mode === "day"
            ? "linear-gradient(180deg, #f4e4c1 0%, #e8d4a8 60%, #c39d5e 100%)"
            : "linear-gradient(180deg, #8b7355 0%, #6b5640 60%, #3d2f22 100%)",
        boxShadow: "inset 0 8px 14px rgba(255, 255, 255, 0.12), inset 0 -8px 14px rgba(0, 0, 0, 0.18)",
        transition: "background 1200ms ease, filter 1200ms ease",
        filter: mode === "day" ? "brightness(1)" : "brightness(0.55)"
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 12,
          backgroundImage:
            "repeating-radial-gradient(circle at 50% 100%, rgba(255,255,255,0.85) 0 6px, transparent 6px 16px)",
          backgroundSize: "32px 12px",
          opacity: 0.7
        }}
      />
    </div>
  );
}

function SceneVignette({ mode }: { mode: "day" | "night" }) {
  // --bi-scene-tint lets pages subtly recolor the scene (news leans cool,
  // the arcade leans warm) without extra layers. App.tsx sets it per page.
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          mode === "day"
            ? "radial-gradient(ellipse at 50% 30%, var(--bi-scene-tint, transparent) 0%, transparent 65%), radial-gradient(ellipse at 50% 35%, transparent 50%, rgba(30, 60, 90, 0.18) 100%)"
            : "radial-gradient(ellipse at 50% 30%, var(--bi-scene-tint, transparent) 0%, transparent 65%), radial-gradient(ellipse at 50% 35%, transparent 40%, rgba(8, 16, 30, 0.55) 100%)",
        transition: "background 1200ms ease",
        pointerEvents: "none"
      }}
    />
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
        /* ── Cross-browser reset ── */
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
             Windows browsers have ~17px opaque scrollbar; macOS uses overlay — this normalises them. */
          scrollbar-gutter: stable;
        }
        html, body {
          margin: 0;
          background: var(--bi-app-bg);
          /* Kill rubber-band overscroll. Without this, scrolling past the top or
             bottom of the scene exposes the flat body background underneath the
             gradient sky/water — looks like the page "changes color". */
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

        /* ── Ambient flourishes ── */
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

        /* ── Occasional shooting star (night flourish) ── */
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

        /* ── Button base states ── */
        .island-btn {
          transition: filter 140ms ease, transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease;
        }
        .island-btn:hover:not(:disabled) {
          filter: brightness(1.14);
          transform: translateY(-1px);
          box-shadow: 0 4px 14px rgba(0,0,0,0.22);
        }
        .island-btn:active:not(:disabled) {
          filter: brightness(0.95);
          transform: translateY(0);
          box-shadow: none;
        }
        .island-btn:focus-visible {
          outline: 2px solid var(--bi-primary-glow);
          outline-offset: 2px;
        }
        .island-btn:disabled {
          opacity: 0.48;
          cursor: not-allowed;
          filter: none;
          transform: none;
          box-shadow: none;
        }

        /* ── Input / textarea / select focus ── */
        input:focus, textarea:focus, select:focus {
          outline: 2px solid var(--bi-primary-glow);
          outline-offset: 0;
          border-color: var(--bi-primary-glow) !important;
        }

        /* ── Universal keyboard focus ring ──
           Most interactive elements are styled inline without the .island-btn
           class; default UA outlines are nearly invisible on glass panels.
           One rule makes every focusable element keyboard-discoverable. */
        :focus-visible {
          outline: 2px solid var(--bi-primary-glow);
          outline-offset: 2px;
          border-radius: 6px;
        }

        /* ── Responsive layout utilities ── */

        /* Home page top row: Nuggies | Logo | Friends Online
           Collapses to 2-col (logo hidden) at tablet, 1-col at mobile. */
        .bi-home-top {
          display: grid;
          gap: 16px;
          align-items: start;
          grid-template-columns: minmax(240px, 320px) 1fr minmax(240px, 320px);
        }
        .bi-home-top > * { min-width: 0; }

        @media (max-width: 860px) {
          .bi-home-top {
            grid-template-columns: 1fr 1fr;
          }
          .bi-home-top > :nth-child(2) { display: none; }
        }
        @media (max-width: 540px) {
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

        /* Topbar spacer — height tied to --bi-topbar-h so a single change keeps them in sync */
        .bi-topbar-spacer { height: var(--bi-topbar-h, 62px); }

        /* ── Mobile (≤720px) layout collapses ── */
        @media (max-width: 720px) {
          /* Games page: side-by-side split + when/where stack to one column */
          .bi-games-split { grid-template-columns: 1fr !important; }
          .bi-when-where { grid-template-columns: 1fr !important; }

          /* Library rows/header: collapse the 6-col grid into a stacked card */
          .bi-lib-head { display: none !important; }
          .bi-lib-row {
            display: flex !important;
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
          }

          /* Palm frames eat too much width on phones — hide them */
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
