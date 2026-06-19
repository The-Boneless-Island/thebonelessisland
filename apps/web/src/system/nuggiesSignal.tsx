import { createContext, useContext } from "react";

/**
 * A monotonically-increasing counter that App bumps whenever the current
 * member's Nuggies balance changes server-side (delivered over the SSE bus as
 * a "nuggies-changed" event). Nuggies surfaces (Balance & Shop, Milestones)
 * depend on this value in an effect to refetch their balance immediately,
 * instead of waiting for a manual page refresh.
 *
 * Safe default 0 so consumers render fine with no provider mounted.
 */
const NuggiesSignalContext = createContext<number>(0);

export function NuggiesSignalProvider({
  signal,
  children,
}: {
  signal: number;
  children: React.ReactNode;
}) {
  return <NuggiesSignalContext.Provider value={signal}>{children}</NuggiesSignalContext.Provider>;
}

export function useNuggiesSignal(): number {
  return useContext(NuggiesSignalContext);
}
