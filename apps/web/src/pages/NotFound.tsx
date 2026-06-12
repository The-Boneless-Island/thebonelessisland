import { Link } from "react-router";
import { IslandEmptyState } from "../islandUi.js";

// Catch-all for unknown paths. Keeps the user on the island instead of a blank
// screen — themed mascot empty state + a way back home.
export function NotFoundPage() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "50vh", padding: 24 }}>
      <IslandEmptyState
        pose="shrug"
        title="Lost at sea"
        body="That cove doesn't exist on the map — the tide may have washed the link away."
        action={
          <Link
            to="/"
            className="island-btn"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            🏝️ Back to the shoreline
          </Link>
        }
      />
    </div>
  );
}
