import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type LoginOverlayContextValue = {
  loginOverlayActive: boolean;
  setLoginOverlayActive: (active: boolean) => void;
};

const LoginOverlayContext = createContext<LoginOverlayContextValue | null>(null);

export function LoginOverlayProvider({ children }: { children: ReactNode }) {
  const [loginOverlayActive, setLoginOverlayActive] = useState(false);
  const value = useMemo(
    () => ({ loginOverlayActive, setLoginOverlayActive }),
    [loginOverlayActive]
  );
  return <LoginOverlayContext.Provider value={value}>{children}</LoginOverlayContext.Provider>;
}

export function useLoginOverlay(): LoginOverlayContextValue {
  const ctx = useContext(LoginOverlayContext);
  if (!ctx) {
    throw new Error("useLoginOverlay must be used within LoginOverlayProvider");
  }
  return ctx;
}
