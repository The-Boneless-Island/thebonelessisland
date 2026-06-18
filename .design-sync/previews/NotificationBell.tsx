import { NotificationBell } from "@island/web";
import { Stage } from "./_stage";

const noop = () => {};

// NotificationBell fetches /forums/notifications in an effect and opens its
// dropdown only on click. With no backend in the preview it renders its resting
// state: the styled glass bell button (zero unread until data arrives).
export const RestingBell = () => (
  <Stage style={{ width: 140, display: "flex", justifyContent: "center" }}>
    <NotificationBell onOpenThread={noop} />
  </Stage>
);

// Same control shown inset on a topbar-style row so the glass surface reads in
// context next to a label.
export const InTopbarContext = () => (
  <Stage style={{ width: 320 }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12
      }}
    >
      <span
        style={{
          fontWeight: 700,
          fontSize: 15,
          color: "var(--bi-text-primary)"
        }}
      >
        Boneless Island
      </span>
      <NotificationBell onOpenThread={noop} />
    </div>
  </Stage>
);
