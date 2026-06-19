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
function report(metric: Metric) {
  try {
    const body = JSON.stringify({
      name: metric.name,
      value: Math.round(metric.value * 1000) / 1000,
      rating: metric.rating,
      id: metric.id,
      navigationType: metric.navigationType,
      path: typeof location !== "undefined" ? location.pathname : null
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
}

export function reportWebVitals() {
  onCLS(report);
  onINP(report);
  onLCP(report);
}
