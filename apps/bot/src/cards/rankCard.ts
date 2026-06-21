// Milestone rank-up card (first consumer of the card capability).
//
// renderRankCard(opts) -> PNG Buffer. Wrap in AttachmentBuilder and attach to an
// embed. Always call behind a try/catch with a text fallback — a render failure
// must never block the role grant or bonus payout.

import { createCanvas } from "@napi-rs/canvas";
import { ensureFonts, FONT } from "./canvasEnv.js";
import { loadImageCached } from "./assets.js";
import {
  roundedRect,
  fitFont,
  drawAvatar,
  drawImageContain,
  drawProgressBar,
} from "./primitives.js";

export type RankCardOpts = {
  displayName: string;
  avatarUrl: string;
  tierLabel: string;
  coinUrl: string;
  accent: string; // hex tier color
  bonus: number;
  currentThreshold: number;
  lifetimeEarned?: number;
  nextLabel?: string;
  nextThreshold?: number;
};

const W = 900;
const H = 280;

export async function renderRankCard(opts: RankCardOpts): Promise<Buffer> {
  ensureFonts();

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background — dark base + a soft accent glow, then a framed panel.
  ctx.fillStyle = "#0f141b";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(170, 120, 30, 170, 120, 520);
  glow.addColorStop(0, hexA(opts.accent, 0.28));
  glow.addColorStop(1, hexA(opts.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  roundedRect(ctx, 12, 12, W - 24, H - 24, 22);
  ctx.lineWidth = 2;
  ctx.strokeStyle = hexA(opts.accent, 0.55);
  ctx.stroke();

  // Avatar (left) + coin (right) load in parallel.
  const [avatar, coin] = await Promise.all([
    loadImageCached(opts.avatarUrl, false).catch(() => null),
    loadImageCached(opts.coinUrl, true).catch(() => null),
  ]);

  const avX = 120;
  const avY = 132;
  const avR = 78;
  if (avatar) {
    drawAvatar(ctx, avatar, avX, avY, avR, { color: opts.accent, width: 6 });
  } else {
    ctx.beginPath();
    ctx.arc(avX, avY, avR, 0, Math.PI * 2);
    ctx.fillStyle = "#1b2530";
    ctx.fill();
  }

  if (coin) drawImageContain(ctx, coin, 688, 42, 140, 165);

  // Text block.
  const tx = 232;
  const maxText = 430;

  ctx.fillStyle = "#f4f6f8";
  const nameSize = fitFont(ctx, opts.displayName, maxText, 40, FONT.display, 700);
  ctx.fillText(opts.displayName, tx, 88);

  ctx.fillStyle = "#93a1b0";
  ctx.font = `400 19px "${FONT.body}"`;
  ctx.fillText("reached", tx, 116);

  ctx.fillStyle = opts.accent;
  fitFont(ctx, opts.tierLabel, maxText, 46, FONT.display, 700);
  ctx.fillText(opts.tierLabel, tx, 162);
  void nameSize;

  ctx.fillStyle = "#fbbf24";
  ctx.font = `700 22px "${FONT.mono}"`;
  // Spell "Nuggies" rather than the ₦ sign — U+20A6 isn't in the bundled font
  // subsets, so the glyph would render as tofu.
  ctx.fillText(`+${opts.bonus.toLocaleString("en-US")} Nuggies`, tx, 196);

  // Progress to next tier (omitted at apex or when data is missing).
  if (
    opts.lifetimeEarned != null &&
    opts.nextThreshold != null &&
    opts.nextThreshold > opts.currentThreshold
  ) {
    const span = opts.nextThreshold - opts.currentThreshold;
    const within = Math.max(0, opts.lifetimeEarned - opts.currentThreshold);
    const pct = within / span;
    drawProgressBar(ctx, tx, 224, maxText, 14, pct, opts.accent);
    ctx.fillStyle = "#93a1b0";
    ctx.font = `400 14px "${FONT.mono}"`;
    const label = `${opts.lifetimeEarned.toLocaleString("en-US")} / ${opts.nextThreshold.toLocaleString("en-US")}`;
    ctx.fillText(label, tx, 256);
    if (opts.nextLabel) {
      ctx.textAlign = "right";
      ctx.fillStyle = hexA("#ffffff", 0.5);
      ctx.fillText(`next: ${opts.nextLabel}`, tx + maxText, 256);
      ctx.textAlign = "left";
    }
  } else {
    ctx.fillStyle = hexA(opts.accent, 0.9);
    ctx.font = `700 16px "${FONT.mono}"`;
    ctx.fillText("APEX TIER — undisputed", tx, 236);
  }

  return canvas.toBuffer("image/png");
}

/** "#rrggbb" + alpha -> "rgba(...)". */
function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16,
  );
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}
