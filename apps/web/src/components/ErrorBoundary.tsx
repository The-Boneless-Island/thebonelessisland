import { API_BASE_URL } from "../api/client.js";
import { captureException } from "../lib/sentry.js";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { IslandButton, IslandCard } from "../islandUi.js";
import { islandTheme } from "../theme.js";

type Props = { children: ReactNode };

type State = { error: Error | null };

function reportClientError(error: Error, info: ErrorInfo): void {
  const payload = {
    message: error.message,
    stack: error.stack?.slice(0, 4000),
    componentStack: info.componentStack?.slice(0, 2000),
    path: typeof window !== "undefined" ? window.location.pathname : "",
  };
  try {
    const url = `${API_BASE_URL}/client-errors`;
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([JSON.stringify(payload)], { type: "text/plain" }));
    } else {
      void fetch(url, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "content-type": "text/plain" },
        credentials: "include",
        keepalive: true,
      });
    }
  } catch {
    // Best-effort only
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureException(error, { componentStack: info.componentStack ?? undefined });
    reportClientError(error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, maxWidth: 560, margin: "40px auto" }}>
          <IslandCard style={{ display: "grid", gap: 12, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Rough tide on the shore</div>
            <p style={{ margin: 0, fontSize: 14, color: islandTheme.color.textSecondary, lineHeight: 1.5 }}>
              Something went sideways loading this page. Try a refresh — if it keeps happening, ping the crew on Discord.
            </p>
            <IslandButton variant="secondary" onClick={() => window.location.reload()}>
              Refresh the page
            </IslandButton>
          </IslandCard>
        </div>
      );
    }
    return this.props.children;
  }
}
