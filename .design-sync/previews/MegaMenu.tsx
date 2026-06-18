import { MemoryRouter } from "@island/web";
import { MegaMenu } from "@island/web";
import { Stage } from "./_stage";

const noop = () => {};

export const CrewMember = () => (
  <Stage style={{ width: 900 }}>
    <MemoryRouter>
      <MegaMenu page="library" onNavigate={noop} isAdmin={false} />
    </MemoryRouter>
  </Stage>
);

export const AdminOnNuggies = () => (
  <Stage style={{ width: 900 }}>
    <MemoryRouter>
      <MegaMenu page="nuggies-casino" onNavigate={noop} isAdmin={true} />
    </MemoryRouter>
  </Stage>
);

export const CommunityActive = () => (
  <Stage style={{ width: 900 }}>
    <MemoryRouter>
      <MegaMenu page="community-leaderboard" onNavigate={noop} isAdmin={true} />
    </MemoryRouter>
  </Stage>
);
