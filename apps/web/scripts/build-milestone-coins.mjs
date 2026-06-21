// Build milestone rank "coin" SVGs from source art.
//
// Each tier's coin = a themed metallic rim + recessed scene + the subject art
// embedded as a base64 data-URI. We embed (not <image href="file">) because an
// SVG loaded via <img> runs in secure-static mode and will NOT fetch external
// files — the raster must be inlined.
//
// Source-of-truth pattern: drop a PNG in public/art/milestones/, point a config
// row at it, run `node apps/web/scripts/build-milestone-coins.mjs`. Re-runnable.
//
// Per-tier knobs:
//   rim   — [light, mid, dark] metallic ring gradient stops
//   bezel — dark inner-bezel + edge stroke colour
//   scene — recessed-disc radial stops [inner, outer]; tune for SUBJECT CONTRAST
//           (dark scene behind bright art, light scene behind dark art)
//   inner — inner hairline-ring colour
//   box   — [x, y, w, h] placement of the art inside the 100x100 coin
//   fit   — "meet" (contain, default) or "slice" (cover/crop)
//
// NOTE: web consumes the .svg. To extend these to Discord (which can't render
// SVG), add a rasterize pass here that writes a .png per tier via @resvg/resvg-js
// or sharp — same config, second output. Not wired yet (needs the dep).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "art", "milestones");

const TIERS = [
  { out: "vault-dweller",    png: "vault_dweller_door.png",      label: "Vault Dweller",
    rim: ["#cdd5dd", "#7c8896", "#3a4450"], bezel: "#20262e",
    scene: ["#2a322e", "#10130f"], inner: "#cdd5dd", box: [6, 6, 88, 88] },
  { out: "silver",           png: "hard_stuck_silver_rank.png",  label: "Hard Stuck Silver",
    rim: ["#f8fafc", "#cbd5e1", "#64748b"], bezel: "#0f172a",
    scene: ["#3a4150", "#1f242b"], inner: "#e2e8f0", box: [2, 2, 96, 96] },
  { out: "regular",          png: "regular_rr.png",              label: "Regular",
    rim: ["#fcd34d", "#d97706", "#92400e"], bezel: "#7c2d12",
    scene: ["#3a2a14", "#160d05"], inner: "#fde6b0", box: [26, 8, 48, 84] },
  { out: "divine",           png: "divine_orb.png",              label: "Divine",
    rim: ["#f0d9a6", "#b08d57", "#5e4427"], bezel: "#2e2010",
    scene: ["#332338", "#120c08"], inner: "#f0d9a6", box: [14, 14, 72, 72] },
  { out: "got-gud",          png: "got_gud_victory.png",         label: "Got Gud",
    rim: ["#fef3c7", "#f59e0b", "#b45309"], bezel: "#160f06",
    scene: ["#241a30", "#0e0a14"], inner: "#fde68a", box: [6, 30, 88, 40] },
  { out: "king-of-the-hill", png: "king_of_the_hill_skull.png",  label: "King of the Hill",
    rim: ["#c4b5fd", "#818cf8", "#3730a3"], bezel: "#1e1b4b",
    scene: ["#3a3a8a", "#15132b"], inner: "#c7d2fe", box: [18, 12, 64, 76] },
  { out: "big-boss",         png: "bigboss_bandana.png",         label: "Big Boss",
    rim: ["#d9e0a8", "#8a9a52", "#3f4d2c"], bezel: "#2e3618",
    scene: ["#edebcb", "#aab07a"], inner: "#d9e0a8", box: [11, 22, 78, 56] },
  { out: "kappa",            png: "kappa_case.png",              label: "Kappa",
    rim: ["#9aa3ae", "#4b5563", "#1f2937"], bezel: "#0f1115",
    scene: ["#dbe3ec", "#8a97a8"], inner: "#fdba74", box: [11, 18, 78, 64] },
];

for (const t of TIERS) {
  const b64 = readFileSync(join(DIR, t.png)).toString("base64");
  const [x, y, w, h] = t.box;
  const fit = t.fit === "slice" ? "xMidYMid slice" : "xMidYMid meet";
  const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${t.label}">
  <defs>
    <radialGradient id="rim" cx=".5" cy=".32" r=".8"><stop offset="0" stop-color="${t.rim[0]}"/><stop offset=".55" stop-color="${t.rim[1]}"/><stop offset="1" stop-color="${t.rim[2]}"/></radialGradient>
    <radialGradient id="scene" cx=".5" cy=".42" r=".72"><stop offset="0" stop-color="${t.scene[0]}"/><stop offset="1" stop-color="${t.scene[1]}"/></radialGradient>
    <clipPath id="clip"><circle cx="50" cy="50" r="37"/></clipPath>
  </defs>
  <circle cx="50" cy="50" r="49" fill="url(#rim)"/>
  <circle cx="50" cy="50" r="49" fill="none" stroke="${t.bezel}" stroke-width="1" opacity=".5"/>
  <circle cx="50" cy="50" r="40.5" fill="${t.bezel}"/>
  <circle cx="50" cy="50" r="37" fill="url(#scene)"/>
  <g clip-path="url(#clip)">
    <image href="data:image/png;base64,${b64}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${fit}"/>
    <ellipse cx="40" cy="28" rx="20" ry="8" fill="#ffffff" opacity=".10"/>
  </g>
  <circle cx="50" cy="50" r="37" fill="none" stroke="${t.inner}" stroke-width="1.2" opacity=".55"/>
</svg>
`;
  writeFileSync(join(DIR, `${t.out}.svg`), svg);

  // Discord can't render SVG — rasterize the same coin to a transparent PNG
  // (512px) for embed images, rank cards, role icons, and custom emojis.
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 512 } })
    .render()
    .asPng();
  writeFileSync(join(DIR, `${t.out}.png`), png);

  // "Locked" variant — a "guess-that-Pokémon" silhouette: the same subject art
  // recolored to a near-black shape (feColorMatrix maps RGB to a fixed dark,
  // keeps alpha) on a muted gray disc. Shown on the ladder for tiers not yet
  // reached, so members see the shape they're working toward.
  const lockedSvg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${t.label} (locked)">
  <defs>
    <radialGradient id="rim" cx=".5" cy=".32" r=".8"><stop offset="0" stop-color="#4b515a"/><stop offset=".55" stop-color="#2e333a"/><stop offset="1" stop-color="#15171b"/></radialGradient>
    <radialGradient id="scene" cx=".5" cy=".42" r=".72"><stop offset="0" stop-color="#888f9a"/><stop offset="1" stop-color="#3a3f47"/></radialGradient>
    <clipPath id="clip"><circle cx="50" cy="50" r="37"/></clipPath>
    <filter id="sil" x="-10%" y="-10%" width="120%" height="120%"><feColorMatrix type="matrix" values="0 0 0 0 0.085  0 0 0 0 0.095  0 0 0 0 0.11  0 0 0 1 0"/></filter>
  </defs>
  <circle cx="50" cy="50" r="49" fill="url(#rim)"/>
  <circle cx="50" cy="50" r="49" fill="none" stroke="#15171b" stroke-width="1" opacity=".5"/>
  <circle cx="50" cy="50" r="40.5" fill="#15171b"/>
  <circle cx="50" cy="50" r="37" fill="url(#scene)"/>
  <g clip-path="url(#clip)">
    <image href="data:image/png;base64,${b64}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${fit}" filter="url(#sil)"/>
  </g>
  <circle cx="50" cy="50" r="37" fill="none" stroke="#5a616b" stroke-width="1.2" opacity=".5"/>
</svg>
`;
  writeFileSync(join(DIR, `${t.out}-locked.svg`), lockedSvg);
  const lockedPng = new Resvg(lockedSvg, { fitTo: { mode: "width", value: 512 } })
    .render()
    .asPng();
  writeFileSync(join(DIR, `${t.out}-locked.png`), lockedPng);

  console.log(
    `wrote ${t.out}.svg/.png + ${t.out}-locked.svg/.png`,
  );
}
