import React from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { App } from "./App.js";
import { IslandSceneShell } from "./scene/IslandSceneShell.js";
import { reportWebVitals } from "./lib/vitals.js";

// Legacy hash-URL shim. Old permalinks shared in Discord use the pre-router
// grammar (#/forums/thread/123, #/admin/news, #/library?f=co-op). Fragments
// never reach the server, so this must run client-side — before the router is
// created, so it initializes on the corrected path with no reload and no junk
// history entry. Keep this indefinitely; those links live forever.
if (window.location.hash.startsWith("#/")) {
  const target = window.location.hash.slice(1); // "/forums/thread/123" (+ any embedded ?query)
  window.history.replaceState(null, "", target);
}

// Single catch-all route: App is the persistent shell (holds all app state) and
// renders the page that matches the current path. The scene backdrop wraps it
// so it stays mounted across navigations.
const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <IslandSceneShell>
        <App />
      </IslandSceneShell>
    )
  }
]);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);

// Real-user Core Web Vitals → API logs (best-effort, never blocks render).
reportWebVitals();
