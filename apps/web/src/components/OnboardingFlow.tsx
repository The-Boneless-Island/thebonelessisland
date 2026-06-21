/**
 * OnboardingFlow — "Washed Ashore" product tour
 *
 * 8-step intro for new members. Gated by clientState.onboarding_version < CURRENT.
 * Skip and Done both call onFinish (which posts /profile/onboarding/complete).
 *
 * CURRENT_ONBOARDING_VERSION — used as a local fallback only.
 * The server value (MeProfile.currentOnboardingVersion) is authoritative; App.tsx
 * prefers that when present. Keep this value in sync with apps/api/src/lib/clientState.ts
 * so the fallback path stays correct.
 */

import { useEffect, useRef, useState } from "react";
import { IslandButton, IslandCard } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import type { MeProfile } from "../types.js";
import { SteamSignInButton, steamSignInUrl } from "./steam.js";

export const CURRENT_ONBOARDING_VERSION = 1;

// ── sessionStorage key for redirect-resume ────────────────────────────────────
const STEP_STORAGE_KEY = "bi:onboarding-step";

function saveStep(index: number) {
  try {
    sessionStorage.setItem(STEP_STORAGE_KEY, String(index));
  } catch {
    // private-mode / quota — ignore
  }
}

function readSavedStep(): number {
  try {
    const raw = sessionStorage.getItem(STEP_STORAGE_KEY);
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function clearSavedStep() {
  try {
    sessionStorage.removeItem(STEP_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ── Shared preview frame ──────────────────────────────────────────────────────
// All step visuals share this wrapper so the card header height is consistent.
function PreviewFrame({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "20px 24px 14px",
        minHeight: 148,
      }}
    >
      {children}
      <div
        className="island-mono"
        style={{
          fontSize: islandTheme.text["2xs"],
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color,
          fontWeight: 700,
          opacity: 0.9,
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ── Per-step mini previews ────────────────────────────────────────────────────

/** welcome — tiny island horizon scene */
function WelcomePreview() {
  const teal = islandTheme.accent.teal;
  return (
    <PreviewFrame label="Boneless Island" color={teal}>
      <svg width="180" height="80" viewBox="0 0 180 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Sky gradient */}
        <defs>
          <linearGradient id="ob-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={islandTheme.palette.skyHigh} />
            <stop offset="100%" stopColor={islandTheme.palette.skyLow} />
          </linearGradient>
          <linearGradient id="ob-ocean" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={islandTheme.palette.oceanMid} />
            <stop offset="100%" stopColor={islandTheme.palette.oceanDeep} />
          </linearGradient>
          <linearGradient id="ob-sand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={islandTheme.palette.sand} />
            <stop offset="100%" stopColor={islandTheme.palette.sandWarm} />
          </linearGradient>
        </defs>
        {/* Sky */}
        <rect width="180" height="55" fill="url(#ob-sky)" rx="8" />
        {/* Sun */}
        <circle cx="148" cy="22" r="9" fill={islandTheme.palette.sandLight} opacity="0.9" />
        {/* Ocean */}
        <rect y="45" width="180" height="35" fill="url(#ob-ocean)" rx="0" />
        {/* Horizon shimmer */}
        <rect y="44" width="180" height="3" fill={islandTheme.palette.oceanShallow} opacity="0.5" />
        {/* Sand mound */}
        <ellipse cx="70" cy="72" rx="60" ry="14" fill="url(#ob-sand)" />
        {/* Palm trunk */}
        <path d="M72 70 Q70 55 66 42" stroke={islandTheme.palette.palmBark} strokeWidth="3.5" strokeLinecap="round" />
        {/* Palm fronds */}
        <path d="M66 42 Q52 34 44 38" stroke={islandTheme.palette.palm} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M66 42 Q60 30 64 24" stroke={islandTheme.palette.palm} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M66 42 Q78 32 84 34" stroke={islandTheme.palette.palm} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M66 42 Q74 40 80 44" stroke={islandTheme.palette.palmMid} strokeWidth="2" strokeLinecap="round" />
        {/* Small wave lines */}
        <path d="M20 56 Q28 53 36 56 Q44 59 52 56" stroke={islandTheme.palette.foam} strokeWidth="1.2" strokeLinecap="round" opacity="0.4" />
        <path d="M110 60 Q120 57 132 60 Q144 63 155 60" stroke={islandTheme.palette.foam} strokeWidth="1.2" strokeLinecap="round" opacity="0.3" />
      </svg>
    </PreviewFrame>
  );
}

/** profile — mini member card */
function ProfilePreview() {
  const violet = islandTheme.accent.violet;
  return (
    <PreviewFrame label="Your Profile" color={violet}>
      <div style={{
        width: 200,
        background: islandTheme.color.panelMutedBg,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        borderRadius: islandTheme.radius.control,
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        {/* Avatar circle with initials */}
        <div style={{
          width: 40,
          height: 40,
          borderRadius: "32%",
          flexShrink: 0,
          background: `linear-gradient(150deg, ${violet}, #7c3aed)`,
          display: "grid",
          placeItems: "center",
          fontSize: 15,
          fontWeight: 700,
          color: "#fff",
          fontFamily: islandTheme.font.display,
          boxShadow: `0 4px 12px -4px ${violet}99`,
        }}>
          YO
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name line */}
          <div style={{
            height: 11,
            borderRadius: 6,
            background: islandTheme.color.textSecondary,
            width: "70%",
            marginBottom: 7,
            opacity: 0.55,
          }} />
          {/* Blurb line */}
          <div style={{
            height: 8,
            borderRadius: 4,
            background: islandTheme.color.textMuted,
            width: "90%",
            marginBottom: 5,
            opacity: 0.35,
          }} />
          {/* Short blurb line 2 */}
          <div style={{
            height: 8,
            borderRadius: 4,
            background: islandTheme.color.textMuted,
            width: "55%",
            opacity: 0.25,
          }} />
        </div>
      </div>
    </PreviewFrame>
  );
}

/** steam — Steam-branded mockup panel */
function SteamPreview() {
  const steamBlue = "#66c0f4";
  const steamDark = "#1b2838";
  return (
    <PreviewFrame label="Steam — optional" color={steamBlue}>
      <div style={{
        width: 200,
        background: steamDark,
        border: `1px solid ${steamBlue}44`,
        borderRadius: islandTheme.radius.control,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}>
        {/* Steam wordmark row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Steam logo placeholder circle */}
          <div style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: steamBlue,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
              <circle cx="12" cy="12" r="4" fill="white" />
              <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 3a7 7 0 1 1 0 14A7 7 0 0 1 12 5z" fill="white" opacity="0.5" />
            </svg>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: steamBlue, letterSpacing: "0.06em" }}>STEAM</div>
        </div>
        {/* Library rows */}
        {[80, 60, 90].map((w, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28,
              height: 16,
              borderRadius: 3,
              background: `rgba(102,192,244,${0.1 + i * 0.06})`,
              border: `1px solid ${steamBlue}22`,
              flexShrink: 0,
            }} />
            <div style={{
              height: 7,
              borderRadius: 3,
              background: `rgba(255,255,255,0.18)`,
              width: `${w}%`,
            }} />
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

/** news — mini news card with vote arrows */
function NewsPreview() {
  const coral = islandTheme.accent.coral;
  return (
    <PreviewFrame label="Gaming News" color={coral}>
      <div style={{
        width: 210,
        background: islandTheme.color.panelMutedBg,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        borderRadius: islandTheme.radius.control,
        overflow: "hidden",
      }}>
        {/* Image block */}
        <div style={{
          height: 40,
          background: `linear-gradient(135deg, ${islandTheme.palette.skyMid}, ${islandTheme.palette.oceanMid})`,
          borderBottom: `1px solid ${islandTheme.color.cardBorder}`,
        }} />
        {/* Title + vote row */}
        <div style={{ padding: "8px 10px", display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Title line 1 */}
            <div style={{
              height: 8,
              borderRadius: 4,
              background: islandTheme.color.textSecondary,
              width: "90%",
              marginBottom: 5,
              opacity: 0.5,
            }} />
            {/* Title line 2 */}
            <div style={{
              height: 8,
              borderRadius: 4,
              background: islandTheme.color.textMuted,
              width: "65%",
              opacity: 0.3,
            }} />
          </div>
          {/* Vote arrows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center", flexShrink: 0 }}>
            <div style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              background: `${islandTheme.color.voteUp}22`,
              border: `1px solid ${islandTheme.color.voteUp}55`,
              display: "grid",
              placeItems: "center",
              color: islandTheme.color.voteUp,
              fontSize: 10,
              fontWeight: 700,
            }}>▲</div>
            <div style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              background: `${islandTheme.color.voteDown}18`,
              border: `1px solid ${islandTheme.color.voteDown}44`,
              display: "grid",
              placeItems: "center",
              color: islandTheme.color.voteDown,
              fontSize: 10,
              fontWeight: 700,
            }}>▼</div>
          </div>
        </div>
      </div>
    </PreviewFrame>
  );
}

/** forums — mini thread list with reply-count pill */
function ForumsPreview() {
  const gold = islandTheme.accent.gold;
  const rows = [
    { w: 78, replies: 12 },
    { w: 60, replies: 3 },
    { w: 88, replies: 27 },
  ];
  return (
    <PreviewFrame label="Forums" color={gold}>
      <div style={{
        width: 210,
        background: islandTheme.color.panelMutedBg,
        border: `1px solid ${islandTheme.color.cardBorder}`,
        borderRadius: islandTheme.radius.control,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}>
        {rows.map((row, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderBottom: i < rows.length - 1 ? `1px solid ${islandTheme.color.cardBorder}` : undefined,
            }}
          >
            {/* Thread title bar */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                height: 8,
                borderRadius: 4,
                background: islandTheme.color.textSecondary,
                width: `${row.w}%`,
                opacity: 0.45,
              }} />
            </div>
            {/* Reply-count pill */}
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              fontFamily: islandTheme.font.mono,
              borderRadius: 999,
              padding: "2px 7px",
              background: `${gold}22`,
              border: `1px solid ${gold}55`,
              color: gold,
              flexShrink: 0,
            }}>
              {row.replies}
            </div>
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

/** nuggies — coin + balance number */
function NuggiesPreview() {
  const gold = islandTheme.color.nuggieGold;
  return (
    <PreviewFrame label="Nuggies" color={gold}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* Nuggie coin */}
        <div style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "radial-gradient(circle at 38% 32%, #ffe9a8 0%, #f7c948 42%, #e0992a 74%, #b76a14 100%)",
          boxShadow: "0 4px 14px -4px rgba(183,106,20,.6), inset -2px -3px 6px rgba(140,70,10,.4), inset 2px 2px 5px rgba(255,245,200,.5)",
          border: "2px solid #c8881f",
          display: "grid",
          placeItems: "center",
          fontSize: 26,
          lineHeight: 1,
          flexShrink: 0,
        }}>
          🍗
        </div>
        {/* Balance */}
        <div>
          <div style={{
            fontSize: 28,
            fontWeight: 700,
            fontFamily: islandTheme.font.display,
            color: gold,
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}>
            500
          </div>
          <div style={{
            fontSize: islandTheme.text.xs,
            color: islandTheme.color.textMuted,
            marginTop: 3,
            fontFamily: islandTheme.font.mono,
          }}>
            NUGGIES
          </div>
        </div>
      </div>
    </PreviewFrame>
  );
}

/** casino — playing cards + chip motif */
function CasinoPreview() {
  const pink = islandTheme.accent.pink;
  return (
    <PreviewFrame label="Nuggie Casino" color={pink}>
      <div style={{ position: "relative", width: 120, height: 70 }}>
        {/* Back card */}
        <div style={{
          position: "absolute",
          left: 10,
          top: 10,
          width: 50,
          height: 68,
          borderRadius: 6,
          background: `linear-gradient(145deg, #1e1b4b, #312e81)`,
          border: `1px solid ${islandTheme.color.cardBorder}`,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          display: "grid",
          placeItems: "center",
          fontSize: 18,
          transform: "rotate(-10deg)",
        }}>
          <span style={{ opacity: 0.4, color: pink }}>♠</span>
        </div>
        {/* Front card */}
        <div style={{
          position: "absolute",
          left: 40,
          top: 0,
          width: 50,
          height: 68,
          borderRadius: 6,
          background: "var(--bi-panel-bg)",
          border: `1px solid ${islandTheme.color.cardBorder}`,
          boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          transform: "rotate(5deg)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: islandTheme.color.textPrimary, lineHeight: 1 }}>A</div>
          <div style={{ fontSize: 18, lineHeight: 1, color: "#ef4444" }}>♥</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: islandTheme.color.textPrimary, lineHeight: 1, transform: "rotate(180deg)" }}>A</div>
        </div>
        {/* Chip */}
        <div style={{
          position: "absolute",
          bottom: -6,
          right: 0,
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: `linear-gradient(135deg, ${pink}, #db2777)`,
          border: "2px solid rgba(255,255,255,0.2)",
          boxShadow: `0 3px 10px ${pink}66`,
          display: "grid",
          placeItems: "center",
          fontSize: 9,
          fontWeight: 700,
          color: "#fff",
          fontFamily: islandTheme.font.mono,
        }}>
          NG
        </div>
      </div>
    </PreviewFrame>
  );
}

/** done — celebratory island scene with a flag */
function DonePreview() {
  const lime = islandTheme.accent.lime;
  return (
    <PreviewFrame label="All aboard" color={lime}>
      <svg width="180" height="80" viewBox="0 0 180 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="ob-sky-done" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={islandTheme.palette.skyHigh} />
            <stop offset="100%" stopColor={islandTheme.palette.skyLow} />
          </linearGradient>
          <linearGradient id="ob-ocean-done" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={islandTheme.palette.oceanShallow} />
            <stop offset="100%" stopColor={islandTheme.palette.oceanDeep} />
          </linearGradient>
          <linearGradient id="ob-sand-done" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={islandTheme.palette.sand} />
            <stop offset="100%" stopColor={islandTheme.palette.sandWarm} />
          </linearGradient>
        </defs>
        {/* Sky */}
        <rect width="180" height="52" fill="url(#ob-sky-done)" rx="8" />
        {/* Stars / sparkles */}
        <circle cx="30" cy="14" r="1.5" fill={lime} opacity="0.7" />
        <circle cx="80" cy="8" r="1" fill={islandTheme.accent.gold} opacity="0.6" />
        <circle cx="140" cy="18" r="1.5" fill={islandTheme.accent.violet} opacity="0.7" />
        <circle cx="155" cy="9" r="1" fill={lime} opacity="0.5" />
        <circle cx="55" cy="22" r="1" fill={islandTheme.accent.coral} opacity="0.5" />
        {/* Sun — warm dawn tint */}
        <circle cx="140" cy="20" r="10" fill={islandTheme.palette.sandWarmAccent} opacity="0.85" />
        <circle cx="140" cy="20" r="7" fill={islandTheme.palette.sandLight} opacity="0.9" />
        {/* Ocean */}
        <rect y="43" width="180" height="37" fill="url(#ob-ocean-done)" />
        <rect y="42" width="180" height="3" fill={islandTheme.palette.foam} opacity="0.3" />
        {/* Sand mound */}
        <ellipse cx="72" cy="72" rx="65" ry="15" fill="url(#ob-sand-done)" />
        {/* Palm trunk */}
        <path d="M74 70 Q72 56 68 43" stroke={islandTheme.palette.palmBark} strokeWidth="3.5" strokeLinecap="round" />
        {/* Palm fronds */}
        <path d="M68 43 Q54 35 46 39" stroke={islandTheme.palette.palm} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M68 43 Q62 31 66 25" stroke={islandTheme.palette.palm} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M68 43 Q80 33 86 36" stroke={islandTheme.palette.palm} strokeWidth="2.5" strokeLinecap="round" />
        {/* Flag pole */}
        <line x1="100" y1="58" x2="100" y2="30" stroke={islandTheme.palette.sandDeep} strokeWidth="2" strokeLinecap="round" />
        {/* Lime flag */}
        <path d="M100 30 L118 36 L100 42 Z" fill={lime} opacity="0.95" />
      </svg>
    </PreviewFrame>
  );
}

// ── Bullet list used in the Steam step ───────────────────────────────────────
function Bullet({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "28px 1fr",
        gap: 10,
        alignItems: "start",
        fontSize: islandTheme.text.sm,
        lineHeight: islandTheme.lineHeight.relaxed,
        color: islandTheme.color.textSecondary,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 28,
          height: 28,
          borderRadius: islandTheme.radius.chip,
          background: "rgba(102, 192, 244, 0.1)",
          border: `1px solid ${islandTheme.color.cardBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
        }}
      >
        {icon}
      </span>
      <span>{children}</span>
    </div>
  );
}

// ── Step definitions ──────────────────────────────────────────────────────────
type StepId =
  | "welcome"
  | "profile"
  | "steam"
  | "news"
  | "forums"
  | "nuggies"
  | "casino"
  | "done";

interface Step {
  id: StepId;
  title: string;
  visual: React.ReactNode;
  body: React.ReactNode;
}

function buildSteps(profile: MeProfile | null): Step[] {
  const displayName = profile?.displayName ?? profile?.username ?? "islander";

  return [
    {
      id: "welcome",
      title: "Welcome ashore, mate.",
      visual: <WelcomePreview />,
      body: (
        <>
          <p style={{ margin: "0 0 10px" }}>
            Boneless Island is the home base for a six-year-old Discord crew —
            adult gamers who'd rather banter than sweat.
          </p>
          <p style={{ margin: 0 }}>
            This quick tour covers everything the island has to offer. Takes
            about two minutes. Skip any time — it'll still be here.
          </p>
        </>
      ),
    },
    {
      id: "profile",
      title: "You're already on the map.",
      visual: <ProfilePreview />,
      body: (
        <>
          <p style={{ margin: "0 0 10px" }}>
            Your Discord identity — avatar, username, server nickname — is
            already pulled in. No extra sign-up required.
          </p>
          <p style={{ margin: "0 0 10px" }}>
            <strong style={{ color: islandTheme.color.textPrimary }}>
              Add an "about me" blurb
            </strong>{" "}
            on your Profile page so the crew knows who they're sailing with.
          </p>
          <p
            style={{
              margin: 0,
              fontSize: islandTheme.text.sm,
              color: islandTheme.color.textMuted,
            }}
          >
            Tip: the island is members-only, so your profile never leaks to the
            open internet.
          </p>
        </>
      ),
    },
    {
      id: "steam",
      title: "Bring your library aboard.",
      visual: <SteamPreview />,
      body: (
        <>
          <p style={{ margin: "0 0 12px" }}>
            Link Steam to unlock the best parts of the island. Read-only,
            unlink any time.
          </p>
          <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            <Bullet icon="🎯">
              <strong>"What can we play?"</strong> — cross-reference your
              library with whoever is online right now.
            </Bullet>
            <Bullet icon="🌊">
              <strong>Group wishlist hype</strong> — the more of you wishlist a
              game, the higher it floats.
            </Bullet>
            <Bullet icon="📰">
              <strong>Live patch notes</strong> — Steam news for every game in
              your library and wishlist.
            </Bullet>
          </div>
          {profile?.steamId64 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: islandTheme.text.sm,
                color: islandTheme.color.successAccent,
                fontWeight: 600,
              }}
            >
              <span aria-hidden="true">✓</span>
              Steam linked
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
              <SteamSignInButton href={steamSignInUrl()} size="md" />
              <div
                style={{
                  fontSize: islandTheme.text.xs,
                  color: islandTheme.color.textMuted,
                  lineHeight: islandTheme.lineHeight.relaxed,
                }}
              >
                Read-only · Library + wishlist only · Unlink from your Profile
              </div>
            </div>
          )}
        </>
      ),
    },
    {
      id: "news",
      title: "The island reads the patch notes for you.",
      visual: <NewsPreview />,
      body: (
        <>
          <p style={{ margin: "0 0 10px" }}>
            The{" "}
            <strong style={{ color: islandTheme.color.textPrimary }}>
              Gaming News
            </strong>{" "}
            feed is AI-curated — it pulls from gaming sites and surfaces stories
            the crew is likely to care about, no RSS spelunking required.
          </p>
          <p style={{ margin: "0 0 10px" }}>
            <strong style={{ color: islandTheme.color.textPrimary }}>
              Vote up or down
            </strong>{" "}
            on any article. Votes tune what rises to the top for everyone — bury
            a type of story enough and it shows up less.
          </p>
          <p
            style={{
              margin: 0,
              fontSize: islandTheme.text.sm,
              color: islandTheme.color.textMuted,
            }}
          >
            Tip: one vote per article, but you can flip it any time.
          </p>
        </>
      ),
    },
    {
      id: "forums",
      title: "Where the crew actually talks.",
      visual: <ForumsPreview />,
      body: (
        <>
          <p style={{ margin: "0 0 10px" }}>
            The{" "}
            <strong style={{ color: islandTheme.color.textPrimary }}>
              Forums
            </strong>{" "}
            are for longer conversations — game recommendations, event planning,
            memes that wouldn't survive Discord's scroll.
          </p>
          <p style={{ margin: "0 0 10px" }}>
            Start a new thread or jump into an existing one. Threads are
            organised by category; filter by active to skip the dead ones.
          </p>
          <p
            style={{
              margin: 0,
              fontSize: islandTheme.text.sm,
              color: islandTheme.color.textMuted,
            }}
          >
            Tip: great Discord threads die in the scroll. Repost the good ones
            here so they don't disappear.
          </p>
        </>
      ),
    },
    {
      id: "nuggies",
      title: "Nuggies — the island's currency.",
      visual: <NuggiesPreview />,
      body: (
        <>
          <p style={{ margin: "0 0 10px" }}>
            <strong style={{ color: islandTheme.color.nuggieGold }}>
              Nuggies
            </strong>{" "}
            are the island's community currency. They don't buy anything real —
            they measure vibes and keep the leaderboard honest.
          </p>
          <p style={{ margin: "0 0 10px" }}>
            <strong style={{ color: islandTheme.color.textPrimary }}>
              Claim your daily allowance
            </strong>{" "}
            from the Nuggies page. You also earn them by posting in Forums,
            playing games with the crew, and hitting achievement milestones.
          </p>
          <p
            style={{
              margin: 0,
              fontSize: islandTheme.text.sm,
              color: islandTheme.color.textMuted,
            }}
          >
            Tip: check Milestones to see which achievements pay out the most.
          </p>
        </>
      ),
    },
    {
      id: "casino",
      title: "Spend those Nuggies wisely.",
      visual: <CasinoPreview />,
      body: (
        <>
          <p style={{ margin: "0 0 10px" }}>
            The{" "}
            <strong style={{ color: islandTheme.color.textPrimary }}>
              Nuggie Casino
            </strong>{" "}
            is exactly what it sounds like — blackjack, coinflip, and
            guess-the-number. Lose them all. Win them back. Repeat indefinitely.
          </p>
          <p style={{ margin: "0 0 10px" }}>
            Find it under the Nuggies section in the navigation. No real money.
            No stakes except bragging rights on the leaderboard.
          </p>
          <p
            style={{
              margin: 0,
              fontSize: islandTheme.text.sm,
              color: islandTheme.color.textMuted,
            }}
          >
            Tip: blackjack pays the best odds if you play correctly. The island
            does not provide financial advice.
          </p>
        </>
      ),
    },
    {
      id: "done",
      title: `You're in, ${displayName}.`,
      visual: <DonePreview />,
      body: (
        <>
          <p style={{ margin: "0 0 10px" }}>
            That's the whole island. The home page pulls everything together —
            active crew, recent activity, and the gaming news feed. Start there.
          </p>
          <p style={{ margin: 0 }}>
            If you ever lose your bearings, the navigation up top has it all.
            Welcome to the crew.
          </p>
        </>
      ),
    },
  ];
}

// ── Progress dots ─────────────────────────────────────────────────────────────
function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div
      role="group"
      aria-label={`Step ${current + 1} of ${total}`}
      style={{ display: "flex", gap: 6, alignItems: "center" }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          aria-current={i === current ? "step" : undefined}
          style={{
            width: i === current ? 20 : 6,
            height: 6,
            borderRadius: 999,
            background:
              i < current
                ? islandTheme.color.primary
                : i === current
                  ? islandTheme.color.primary
                  : islandTheme.color.border,
            opacity: i < current ? 0.5 : 1,
            transition: "width 200ms ease, background 200ms ease, opacity 200ms ease",
          }}
        />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export type OnboardingFlowProps = {
  open: boolean;
  profile: MeProfile | null;
  onFinish: () => void;
};

export function OnboardingFlow({ open, profile, onFinish }: OnboardingFlowProps) {
  const steps = buildSteps(profile);
  const [stepIndex, setStepIndex] = useState(() => {
    const saved = readSavedStep();
    return Math.min(saved, steps.length - 1);
  });

  const primaryBtnWrapRef = useRef<HTMLDivElement>(null);

  const currentStep = steps[stepIndex];

  // Persist step on every change (for redirect-resume)
  useEffect(() => {
    if (open) {
      saveStep(stepIndex);
    }
  }, [stepIndex, open]);

  // Move focus into dialog on open / step change so keyboard + SR users land here.
  // We focus the first button inside the primary-button wrapper (Next / Maybe later).
  useEffect(() => {
    if (!open) return;
    // Small rAF defer so the DOM has settled after step transition
    const raf = requestAnimationFrame(() => {
      const btn = primaryBtnWrapRef.current?.querySelector<HTMLButtonElement>("button");
      btn?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open, stepIndex]);

  // Keyboard + body-scroll lock
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleSkip();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function handleSkip() {
    clearSavedStep();
    onFinish();
  }

  function handleNext() {
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      // Last step ("You're in") — done
      clearSavedStep();
      onFinish();
    }
  }

  function handleBack() {
    if (stepIndex > 0) {
      setStepIndex((i) => i - 1);
    }
  }

  const isLastStep = stepIndex === steps.length - 1;
  const isSteamStep = currentStep.id === "steam";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(16px, 4vw, 32px)",
        background: "rgba(7, 11, 19, 0.7)",
        backdropFilter: "blur(10px) saturate(120%)",
        WebkitBackdropFilter: "blur(10px) saturate(120%)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleSkip();
      }}
    >
      <IslandCard
        as="div"
        style={{
          width: "100%",
          maxWidth: 480,
          padding: 0,
          overflow: "hidden",
          position: "relative",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(120,180,230,0.12)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Skip button (top-right ✕) */}
        <button
          type="button"
          onClick={handleSkip}
          aria-label="Skip tour"
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 44,
            height: 44,
            borderRadius: islandTheme.radius.pill,
            border: "none",
            background: "rgba(255,255,255,0.08)",
            color: islandTheme.color.textMuted,
            cursor: "pointer",
            fontSize: 14,
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.14)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.08)";
          }}
        >
          ✕
        </button>

        {/* Step visual area */}
        <div
          style={{
            borderBottom: `1px solid ${islandTheme.color.cardBorder}`,
            background: islandTheme.color.panelMutedBg,
          }}
        >
          {currentStep.visual}
        </div>

        {/* Step content */}
        <div style={{ padding: "20px 24px 0" }}>
          <h2
            id="onboarding-title"
            className="island-display"
            style={{
              margin: "0 0 12px",
              fontSize: islandTheme.text.h3,
              fontWeight: 700,
              lineHeight: islandTheme.lineHeight.snug,
              color: islandTheme.color.textPrimary,
              paddingRight: 32, // clearance for the ✕ button
            }}
          >
            {currentStep.title}
          </h2>
          <div
            style={{
              fontSize: islandTheme.text.base,
              lineHeight: islandTheme.lineHeight.relaxed,
              color: islandTheme.color.textSecondary,
            }}
          >
            {currentStep.body}
          </div>
        </div>

        {/* Footer: progress dots + Back / Next */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px 20px",
            marginTop: 16,
            borderTop: `1px solid ${islandTheme.color.cardBorder}`,
            gap: 12,
          }}
        >
          <ProgressDots total={steps.length} current={stepIndex} />

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {stepIndex > 0 && (
              <IslandButton
                variant="ghost"
                size="sm"
                onClick={handleBack}
              >
                Back
              </IslandButton>
            )}

            {/* On the Steam step, show "Maybe later" as the primary advance action
                (so the SteamSignInButton in the body is the dominant CTA).
                On all other steps, show "Next" / "Let's go" as primary.
                primaryBtnWrapRef lets the focus effect find the button inside. */}
            <div ref={primaryBtnWrapRef} style={{ display: "contents" }}>
              {isSteamStep ? (
                <IslandButton
                  variant="secondary"
                  size="sm"
                  onClick={handleNext}
                >
                  Maybe later
                </IslandButton>
              ) : (
                <IslandButton
                  variant="primary"
                  size="sm"
                  onClick={handleNext}
                >
                  {isLastStep ? "Let's go 🏝️" : "Next"}
                </IslandButton>
              )}
            </div>
          </div>
        </div>

        {/* Bottom skip-tour text link (belt + suspenders) */}
        {!isLastStep && (
          <div
            style={{
              textAlign: "center",
              paddingBottom: 16,
              marginTop: -4,
            }}
          >
            <button
              type="button"
              onClick={handleSkip}
              style={{
                background: "transparent",
                border: "none",
                color: islandTheme.color.textMuted,
                fontSize: islandTheme.text.xs,
                cursor: "pointer",
                textDecoration: "underline",
                padding: "4px 8px",
                fontFamily: "inherit",
              }}
            >
              Skip tour
            </button>
          </div>
        )}
      </IslandCard>
    </div>
  );
}
