// Local card preview — renders sample rank cards to disk so the layout can be
// eyeballed without Discord. Run: npx tsx apps/bot/scripts/preview-card.ts
//
// Uses local coin PNGs (file paths) for both the coin and a stand-in avatar.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderRankCard } from "../src/cards/rankCard.js";

const here = dirname(fileURLToPath(import.meta.url));
const ART = join(here, "..", "..", "web", "public", "art", "milestones");

const samples = [
  { tierLabel: "KAPPA", slug: "kappa", accent: "#f97316", bonus: 75000,
    currentThreshold: 750000 },
  { tierLabel: "DIVINE", slug: "divine", accent: "#c9a86a", bonus: 1500,
    currentThreshold: 15000, lifetimeEarned: 28400, nextThreshold: 40000, nextLabel: "GOT GUD" },
  { tierLabel: "VAULT DWELLER", slug: "vault-dweller", accent: "#94a3b8", bonus: 50,
    currentThreshold: 500, lifetimeEarned: 900, nextThreshold: 2000, nextLabel: "HARD STUCK SILVER" },
];

for (const s of samples) {
  const png = await renderRankCard({
    displayName: "NuggetLord_99",
    avatarUrl: join(ART, "divine.png"), // stand-in avatar
    tierLabel: s.tierLabel,
    coinUrl: join(ART, `${s.slug}.png`),
    accent: s.accent,
    bonus: s.bonus,
    currentThreshold: s.currentThreshold,
    lifetimeEarned: s.lifetimeEarned,
    nextThreshold: s.nextThreshold,
    nextLabel: s.nextLabel,
  });
  const out = join(here, "..", "..", "..", `_cardpreview_${s.slug}.png`);
  writeFileSync(out, png);
  console.log(`wrote ${out} (${(png.length / 1024).toFixed(0)} KB)`);
}
