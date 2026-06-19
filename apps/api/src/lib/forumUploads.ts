// Forum image upload pipeline.
//
// SECURITY: every accepted image is re-encoded by sharp to WebP before it
// touches disk. Re-encoding (a) strips EXIF/GPS and other metadata, and
// (b) neutralizes MIME/extension spoofing — a file is only written if sharp
// can actually decode it as one of the accepted formats. The stored filename
// is a server-generated UUID; the client filename never reaches the filesystem.

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db } from "../db/client.js";

// Uploads live on a local volume (single-box deploy). Overridable for tests/prod.
export const FORUM_UPLOAD_DIR = path.resolve(
  process.env.FORUMS_UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads")
);

const MAX_EDGE = 2048;
const THUMB_EDGE = 480;

export type ProcessedImage = {
  filePath: string; // relative to FORUM_UPLOAD_DIR, e.g. forums/2026/06/<uuid>.webp
  thumbPath: string;
  width: number;
  height: number;
  bytes: number;
};

/** Sniff the real image type by magic bytes (never trust the extension). */
export function sniffImageType(buf: Buffer): "jpeg" | "png" | "gif" | "webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "gif";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && // RIFF
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50 // WEBP
  ) return "webp";
  return null;
}

/**
 * Validate, re-encode, and persist an uploaded image. Returns the stored paths
 * and dimensions. Throws if the buffer is not a decodable accepted image.
 */
export async function processForumImage(buf: Buffer): Promise<ProcessedImage> {
  const type = sniffImageType(buf);
  if (!type) throw new Error("unsupported image type");

  // Animated source (gif/webp) → keep frames in the full-size render.
  const animated = type === "gif" || type === "webp";

  const main = await sharp(buf, { animated })
    .rotate() // honor EXIF orientation, then drop metadata on output
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  // Thumbnail is always a static first frame — small and cheap.
  const thumb = await sharp(buf)
    .rotate()
    .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const id = randomUUID();
  const relDir = path.join("forums", yyyy, mm);
  const filePath = path.join(relDir, `${id}.webp`);
  const thumbPath = path.join(relDir, `${id}_thumb.webp`);

  const absDir = path.join(FORUM_UPLOAD_DIR, relDir);
  await fs.mkdir(absDir, { recursive: true });
  await fs.writeFile(path.join(FORUM_UPLOAD_DIR, filePath), main.data);
  await fs.writeFile(path.join(FORUM_UPLOAD_DIR, thumbPath), thumb);

  // Store POSIX-style relative paths so URLs are stable across platforms.
  return {
    filePath: filePath.split(path.sep).join("/"),
    thumbPath: thumbPath.split(path.sep).join("/"),
    width: main.info.width,
    height: main.info.height,
    bytes: main.data.length
  };
}

/**
 * Delete uploads that were never attached to a post (the user uploaded an image
 * in the composer, then navigated away without submitting). Removes the DB row
 * and both files. Returns the number swept.
 */
export async function sweepOrphanUploads(): Promise<number> {
  const r = await db.query<{ file_path: string; thumb_path: string }>(
    `DELETE FROM forum_uploads
     WHERE post_id IS NULL AND created_at < NOW() - INTERVAL '24 hours'
     RETURNING file_path, thumb_path`
  );
  for (const row of r.rows) {
    await fs.rm(path.join(FORUM_UPLOAD_DIR, row.file_path), { force: true }).catch(() => undefined);
    await fs.rm(path.join(FORUM_UPLOAD_DIR, row.thumb_path), { force: true }).catch(() => undefined);
  }
  return r.rows.length;
}
