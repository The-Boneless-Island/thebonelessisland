// In-memory server-sent-events bus. Holds the set of currently connected
// /events response streams and fans broadcasts out to all of them.
//
// This app runs as a single instance (one box), so a module-scope Set is
// sufficient — no Redis / cross-process pub-sub needed. SSE here is additive
// immediacy on top of the existing polling fallback; correctness never depends
// on a broadcast landing, so per-socket write failures are swallowed.
//
// Event names used by this app: "members-changed" and "nights-changed".

import type { Response } from "express";

const subscribers = new Set<Response>();

/** Register an open /events response stream to receive broadcasts. */
export function addSubscriber(res: Response): void {
  subscribers.add(res);
}

/** Remove a response stream (on client disconnect / close). */
export function removeSubscriber(res: Response): void {
  subscribers.delete(res);
}

/**
 * Write a single SSE frame to every subscriber. `data` is JSON-encoded; when
 * omitted, an empty data line is sent. Per-socket write errors drop that
 * subscriber rather than throwing — a dead socket must not break the others.
 */
export function broadcast(event: string, data?: unknown): void {
  const payload = data === undefined ? "" : JSON.stringify(data);
  const frame = `event: ${event}\ndata: ${payload}\n\n`;
  for (const res of subscribers) {
    try {
      res.write(frame);
    } catch {
      subscribers.delete(res);
    }
  }
}
