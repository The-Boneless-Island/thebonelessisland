import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { islandTheme } from "../theme.js";

export type ToastTone = "success" | "error" | "info";

export type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
  leaving: boolean;
};

const TOAST_DURATION_MS = 4200;
const TOAST_EXIT_MS = 260;

// ── Direct toast queue ────────────────────────────────────────────────────────
// Any code can push a toast by calling pushToast(message, tone) via the
// context. Used for events that don't fit the status-string pattern
// (achievement unlocks, etc.).

export type ToastQueue = {
  toasts: ToastItem[];
  pushToast: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
  pauseToast: (id: number) => void;
  resumeToast: (id: number) => void;
};

const ToastContext = createContext<ToastQueue | null>(null);

export function useToastQueue(): ToastQueue {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(1);
  // Auto-dismiss timers, keyed by toast id.
  const timersRef = useRef<Map<number, number>>(new Map());
  // Exit-animation timers, keyed by toast id.
  const exitTimersRef = useRef<Map<number, number>>(new Map());

  const remove = useCallback((toastId: number) => {
    const timeoutId = timersRef.current.get(toastId);
    if (typeof timeoutId === "number") {
      window.clearTimeout(timeoutId);
      timersRef.current.delete(toastId);
    }
    const exitId = exitTimersRef.current.get(toastId);
    if (typeof exitId === "number") {
      window.clearTimeout(exitId);
      exitTimersRef.current.delete(toastId);
    }
    setToasts((current) => current.filter((item) => item.id !== toastId));
  }, []);

  // Begin the leaving phase: stop the auto-dismiss timer, play the exit
  // animation, then unmount once it has finished.
  const dismiss = useCallback(
    (toastId: number) => {
      if (exitTimersRef.current.has(toastId)) return;
      const timeoutId = timersRef.current.get(toastId);
      if (typeof timeoutId === "number") {
        window.clearTimeout(timeoutId);
        timersRef.current.delete(toastId);
      }
      setToasts((current) =>
        current.map((item) =>
          item.id === toastId ? { ...item, leaving: true } : item
        )
      );
      const exitId = window.setTimeout(() => remove(toastId), TOAST_EXIT_MS);
      exitTimersRef.current.set(toastId, exitId);
    },
    [remove]
  );

  const startTimer = useCallback(
    (id: number) => {
      const timeoutId = window.setTimeout(() => {
        timersRef.current.delete(id);
        dismiss(id);
      }, TOAST_DURATION_MS);
      timersRef.current.set(id, timeoutId);
    },
    [dismiss]
  );

  // Pause-on-hover: halt the auto-dismiss timer while hovered (no-op once the
  // toast is already leaving).
  const pauseToast = useCallback((id: number) => {
    if (exitTimersRef.current.has(id)) return;
    const timeoutId = timersRef.current.get(id);
    if (typeof timeoutId === "number") {
      window.clearTimeout(timeoutId);
      timersRef.current.delete(id);
    }
  }, []);

  const resumeToast = useCallback(
    (id: number) => {
      if (exitTimersRef.current.has(id)) return;
      if (timersRef.current.has(id)) return;
      startTimer(id);
    },
    [startTimer]
  );

  const pushToast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextIdRef.current++;
      setToasts((current) => [...current, { id, message, tone, leaving: false }]);
      startTimer(id);
    },
    [startTimer]
  );

  useEffect(
    () => () => {
      for (const timeoutId of timersRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      timersRef.current.clear();
      for (const exitId of exitTimersRef.current.values()) {
        window.clearTimeout(exitId);
      }
      exitTimersRef.current.clear();
    },
    []
  );

  return { toasts, pushToast, dismiss, pauseToast, resumeToast };
}

export function ToastQueueProvider({
  queue,
  children,
}: {
  queue: ToastQueue;
  children: React.ReactNode;
}) {
  return <ToastContext.Provider value={queue}>{children}</ToastContext.Provider>;
}

export function usePushToast(): (message: string, tone?: ToastTone) => void {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Safe no-op fallback so a missing provider can't crash the tree.
    return () => {};
  }
  return ctx.pushToast;
}

const SUCCESS_PREFIXES = [
  "loaded",
  "synced",
  "saved",
  "created",
  "joined",
  "left",
  "finalized",
  "reopened",
  "steam sync complete",
  "logged out"
] as const;

function classifyStatus(status: string): ToastTone | null {
  if (!status || status === "Idle") return null;
  const normalized = status.toLowerCase();
  if (normalized.includes("failed") || normalized.includes("error")) {
    return "error";
  }
  if (SUCCESS_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return "success";
  }
  return null;
}

/**
 * Watch a status string. When a new value matches the success/error pattern,
 * push a toast onto the shared queue. Stateless — the queue owns the toasts.
 */
export function useToastsFromStatus(
  status: string,
  pushToast: (message: string, tone?: ToastTone) => void
) {
  useEffect(() => {
    const tone = classifyStatus(status);
    if (!tone) return;
    pushToast(status, tone);
  }, [status, pushToast]);
}

type ToastHostProps = {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
};

// Tone glyphs — a wave for info, a check for success, a coral for error.
const TONE_ICON: Record<ToastTone, string> = {
  info: "🌊",
  success: "✓",
  error: "🪸"
};

export function ToastHost({ toasts, onDismiss }: ToastHostProps) {
  // Pause/resume live on the shared queue; fall back to no-ops if the host is
  // ever rendered outside a provider so existing call sites keep working.
  const ctx = useContext(ToastContext);
  const pauseToast = ctx?.pauseToast;
  const resumeToast = ctx?.resumeToast;

  return (
    <>
      <style>{`
        @keyframes islandToastIn {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes islandToastOut {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateY(14px) scale(0.97);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .island-toast {
            animation: none !important;
          }
          .island-toast--leaving {
            opacity: 0;
          }
        }
      `}</style>
      {toasts.length ? (
        <div
          style={{
            position: "fixed",
            right: 18,
            bottom: 18,
            zIndex: 90,
            display: "grid",
            gap: 8,
            width: "min(360px, calc(100vw - 24px))",
            maxWidth: "calc(100vw - 24px)"
          }}
        >
          {toasts.map((toast) => {
            const toneStyle =
              toast.tone === "error"
                ? {
                    border: `1px solid ${islandTheme.color.danger}`,
                    background: islandTheme.color.dangerSurface,
                    color: islandTheme.color.dangerText
                  }
                : toast.tone === "success"
                  ? {
                      border: `1px solid ${islandTheme.color.success}`,
                      background: islandTheme.color.success,
                      color: islandTheme.color.successText
                    }
                  : {
                      border: `1px solid ${islandTheme.color.info}`,
                      background: islandTheme.color.info,
                      color: islandTheme.color.infoText
                    };
            return (
              <div
                key={toast.id}
                className={`island-toast${toast.leaving ? " island-toast--leaving" : ""}`}
                onMouseEnter={() => pauseToast?.(toast.id)}
                onMouseLeave={() => resumeToast?.(toast.id)}
                style={{
                  borderRadius: islandTheme.radius.control,
                  padding: "0.58rem 0.6rem 0.58rem 0.7rem",
                  boxShadow: islandTheme.shadow.toast,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  animation: toast.leaving
                    ? `islandToastOut ${islandTheme.motion.dur.fast} ${islandTheme.motion.ease.out} forwards`
                    : `islandToastIn ${islandTheme.motion.dur.med} ${islandTheme.motion.ease.out}`,
                  ...toneStyle
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>
                    {TONE_ICON[toast.tone]}
                  </span>
                  <span>{toast.message}</span>
                </span>
                <button
                  onClick={() => onDismiss(toast.id)}
                  aria-label="Dismiss notification"
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "inherit",
                    cursor: "pointer",
                    fontSize: 16,
                    lineHeight: 1,
                    opacity: 0.86,
                    padding: "0 0.12rem"
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
