import { useEffect, type ReactNode } from "react";
import { islandTheme } from "../theme.js";
import {
  SteamBrandedPanel,
  SteamLogo,
  SteamSignInButton,
  steamColors,
  steamSignInUrl
} from "./steam.js";

const SKIP_STORAGE_PREFIX = "island.steam.onboarding.skipped:";

function skipKey(discordUserId: string | null): string | null {
  if (!discordUserId) return null;
  return `${SKIP_STORAGE_PREFIX}${discordUserId}`;
}

export function isSteamOnboardingSkipped(discordUserId: string | null): boolean {
  const key = skipKey(discordUserId);
  if (!key) return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function setSteamOnboardingSkipped(discordUserId: string | null, skipped: boolean): void {
  const key = skipKey(discordUserId);
  if (!key) return;
  try {
    if (skipped) {
      window.localStorage.setItem(key, "1");
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // local storage unavailable (private mode, etc.) — silently ignore
  }
}

type SteamOnboardingModalProps = {
  open: boolean;
  onClose: () => void;
  onSkip: () => void;
};

export function SteamOnboardingModal({ open, onClose, onSkip }: SteamOnboardingModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="steam-onboarding-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(16px, 4vw, 32px)",
        background: "rgba(7, 11, 19, 0.65)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <SteamBrandedPanel
        style={{
          width: "100%",
          maxWidth: 460,
          padding: 0,
          overflow: "hidden",
          position: "relative"
        }}
      >
        <div
          style={{
            padding: "26px 28px 18px",
            background: `linear-gradient(135deg, ${steamColors.dark2} 0%, ${steamColors.dark} 80%)`,
            borderBottom: "1px solid rgba(102, 192, 244, 0.18)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 999,
                background: "rgba(102, 192, 244, 0.15)",
                border: `1px solid ${steamColors.blue}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <SteamLogo size={26} tone="light" />
            </div>
            <div
              className="island-mono"
              style={{
                fontSize: 12,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: steamColors.blue,
                fontWeight: 700
              }}
            >
              Connect Steam
            </div>
          </div>
          <h2
            id="steam-onboarding-title"
            className="island-display"
            style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#ffffff", lineHeight: 1.2 }}
          >
            Bring your library to the island.
          </h2>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 13.5,
              lineHeight: 1.55,
              color: "#cbd5e1"
            }}
          >
            Sign in through Steam so the island can suggest games your crew can actually play together,
            sync your wishlist into the group hype list, and surface real patch notes for the games you own.
          </p>
        </div>

        <div style={{ padding: "18px 28px 14px", display: "grid", gap: 12 }}>
          <Bullet icon="🎯">
            <strong>"What can we play?"</strong> — overlap your library with the crew that's actually online.
          </Bullet>
          <Bullet icon="🌊">
            <strong>Group wishlist hype</strong> — the more of you wishlist a game, the higher it floats.
          </Bullet>
          <Bullet icon="📰">
            <strong>Live patch notes</strong> — Steam News for everything in your library and wishlist.
          </Bullet>
        </div>

        <div
          style={{
            padding: "16px 28px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10
          }}
        >
          <SteamSignInButton href={steamSignInUrl()} size="md" />
          <button
            type="button"
            onClick={onSkip}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              fontSize: 12,
              cursor: "pointer",
              textDecoration: "underline",
              padding: "4px 8px",
              fontFamily: "inherit"
            }}
          >
            no thanks, skip for now
          </button>
        </div>

        <div
          className="island-mono"
          style={{
            padding: "10px 28px 18px",
            fontSize: 12,
            color: "#64748b",
            lineHeight: 1.5,
            textAlign: "center",
            borderTop: "1px solid rgba(255,255,255,0.06)"
          }}
        >
          Read-only. Library + wishlist only. You can unlink any time from your profile.
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 28,
            height: 28,
            borderRadius: 999,
            border: "none",
            background: "rgba(255,255,255,0.08)",
            color: "#cbd5e1",
            cursor: "pointer",
            fontSize: 14,
            fontFamily: "inherit"
          }}
        >
          ✕
        </button>
      </SteamBrandedPanel>
    </div>
  );
}

function Bullet({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "28px 1fr",
        gap: 10,
        alignItems: "start",
        fontSize: 13,
        lineHeight: 1.5,
        color: "#cbd5e1"
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: "rgba(102, 192, 244, 0.12)",
          border: `1px solid ${islandTheme.color.cardBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14
        }}
      >
        {icon}
      </span>
      <span>{children}</span>
    </div>
  );
}
