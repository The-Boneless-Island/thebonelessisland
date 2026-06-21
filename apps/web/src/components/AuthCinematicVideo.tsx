import { useCallback, useEffect, useRef, useState } from "react";
import { islandTheme } from "../theme.js";

type AuthCinematicVideoProps = {
  /** Base path without extension, e.g. `/auth/login-intro` */
  basePath: string;
  loop?: boolean;
  /** Called when a one-shot clip ends or is skipped (post-login return). */
  onComplete?: () => void;
  skippable?: boolean;
  zIndex?: number;
};

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function AuthCinematicVideo({
  basePath,
  loop = false,
  onComplete,
  skippable = true,
  zIndex = 1,
}: AuthCinematicVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const completedRef = useRef(false);
  const reducedMotion = useRef(prefersReducedMotion()).current;
  const [failed, setFailed] = useState(false);
  const [skipped, setSkipped] = useState(false);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete?.();
  }, [onComplete]);

  useEffect(() => {
    if (reducedMotion && onComplete) {
      finish();
    }
  }, [reducedMotion, onComplete, finish]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || reducedMotion || failed) return;
    v.play().catch(() => setFailed(true));
  }, [basePath, reducedMotion, failed]);

  function handleSkip() {
    if (!skippable || skipped) return;
    setSkipped(true);
    const v = videoRef.current;
    if (v) v.pause();
    if (onComplete) {
      finish();
    }
  }

  function handleEnded() {
    if (!loop) finish();
  }

  function handleError() {
    setFailed(true);
    if (onComplete) finish();
  }

  const fallbackBg =
    "linear-gradient(180deg, #0c4a6e 0%, #0369a1 42%, #f59e0b 78%, #fde68a 100%)";

  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex,
          overflow: "hidden",
          background: fallbackBg,
        }}
      >
        {!reducedMotion && !failed ? (
          <video
            ref={videoRef}
            key={basePath}
            muted
            loop={loop}
            autoPlay
            playsInline
            onEnded={handleEnded}
            onError={handleError}
            onClick={skippable ? handleSkip : undefined}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              cursor: skippable ? "pointer" : undefined,
            }}
          >
            <source src={`${basePath}.webm`} type="video/webm" />
            <source src={`${basePath}.mp4`} type="video/mp4" />
          </video>
        ) : null}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(6,14,28,.18) 0%, transparent 30%, transparent 65%, rgba(6,14,28,.28) 100%)",
            pointerEvents: "none",
          }}
        />
      </div>

      {skippable && !skipped && !reducedMotion && !failed ? (
        <button
          type="button"
          onClick={handleSkip}
          className="island-mono"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: zIndex + 1,
            padding: "6px 12px",
            borderRadius: islandTheme.radius.control,
            border: `1px solid ${islandTheme.color.cardBorder}`,
            background: islandTheme.color.panelBg,
            backdropFilter: islandTheme.glass.blur,
            WebkitBackdropFilter: islandTheme.glass.blur,
            color: islandTheme.color.textMuted,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Skip
        </button>
      ) : null}
    </>
  );
}
