import type { ReactNode } from "react";
import { MemoryRouter } from "@island/web";
import { MobileTabBar } from "@island/web";
import { Stage } from "./_stage";

// The real bar is position:fixed + display:none until a <=640px viewport media
// query. Preview cards capture at a wide viewport, so we pin a phone-width
// frame and force the bar into its visible (non-fixed) state for grading.
function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <Stage style={{ width: 390 }} pad={12}>
      <style>{`
        .ds-phone .bi-tabbar {
          display: grid !important;
          position: static !important;
          border-radius: 16px;
        }
      `}</style>
      <div className="ds-phone">
        <MemoryRouter>{children}</MemoryRouter>
      </div>
    </Stage>
  );
}

export const HomeActive = () => (
  <PhoneFrame>
    <MobileTabBar page="home" />
  </PhoneFrame>
);

export const GamesActive = () => (
  <PhoneFrame>
    <MobileTabBar page="library" />
  </PhoneFrame>
);

export const NuggiesActive = () => (
  <PhoneFrame>
    <MobileTabBar page="nuggies-casino" />
  </PhoneFrame>
);
