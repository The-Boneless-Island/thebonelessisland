// Generic drawing primitives shared by all card types. Keep card-type files
// composing these — don't re-implement geometry per card.

import type { SKRSContext2D, Image } from "@napi-rs/canvas";

export function roundedRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Set ctx.font to the largest size (<= startPx) whose text fits maxWidth. */
export function fitFont(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  startPx: number,
  family: string,
  weight = 400,
  minPx = 12,
): number {
  let size = startPx;
  for (;;) {
    ctx.font = `${weight} ${size}px "${family}"`;
    if (ctx.measureText(text).width <= maxWidth || size <= minPx) return size;
    size -= 2;
  }
}

/** Draw an image cropped to a circle, with an optional ring. */
export function drawAvatar(
  ctx: SKRSContext2D,
  img: Image,
  cx: number,
  cy: number,
  radius: number,
  ring?: { color: string; width: number },
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();
  if (ring) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.lineWidth = ring.width;
    ctx.strokeStyle = ring.color;
    ctx.stroke();
  }
}

/** Contain-fit an image inside a box, centered (preserves aspect). */
export function drawImageContain(
  ctx: SKRSContext2D,
  img: Image,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

export function drawProgressBar(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pct: number,
  fill: string,
): void {
  const clamped = Math.max(0, Math.min(1, pct));
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  roundedRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  if (clamped > 0) {
    ctx.fillStyle = fill;
    roundedRect(ctx, x, y, Math.max(h, w * clamped), h, h / 2);
    ctx.fill();
  }
}
