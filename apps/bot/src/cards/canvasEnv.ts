// One-time font registration for canvas-rendered cards.
//
// Alpine (the bot's runtime) ships NO system fonts, so we must register our own.
// fontsource ships woff2, which @napi-rs/canvas accepts. Inter is registered last
// and acts as the per-glyph fallback (it covers the ₦ / U+20A6 sign that Space
// Grotesk and JetBrains Mono lack).

import { GlobalFonts } from "@napi-rs/canvas";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const FONT = {
  display: "Space Grotesk",
  body: "Inter",
  mono: "JetBrains Mono",
} as const;

let registered = false;

export function ensureFonts(): void {
  if (registered) return;
  const reg = (pkg: string, family: string) =>
    GlobalFonts.registerFromPath(require.resolve(pkg), family);

  reg("@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2", FONT.display);
  reg("@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff2", FONT.display);
  reg("@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2", FONT.mono);
  // Inter last → per-glyph fallback (supplies ₦ for mono amounts).
  reg("@fontsource/inter/files/inter-latin-600-normal.woff2", FONT.body);
  reg("@fontsource/inter/files/inter-latin-400-normal.woff2", FONT.body);

  registered = true;
}
