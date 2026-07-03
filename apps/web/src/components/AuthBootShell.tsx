import { IslandButton } from "../islandUi.js";
import { islandTheme } from "../theme.js";

/** Shown while auth bootstrap resolves — avoids a blank screen on cold load. */
export function AuthBootShell() {
  return (
    <div
      aria-live="polite"
      aria-busy="true"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        color: islandTheme.color.textSubtle,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 999,
          background: 'url("/boneless-island-logo.png") center / 126%',
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          animation: "bi-auth-boot-pulse 1.6s ease-in-out infinite",
        }}
      />
      <span className="island-mono" style={{ fontSize: 13, opacity: 0.85 }}>
        Waking up the island…
      </span>
      <style>{`
        @keyframes bi-auth-boot-pulse {
          0%, 100% { opacity: 0.55; transform: scale(0.96); }
          50%      { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

/**
 * Shown at boot when the profile probe hits a network error or a 5xx — the
 * API is unreachable, which is a different situation than "you're logged
 * out" and must not be mistaken for one (see App.tsx loadProfile). Same
 * fixed full-viewport shell as AuthBootShell, but with an actionable retry
 * card since there's nothing to wait out automatically.
 */
export function IslandUnreachableScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 360,
          maxWidth: "calc(100vw - 48px)",
          textAlign: "center",
          background: islandTheme.color.panelBg,
          backdropFilter: islandTheme.glass.blurStrong,
          WebkitBackdropFilter: islandTheme.glass.blurStrong,
          border: `1px solid ${islandTheme.color.cardBorder}`,
          borderRadius: 20,
          padding: "32px 28px 28px",
          boxShadow: "0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06) inset",
          display: "grid",
          gap: 16,
          justifyItems: "center",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            background: 'url("/boneless-island-logo.png") center / 126%',
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            filter: "grayscale(0.6)",
            opacity: 0.85,
          }}
        />
        <div style={{ display: "grid", gap: 6 }}>
          <div className="island-display" style={{ fontWeight: 700, fontSize: 18, color: islandTheme.color.textPrimary }}>
            The island is unreachable
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: islandTheme.color.textSubtle }}>
            Give it a moment, then try again.
          </p>
        </div>
        <IslandButton variant="primary" onClick={onRetry}>
          Retry
        </IslandButton>
      </div>
    </div>
  );
}
