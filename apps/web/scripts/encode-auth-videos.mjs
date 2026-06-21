// Encode login cinematic videos for web delivery.
//
// Drop raw exports in apps/web/media-source/auth/:
//   login-intro.mp4   — looping backdrop behind the login card
//   login-return.mp4  — ~1s post-login transition sting
//
// Outputs to apps/web/public/auth/ (served at /auth/*):
//   login-intro.webm, login-intro.mp4
//   login-return.webm, login-return.mp4
//
// Requires ffmpeg on PATH. Re-runnable.
//
// Usage (from repo root):
//   npm run encode:auth-videos -w @island/web

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = join(ROOT, "media-source", "auth");
const OUT_DIR = join(ROOT, "public", "auth");

const CLIPS = [
  {
    name: "login-intro",
    maxW: 1920,
    maxH: 1080,
    webmCrf: 34,
    mp4Crf: 28,
  },
  {
    name: "login-return",
    maxW: 1280,
    maxH: 720,
    webmCrf: 36,
    mp4Crf: 28,
  },
];

function findSource(name) {
  for (const ext of [".mp4", ".mov", ".mkv", ".webm"]) {
    const path = join(SOURCE_DIR, `${name}${ext}`);
    if (existsSync(path)) return path;
  }
  return null;
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) {
    console.error(`Failed to run ${cmd}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function scaleFilter(maxW, maxH) {
  return `scale=${maxW}:${maxH}:force_original_aspect_ratio=decrease,pad=${maxW}:${maxH}:(ow-iw)/2:(oh-ih)/2,fps=30`;
}

function encodeWebm(input, output, maxW, maxH, crf) {
  run("ffmpeg", [
    "-y",
    "-i",
    input,
    "-an",
    "-vf",
    scaleFilter(maxW, maxH),
    "-c:v",
    "libvpx-vp9",
    "-crf",
    String(crf),
    "-b:v",
    "0",
    "-row-mt",
    "1",
    "-pix_fmt",
    "yuv420p",
    output,
  ]);
}

function encodeMp4(input, output, maxW, maxH, crf) {
  run("ffmpeg", [
    "-y",
    "-i",
    input,
    "-an",
    "-vf",
    scaleFilter(maxW, maxH),
    "-c:v",
    "libx264",
    "-crf",
    String(crf),
    "-preset",
    "slow",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    output,
  ]);
}

function main() {
  const ffmpegCheck = spawnSync("ffmpeg", ["-version"], { stdio: "ignore", shell: process.platform === "win32" });
  if (ffmpegCheck.error || ffmpegCheck.status !== 0) {
    console.error("ffmpeg not found on PATH. Install ffmpeg and retry.");
    process.exit(1);
  }

  mkdirSync(SOURCE_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  let encoded = 0;

  for (const clip of CLIPS) {
    const input = findSource(clip.name);
    if (!input) {
      console.warn(`Skip ${clip.name}: no source in ${SOURCE_DIR} (expected ${clip.name}.mp4 or .mov)`);
      continue;
    }

    console.log(`\n── ${clip.name} ──`);
    console.log(`  source: ${input}`);

    const webmOut = join(OUT_DIR, `${clip.name}.webm`);
    const mp4Out = join(OUT_DIR, `${clip.name}.mp4`);

    encodeWebm(input, webmOut, clip.maxW, clip.maxH, clip.webmCrf);
    encodeMp4(input, mp4Out, clip.maxW, clip.maxH, clip.mp4Crf);
    encoded += 1;
  }

  if (encoded === 0) {
    console.error(`\nNo sources encoded. Drop files in:\n  ${SOURCE_DIR}`);
    process.exit(1);
  }

  console.log(`\nDone — ${encoded} clip(s) → ${OUT_DIR}`);
}

main();
