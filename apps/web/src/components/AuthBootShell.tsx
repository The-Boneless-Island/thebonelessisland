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
