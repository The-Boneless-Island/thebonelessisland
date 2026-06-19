// Shared preview backdrop (NOT a component — a preview-only decorator).
// The DS is dark-themed: light text + translucent glass panels designed to sit
// over the night island scene. Preview cards render on white, so anything
// without its own opaque dark surface (EmptyState copy, glass IslandCard,
// skeletons) reads as broken. Stage reproduces the app's night backdrop so
// every preview is graded the way it actually appears in-product.
import type { CSSProperties, ReactNode } from "react";

const ISLAND_NIGHT =
  "radial-gradient(1100px 520px at 18% -10%, #14365c 0%, transparent 55%), " +
  "linear-gradient(160deg, #081427 0%, #0e2c47 55%, #14506a 100%)";

export function Stage({
  children,
  width,
  inline = false,
  pad = 24,
  style,
}: {
  children: ReactNode;
  width?: number | string;
  inline?: boolean;
  pad?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: inline ? "inline-block" : "block",
        background: ISLAND_NIGHT,
        padding: pad,
        borderRadius: 14,
        width,
        boxSizing: "border-box",
        color: "var(--bi-text-primary)",
        fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
