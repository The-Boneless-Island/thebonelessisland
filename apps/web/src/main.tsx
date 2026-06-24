import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { App } from "./App.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { initSentry } from "./lib/sentry.js";
import { queryClient } from "./lib/queryClient.js";
import { IslandSceneShell } from "./scene/IslandSceneShell.js";
import { reportWebVitals } from "./lib/vitals.js";

initSentry();

if (window.location.hash.startsWith("#/")) {
  const target = window.location.hash.slice(1);
  window.history.replaceState(null, "", target);
}

const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <IslandSceneShell>
        <App />
      </IslandSceneShell>
    ),
  },
]);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

reportWebVitals();
