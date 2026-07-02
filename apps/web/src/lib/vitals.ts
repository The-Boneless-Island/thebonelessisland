import { onCLS, onINP, onLCP, type Metric } from "web-vitals";
import { API_BASE_URL } from "../api/client.js";

// Real-user Core Web Vitals (CLS, INP, LCP) beaconed to the API, which logs
// them. Fire-and-forget and best-effort: telemetry must never affect the app.
//
// The beacon uses a text/plain Blob on purpose — a cross-origin (same-site)
// sendBeacon with application/json would need a CORS preflight, which beacons
// can't do; text/plain is a "simple request" and goes through. The API parses
// it as text. The same-site session cookie rides along, so /vitals can stay
// behind requireSession.
//
// `path` is captured once, when the observers are registered (this is an SPA
// — reportWebVitals() runs once at boot), not when a metric actually fires.
// CLS/INP in particular can settle well after the initial navigation; reading
// location.pathname at report time would mis-attribute a score to whatever
// page the user has since routed to instead of the page that produced it.
function report(path: string | null) {
  return (metric: Metric) => {
    try {
      const body = JSON.stringify({
        name: metric.name,
        value: Math.round(metric.value * 1000) / 1000,
        rating: metric.rating,
        id: metric.id,
        navigationType: metric.navigationType,
        path
      });
      const url = `${API_BASE_URL}/vitals`;
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }));
      } else {
        void fetch(url, {
          method: "POST",
          body,
          headers: { "content-type": "text/plain" },
          credentials: "include",
          keepalive: true
        });
      }
    } catch {
      // best-effort
    }
  };
}

export function reportWebVitals() {
  const path = typeof location !== "undefined" ? location.pathname : null;
  onCLS(report(path));
  onINP(report(path));
  onLCP(report(path));
}
