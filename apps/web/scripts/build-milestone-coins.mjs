// Build milestone rank BADGE SVGs from source art.
//
// Each tier = themed metallic shield frame + recessed scene + subject art
// embedded as base64 (required for secure-static <img> loading).
//
// Source-of-truth: drop a PNG in public/art/milestones/, point a config row at it,
// run `node apps/web/scripts/build-milestone-coins.mjs`. Re-runnable.
//
// Outputs per tier: <slug>.svg/.png + <slug>-locked.svg/.png (512px Discord) + web/<slug>.png (128px UI).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "art", "milestones");
const WEB_DIR = join(DIR, "web");

/** Classic crest shield — outer frame (viewBox 0 0 100 118). */
const SHIELD_OUTER =
  "M50 2 L90 15 L90 54 C90 78 70 98 50 112 C30 98 10 78 10 54 L10 15 Z";
const SHIELD_FACE =
  "M50 9 L82 19 L82 52 C82 72 67 90 50 102 C33 90 18 72 18 52 L18 19 Z";
const SHIELD_CLIP =
  "M50 13 L78 22 L78 51 C78 69 65 85 50 96 C35 85 22 69 22 51 L22 22 Z";

const TIERS = [
  {
    out: "vault-dweller",
    png: "vault_dweller_door.png",
    label: "Vault Dweller",
    rim: ["#cdd5dd", "#7c8896", "#3a4450"],
    bezel: "#20262e",
    scene: ["#2a322e", "#10130f"],
    inner: "#cdd5dd",
    ribbon: ["#94a3b8", "#475569"],
    box: [14, 16, 72, 62],
  },
  {
    out: "silver",
    png: "hard_stuck_silver_rank.png",
    label: "Hard Stuck Silver",
    rim: ["#f8fafc", "#cbd5e1", "#64748b"],
    bezel: "#0f172a",
    scene: ["#3a4150", "#1f242b"],
    inner: "#e2e8f0",
    ribbon: ["#e2e8f0", "#64748b"],
    box: [10, 14, 80, 66],
  },
  {
    out: "regular",
    png: "regular_rr.png",
    label: "Regular",
    rim: ["#fcd34d", "#d97706", "#92400e"],
    bezel: "#7c2d12",
    scene: ["#3a2a14", "#160d05"],
    inner: "#fde6b0",
    ribbon: ["#fbbf24", "#b45309"],
    box: [26, 14, 48, 68],
  },
  {
    out: "divine",
    png: "divine_orb.png",
    label: "Divine",
    rim: ["#f0d9a6", "#b08d57", "#5e4427"],
    bezel: "#2e2010",
    scene: ["#332338", "#120c08"],
    inner: "#f0d9a6",
    ribbon: ["#e8d6b0", "#8b6fae"],
    box: [18, 18, 64, 58],
  },
  {
    out: "got-gud",
    png: "got_gud_victory.png",
    label: "Got Gud",
    rim: ["#fef3c7", "#f59e0b", "#b45309"],
    bezel: "#160f06",
    scene: ["#241a30", "#0e0a14"],
    inner: "#fde68a",
    ribbon: ["#fde68a", "#d97706"],
    box: [8, 36, 84, 34],
  },
  {
    out: "king-of-the-hill",
    png: "king_of_the_hill_skull.png",
    label: "King of the Hill",
    rim: ["#c4b5fd", "#818cf8", "#3730a3"],
    bezel: "#1e1b4b",
    scene: ["#3a3a8a", "#15132b"],
    inner: "#c7d2fe",
    ribbon: ["#c4b5fd", "#4338ca"],
    box: [20, 16, 60, 64],
  },
  {
    out: "big-boss",
    png: "bigboss_bandana.png",
    label: "Big Boss",
    rim: ["#d9e0a8", "#8a9a52", "#3f4d2c"],
    bezel: "#2e3618",
    scene: ["#edebcb", "#aab07a"],
    inner: "#d9e0a8",
    ribbon: ["#d9e0a8", "#5c6b32"],
    box: [12, 26, 76, 50],
  },
  {
    out: "kappa",
    png: "kappa_case.png",
    label: "Kappa",
    rim: ["#9aa3ae", "#4b5563", "#1f2937"],
    bezel: "#0f1115",
    scene: ["#dbe3ec", "#8a97a8"],
    inner: "#fdba74",
    ribbon: ["#fdba74", "#ea580c"],
    box: [12, 22, 76, 56],
  },
];

function buildBadgeSvg(t, b64, { locked = false } = {}) {
  const [x, y, w, h] = t.box;
  const fit = t.fit === "slice" ? "xMidYMid slice" : "xMidYMid meet";

  const rim = locked
    ? ["#4b515a", "#2e333a", "#15171b"]
    : t.rim;
  const bezel = locked ? "#15171b" : t.bezel;
  const scene = locked ? ["#888f9a", "#3a3f47"] : t.scene;
  const inner = locked ? "#5a616b" : t.inner;
  const ribbon = locked ? ["#3a3f47", "#1f2228"] : t.ribbon;

  const silFilter = locked
    ? `<filter id="sil" x="-10%" y="-10%" width="120%" height="120%"><feColorMatrix type="matrix" values="0 0 0 0 0.085  0 0 0 0 0.095  0 0 0 0 0.11  0 0 0 1 0"/></filter>`
    : "";

  const imageNode = locked
    ? `<image href="data:image/png;base64,${b64}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${fit}" filter="url(#sil)"/>`
    : `<image href="data:image/png;base64,${b64}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${fit}"/>
       <ellipse cx="42" cy="30" rx="18" ry="7" fill="#ffffff" opacity=".12"/>`;

  return `<svg viewBox="0 0 100 118" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${t.label}${locked ? " (locked)" : ""}">
  <defs>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${rim[0]}"/><stop offset=".5" stop-color="${rim[1]}"/><stop offset="1" stop-color="${rim[2]}"/></linearGradient>
    <radialGradient id="scene" cx=".5" cy=".38" r=".75"><stop offset="0" stop-color="${scene[0]}"/><stop offset="1" stop-color="${scene[1]}"/></radialGradient>
    <linearGradient id="ribbon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ribbon[0]}"/><stop offset="1" stop-color="${ribbon[1]}"/></linearGradient>
    <clipPath id="clip"><path d="${SHIELD_CLIP}"/></clipPath>
    ${silFilter}
  </defs>
  <!-- Outer shield frame -->
  <path d="${SHIELD_OUTER}" fill="url(#rim)"/>
  <path d="${SHIELD_OUTER}" fill="none" stroke="${bezel}" stroke-width="1.2" opacity=".55"/>
  <!-- Bezel inset -->
  <path d="${SHIELD_FACE}" fill="${bezel}"/>
  <!-- Scene well -->
  <path d="${SHIELD_CLIP}" fill="url(#scene)"/>
  <!-- Subject art -->
  <g clip-path="url(#clip)">${imageNode}</g>
  <!-- Inner hairline -->
  <path d="${SHIELD_CLIP}" fill="none" stroke="${inner}" stroke-width="1.4" opacity=".6"/>
  <!-- Bottom ribbon tab -->
  <path d="M38 100 L50 110 L62 100 L62 96 L38 96 Z" fill="url(#ribbon)"/>
  <path d="M38 100 L50 110 L62 100" fill="none" stroke="${bezel}" stroke-width=".8" opacity=".45"/>
</svg>
`;
}

mkdirSync(WEB_DIR, { recursive: true });

for (const t of TIERS) {
  const b64 = readFileSync(join(DIR, t.png)).toString("base64");

  const svg = buildBadgeSvg(t, b64, { locked: false });
  writeFileSync(join(DIR, `${t.out}.svg`), svg);
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 512 } }).render().asPng();
  writeFileSync(join(DIR, `${t.out}.png`), png);

  const lockedSvg = buildBadgeSvg(t, b64, { locked: true });
  writeFileSync(join(DIR, `${t.out}-locked.svg`), lockedSvg);
  const lockedPng = new Resvg(lockedSvg, { fitTo: { mode: "width", value: 512 } }).render().asPng();
  writeFileSync(join(DIR, `${t.out}-locked.png`), lockedPng);

  const webPng = new Resvg(svg, { fitTo: { mode: "width", value: 128 } }).render().asPng();
  writeFileSync(join(WEB_DIR, `${t.out}.png`), webPng);
  const webLockedPng = new Resvg(lockedSvg, { fitTo: { mode: "width", value: 128 } }).render().asPng();
  writeFileSync(join(WEB_DIR, `${t.out}-locked.png`), webLockedPng);

  console.log(`wrote ${t.out}.svg/.png + ${t.out}-locked.svg/.png (badge)`);
}
