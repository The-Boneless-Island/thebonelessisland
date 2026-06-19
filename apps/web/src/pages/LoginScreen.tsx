import { API_BASE_URL } from "../api/client.js";
import { islandTheme } from "../theme.js";

const STYLES = `
  @keyframes palmSwayL {
    0%, 100% { transform: rotate(0deg); }
    35%       { transform: rotate(-1.8deg); }
    72%       { transform: rotate(1.4deg); }
  }
  @keyframes palmSwayR {
    0%, 100% { transform: rotate(0deg); }
    35%       { transform: rotate(1.8deg); }
    72%       { transform: rotate(-1.4deg); }
  }
  @keyframes palmExitL {
    0%   { transform: translateX(0)     rotate(0deg);   opacity: 1; }
    100% { transform: translateX(-130%) rotate(-14deg); opacity: 0; }
  }
  @keyframes palmExitR {
    0%   { transform: translateX(0)    rotate(0deg);  opacity: 1; }
    100% { transform: translateX(130%) rotate(14deg); opacity: 0; }
  }
  @keyframes cardFadeIn {
    0%   { opacity: 0; transform: scale(0.96) translateY(18px); }
    100% { opacity: 1; transform: scale(1)    translateY(0);    }
  }
  @keyframes cardFadeOut {
    0%   { opacity: 1; transform: scale(1)    translateY(0);     }
    100% { opacity: 0; transform: scale(0.93) translateY(12px); }
  }
  @keyframes frondFloat1 {
    0%, 100% { transform: rotate(0deg); }
    50%      { transform: rotate(2.8deg); }
  }
  @keyframes frondFloat2 {
    0%, 100% { transform: rotate(0deg); }
    60%      { transform: rotate(-2.4deg); }
  }
  @keyframes frondFloat3 {
    0%, 100% { transform: rotate(0deg); }
    45%      { transform: rotate(1.6deg); }
    85%      { transform: rotate(-1.2deg); }
  }
  @keyframes loginSkeletonPulse {
    0%, 100% { opacity: 0.4; }
    50%      { opacity: 0.7; }
  }
`;

// Frond floats cycle through 3 keyframe names with varied durations/delays
const FLOAT_ANIMS = ["frondFloat1", "frondFloat2", "frondFloat3"] as const;

type FrondProps = {
  /** degrees, 0 = pointing right, -90 = pointing straight up */
  angle: number;
  length?: number;
  color?: string;
  /** how much the tip droops downward, as a fraction of length */
  droop?: number;
  animIdx?: number;
};

function Frond({ angle, length = 190, color = "#2d6a4f", droop = 0.1, animIdx = 0 }: FrondProps) {
  const halfW = length * 0.085;
  const tx = length;
  const ty = droop * length;

  // Upper bezier: sweeps out and slightly droops to tip
  // Lower bezier: mirrors back to origin
  const upper = `C ${tx * 0.28} ${-halfW * 1.4} ${tx * 0.65} ${ty * 0.55 - halfW * 1.2} ${tx} ${ty}`;
  const lower = `C ${tx * 0.65} ${ty + halfW * 1.2} ${tx * 0.28} ${halfW * 1.4} 0 0`;
  const d = `M 0 0 ${upper} ${lower} Z`;

  const anim = FLOAT_ANIMS[animIdx % 3];
  const dur = 4.2 + (animIdx * 0.7) % 3.2;
  const delay = (animIdx * 0.55) % 3.5;

  return (
    <g
      transform={`rotate(${angle})`}
      style={{
        transformOrigin: "0 0",
        animation: `${anim} ${dur}s ease-in-out ${delay}s infinite`
      }}
    >
      <path d={d} fill={color} />
      {/* subtle midrib */}
      <path
        d={`M 0 0 C ${tx * 0.35} ${ty * 0.3} ${tx * 0.7} ${ty * 0.75} ${tx} ${ty}`}
        stroke="rgba(0,0,0,0.18)"
        strokeWidth="1.2"
        fill="none"
      />
    </g>
  );
}

function PalmTrunk({ x1, y1, x2, y2, w = 9 }: { x1: number; y1: number; x2: number; y2: number; w?: number }) {
  // Slight S-curve trunk using two cubic bezier control points
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const cp1x = x1 + (x2 - x1) * 0.25 - 12;
  const cp2x = x1 + (x2 - x1) * 0.75 + 10;
  const hw = w / 2;
  return (
    <path
      d={`
        M ${x1 - hw} ${y1}
        C ${cp1x - hw} ${my} ${cp2x - hw} ${my} ${x2 - hw * 0.4} ${y2}
        L ${x2 + hw * 0.4} ${y2}
        C ${cp2x + hw} ${my} ${cp1x + hw} ${my} ${x1 + hw} ${y1}
        Z
      `}
      fill="#4a5e2a"
    />
  );
}

function PalmSVGContent({ mirrored = false }: { mirrored?: boolean }) {
  const sx = mirrored ? -1 : 1;
  return (
    <g transform={mirrored ? "scale(-1,1) translate(-520, 0)" : undefined}>
      {/* ── Palm A — back, leftmost, shorter ── */}
      <PalmTrunk x1={62} y1={900} x2={82} y2={380} w={8} />
      <g transform="translate(80, 375)" opacity="0.82">
        <Frond angle={-125} length={150} color="#1b4332" droop={0.08} animIdx={0} />
        <Frond angle={-100} length={165} color="#2d6a4f" droop={0.06} animIdx={3} />
        <Frond angle={-72}  length={158} color="#1b4332" droop={0.08} animIdx={6} />
        <Frond angle={-45}  length={145} color="#2d6a4f" droop={0.12} animIdx={9} />
        <Frond angle={-18}  length={132} color="#1b4332" droop={0.18} animIdx={1} />
        <Frond angle={12}   length={118} color="#2d6a4f" droop={0.28} animIdx={4} />
      </g>

      {/* ── Palm B — main, tallest, center ── */}
      <PalmTrunk x1={205} y1={900} x2={220} y2={155} w={11} />
      <g transform="translate(218, 150)">
        <Frond angle={-148} length={195} color="#2d6a4f" droop={0.1}  animIdx={2} />
        <Frond angle={-128} length={215} color="#40916c" droop={0.08} animIdx={5} />
        <Frond angle={-105} length={235} color="#52b788" droop={0.05} animIdx={8} />
        <Frond angle={-82}  length={240} color="#40916c" droop={0.04} animIdx={0} />
        <Frond angle={-58}  length={230} color="#2d6a4f" droop={0.07} animIdx={3} />
        <Frond angle={-35}  length={215} color="#40916c" droop={0.12} animIdx={6} />
        <Frond angle={-12}  length={195} color="#2d6a4f" droop={0.19} animIdx={9} />
        <Frond angle={14}   length={172} color="#1b4332" droop={0.28} animIdx={2} />
        <Frond angle={40}   length={148} color="#2d6a4f" droop={0.38} animIdx={7} />
      </g>

      {/* ── Palm C — front, right-of-center ── */}
      <PalmTrunk x1={355} y1={900} x2={368} y2={295} w={9} />
      <g transform="translate(366, 290)">
        <Frond angle={-135} length={172} color="#1b4332" droop={0.09} animIdx={1} />
        <Frond angle={-108} length={195} color="#2d6a4f" droop={0.06} animIdx={4} />
        <Frond angle={-80}  length={212} color="#52b788" droop={0.05} animIdx={7} />
        <Frond angle={-52}  length={208} color="#40916c" droop={0.08} animIdx={0} />
        <Frond angle={-25}  length={190} color="#2d6a4f" droop={0.14} animIdx={5} />
        <Frond angle={4}    length={168} color="#1b4332" droop={0.22} animIdx={8} />
        <Frond angle={30}   length={145} color="#2d6a4f" droop={0.32} animIdx={2} />
      </g>
    </g>
  );
}

function LeftPalmCluster() {
  return (
    <svg
      viewBox="0 0 520 900"
      preserveAspectRatio="xMinYMax meet"
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <PalmSVGContent />
    </svg>
  );
}

function RightPalmCluster() {
  return (
    <svg
      viewBox="0 0 520 900"
      preserveAspectRatio="xMaxYMax meet"
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <PalmSVGContent mirrored />
    </svg>
  );
}

function DiscordLogo() {
  return (
    <svg width="20" height="15" viewBox="0 0 71 55" fill="none" aria-hidden="true">
      <path
        d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.44077 45.4204 0.52529C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.52529C25.5141 0.44359 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.518 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.518 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z"
        fill="white"
      />
    </svg>
  );
}

type LoginScreenProps = {
  loading: boolean;
  authError: string | null;
  exiting: boolean;
};

export function LoginScreen({ loading, authError, exiting }: LoginScreenProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Day-mode sky + ocean gradient matching the island scene
        background:
          "linear-gradient(180deg, #0c4a6e 0%, #0369a1 15%, #0ea5e9 40%, #38bdf8 62%, #7dd3fc 78%, #bae6fd 90%, #e0f2fe 100%)"
      }}
    >
      <style>{STYLES}</style>

      {/* Ocean shimmer at the bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "28%",
          background:
            "linear-gradient(180deg, transparent 0%, rgba(3, 105, 161, 0.25) 50%, rgba(2, 132, 199, 0.55) 100%)",
          pointerEvents: "none"
        }}
      />

      {/* ── Left palm cluster ── */}
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: "52vw",
          height: "100vh",
          transformOrigin: "28% 100%",
          animation: exiting
            ? "palmExitL 0.72s cubic-bezier(0.4, 0, 1, 0.75) forwards"
            : "palmSwayL 8s ease-in-out infinite",
          zIndex: 2,
          pointerEvents: "none"
        }}
      >
        <LeftPalmCluster />
      </div>

      {/* ── Right palm cluster ── */}
      <div
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: "52vw",
          height: "100vh",
          transformOrigin: "72% 100%",
          animation: exiting
            ? "palmExitR 0.72s cubic-bezier(0.4, 0, 1, 0.75) forwards"
            : "palmSwayR 9s ease-in-out 1.4s infinite",
          zIndex: 2,
          pointerEvents: "none"
        }}
      >
        <RightPalmCluster />
      </div>

      {/* ── Login card ── */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: 360,
          maxWidth: "calc(100vw - 48px)",
          animation: exiting ? "cardFadeOut 0.44s ease forwards" : "cardFadeIn 0.5s ease forwards",
          background: islandTheme.color.panelBg,
          backdropFilter: islandTheme.glass.blurStrong,
          WebkitBackdropFilter: islandTheme.glass.blurStrong,
          border: `1px solid ${islandTheme.color.cardBorder}`,
          borderRadius: 20,
          padding: "32px 28px 24px",
          boxShadow:
            "0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06) inset"
        }}
      >
        {/* Logo + heading */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 999,
              background: 'url("/boneless-island-logo.png") center/cover',
              border: `2px solid ${islandTheme.color.cardBorder}`,
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.12), 0 8px 24px rgba(0,0,0,0.45)",
              margin: "0 auto 14px"
            }}
          />
          <div
            className="island-display"
            style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.2 }}
          >
            Welcome to the Island
          </div>
          <div
            className="island-mono"
            style={{
              fontSize: 12,
              color: islandTheme.color.textMuted,
              marginTop: 6
            }}
          >
            {loading ? "Checking your session…" : "Sign in to join the crew"}
          </div>
        </div>

        {/* Auth error */}
        {authError ? (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: islandTheme.color.dangerSurface,
              border: `1px solid ${islandTheme.color.danger}`,
              color: islandTheme.color.dangerText,
              fontSize: 13,
              marginBottom: 16
            }}
          >
            {authError}
          </div>
        ) : null}

        {/* Button area */}
        {loading ? (
          <div
            style={{
              height: 50,
              borderRadius: 12,
              background: islandTheme.color.panelMutedBg,
              border: `1px solid ${islandTheme.color.cardBorder}`,
              animation: "loginSkeletonPulse 1.6s ease-in-out infinite"
            }}
          />
        ) : (
          <a
            href={`${API_BASE_URL}/auth/discord/login`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: "13px 16px",
              borderRadius: 12,
              background: "linear-gradient(135deg, #5865f2 0%, #4752c4 100%)",
              color: islandTheme.color.textInverted,
              textDecoration: "none",
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: "-0.01em",
              boxShadow: "0 4px 20px rgba(88, 101, 242, 0.52)",
              transition: "transform 120ms ease, box-shadow 120ms ease"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 8px 28px rgba(88, 101, 242, 0.7)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 20px rgba(88, 101, 242, 0.52)";
            }}
          >
            <DiscordLogo />
            Sign in with Discord
          </a>
        )}

        <div
          className="island-mono"
          style={{
            textAlign: "center",
            fontSize: 12,
            color: islandTheme.color.textMuted,
            marginTop: 18,
            lineHeight: 1.6
          }}
        >
          Guild members only · Access gated by Discord roles
        </div>
      </div>
    </div>
  );
}
