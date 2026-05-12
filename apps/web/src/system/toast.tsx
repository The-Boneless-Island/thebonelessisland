import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { islandTheme } from "../theme.js";

export type ToastTone = "success" | "error" | "info";

export type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

const TOAST_DURATION_MS = 4200;

// ── Direct toast queue ────────────────────────────────────────────────────────
// Any code can push a toast by calling pushToast(message, tone) via the
// context. Used for events that don't fit the status-string pattern
// (achievement unlocks, etc.).

export type ToastQueue = {
  toasts: ToastItem[];
  pushToast: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastQueue | null>(null);

export function useToastQueue(): ToastQueue {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(1);
  const timersRef = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((toastId: number) => {
    const timeoutId = timersRef.current.get(toastId);
    if (typeof timeoutId === "number") {
      window.clearTimeout(timeoutId);
      timersRef.current.delete(toastId);
    }
    setToasts((current) => current.filter((item) => item.id !== toastId));
  }, []);

  const pushToast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = nextIdRef.current++;
    setToasts((current) => [...current, { id, message, tone }]);
    const timeoutId = window.setTimeout(() => {
      timersRef.current.delete(id);
      setToasts((current) => current.filter((item) => item.id !== id));
    }, TOAST_DURATION_MS);
    timersRef.current.set(id, timeoutId);
  }, []);

  useEffect(
    () => () => {
      for (const timeoutId of timersRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      timersRef.current.clear();
    },
    []
  );

  return { toasts, pushToast, dismiss };
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
  "logged out",
  "vote saved"
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

export function ToastHost({ toasts, onDismiss }: ToastHostProps) {
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
                style={{
                  borderRadius: islandTheme.radius.control,
                  padding: "0.58rem 0.6rem 0.58rem 0.7rem",
                  boxShadow: islandTheme.shadow.toast,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  animation: `islandToastIn ${islandTheme.motion.dur.med} ${islandTheme.motion.ease.out}`,
                  ...toneStyle
                }}
              >
                <span>{toast.message}</span>
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
