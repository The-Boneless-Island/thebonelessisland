import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type DayNightMode = "day" | "night";
export type DayNightPreference = "auto" | "day" | "night";

const STORAGE_KEY = "island.theme";

// How often (ms) auto mode re-checks the local hour so it can flip at the
// day/night boundary while the page stays open.
const AUTO_REEVAL_MS = 5 * 60 * 1000;

type DayNightContextValue = {
  mode: DayNightMode;
  preference: DayNightPreference;
  isTransitioning: boolean;
  toggle: () => void;
  set: (mode: DayNightMode) => void;
  setPreference: (preference: DayNightPreference) => void;
  /** Cycle the preference: auto → day → night → auto. */
  cyclePreference: () => void;
};

const DayNightContext = createContext<DayNightContextValue | null>(null);

function readInitialPreference(): DayNightPreference {
  if (typeof window === "undefined") return "auto";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "auto" || stored === "day" || stored === "night") return stored;
  } catch {
    // ignore storage errors
  }
  return "auto";
}

// Day is roughly 7:00–19:00 local; night otherwise.
function modeForHour(hour: number): DayNightMode {
  return hour >= 7 && hour < 19 ? "day" : "night";
}

function resolveMode(preference: DayNightPreference): DayNightMode {
  if (preference === "day" || preference === "night") return preference;
  if (typeof window === "undefined") return "night";
  return modeForHour(new Date().getHours());
}

type DayNightProviderProps = {
  children: ReactNode;
};

export function DayNightProvider({ children }: DayNightProviderProps) {
  const [preference, setPreferenceState] = useState<DayNightPreference>(readInitialPreference);
  const [mode, setMode] = useState<DayNightMode>(() => resolveMode(readInitialPreference()));
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // ignore
    }
  }, [preference]);

  // Drive the effective mode toward `next`, animating the flip via isTransitioning.
  const driveMode = useCallback((next: DayNightMode) => {
    setMode((current) => {
      if (current === next) return current;
      setIsTransitioning(true);
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
      transitionTimerRef.current = window.setTimeout(() => {
        setIsTransitioning(false);
        transitionTimerRef.current = null;
      }, 2400);
      return next;
    });
  }, []);

  // When the preference is auto, derive the mode from the local hour and
  // re-evaluate periodically so it flips at the 7:00 / 19:00 boundary.
  useEffect(() => {
    if (preference !== "auto") {
      driveMode(preference);
      return;
    }
    driveMode(resolveMode("auto"));
    const id = window.setInterval(() => {
      driveMode(resolveMode("auto"));
    }, AUTO_REEVAL_MS);
    return () => window.clearInterval(id);
  }, [preference, driveMode]);

  const set = useCallback(
    (next: DayNightMode) => {
      setPreferenceState(next);
    },
    []
  );

  const setPreference = useCallback((next: DayNightPreference) => {
    setPreferenceState(next);
  }, []);

  const cyclePreference = useCallback(() => {
    setPreferenceState((current) =>
      current === "auto" ? "day" : current === "day" ? "night" : "auto"
    );
  }, []);

  const toggle = useCallback(() => {
    set(mode === "day" ? "night" : "day");
  }, [mode, set]);

  useEffect(
    () => () => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
    },
    []
  );

  const value = useMemo<DayNightContextValue>(
    () => ({ mode, preference, isTransitioning, toggle, set, setPreference, cyclePreference }),
    [mode, preference, isTransitioning, toggle, set, setPreference, cyclePreference]
  );

  return <DayNightContext.Provider value={value}>{children}</DayNightContext.Provider>;
}

export function useDayNight(): DayNightContextValue {
  const value = useContext(DayNightContext);
  if (!value) {
    throw new Error("useDayNight must be used inside <DayNightProvider>");
  }
  return value;
}
