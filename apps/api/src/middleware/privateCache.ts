import type { RequestHandler } from "express";

/** Short private cache for semi-static authenticated reads (poll-friendly). */
export function privateCache(maxAgeSeconds: number): RequestHandler {
  return (_req, res, next) => {
    res.setHeader("Cache-Control", `private, max-age=${maxAgeSeconds}`);
    next();
  };
}
