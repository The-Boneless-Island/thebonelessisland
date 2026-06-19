import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { compression } from "vite-plugin-compression2";
import { visualizer } from "rollup-plugin-visualizer";

// ANALYZE=1 npm run build  →  writes dist/bundle-stats.html for inspecting
// chunk composition. Off by default so normal builds stay fast.
const analyze = process.env.ANALYZE === "1";

export default defineConfig({
  plugins: [
    react(),
    // Emit precompressed .br/.gz sidecars next to each asset. Caddy can't do
    // brotli on the fly, so it serves these directly via `precompressed br gzip`
    // (see infra/Caddyfile). skipIfLargerOrEqual drops files that don't shrink.
    compression({ algorithm: "brotliCompress", exclude: [/\.(br|gz)$/], skipIfLargerOrEqual: true }),
    compression({ algorithm: "gzip", exclude: [/\.(br|gz)$/], skipIfLargerOrEqual: true }),
    ...(analyze
      ? [visualizer({ filename: "dist/bundle-stats.html", gzipSize: true, brotliSize: true })]
      : [])
  ],
  envDir: "../../",
  server: {
    port: 5173,
    strictPort: true
  }
});
