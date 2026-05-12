import { createContext, useContext } from "react";

export type ActivityRefetch = () => Promise<void> | void;

const ActivityContext = createContext<ActivityRefetch | null>(null);

export function ActivityRefetchProvider({
  refetch,
  children,
}: {
  refetch: ActivityRefetch;
  children: React.ReactNode;
}) {
  return <ActivityContext.Provider value={refetch}>{children}</ActivityContext.Provider>;
}

/**
 * Returns a function to ask the App-level activity-events feed to refresh.
 * Call after any action that may grant an achievement / hit a milestone — the
 * unlock toast effect in App.tsx listens to that feed and will fire the toast
 * once the new event row arrives.
 *
 * Safe no-op if no provider is mounted, so call sites don't have to guard.
 */
export function useRefetchActivity(): ActivityRefetch {
  const fn = useContext(ActivityContext);
  return fn ?? (() => {});
}
