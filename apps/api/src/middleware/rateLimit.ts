// Tiered rate limiting. Different endpoint classes have different risk
// profiles, so each gets its own bucket:
//
//   • authLimiter   — login + OAuth callbacks: aggressive cap, IP-keyed
//                     (defends against credential stuffing).
//   • aiLimiter     — every endpoint that calls an LLM: cost-protective cap,
//                     keyed by session user when available (defends against
//                     a single tester burning the AI budget; intentional
//                     abuse uncapped at network level is fine, the limit
//                     here is about per-account spend).
//   • steamLimiter  — Steam API proxies: prevents us from hammering Steam's
//                     own rate limit (Steam gives us 100k/day; this keeps
//                     us civil).
//   • defaultLimiter — everything else: generous cap, IP-keyed.
//
// Memory store is fine for single-process. When scaling to multiple
// instances behind a load balancer, swap for a Redis store or move the
// limiting to L7 (AWS WAF, Cloudflare).

import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

// Use session user id when available so two people behind the same NAT IP
// don't share a bucket. Falls back to IP for unauthenticated requests.
// Exported so route-local limiters reuse the IPv6-safe key (ipKeyGenerator)
// instead of hand-rolling `req.ip`, which express-rate-limit v8 rejects.
export function userOrIp(req: Request): string {
  const sessionUserId = (req as Request & { session?: { userId?: string } }).session?.userId;
  if (sessionUserId) return `u:${sessionUserId}`;
  return `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
}

export const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many auth attempts. Wait a minute." },
});

export const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  keyGenerator: userOrIp,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "AI rate limit reached. Wait a minute." },
});

export const steamLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  keyGenerator: userOrIp,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Steam endpoint rate limit. Wait a minute." },
});

export const defaultLimiter = rateLimit({
  windowMs: 60_000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Slow down." },
});
