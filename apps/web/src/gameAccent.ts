// gameAccent.ts — genre-based color tinting, countdown labels, and seat meters
// for the game-night planner. No React, no external imports.

// ---------------------------------------------------------------------------
// Genre accent colors
// ---------------------------------------------------------------------------

export type GameAccent = { accent: string; soft: string; label: string };

// Ordered priority list: first matching group wins.
// Keywords are matched as substrings against lowercased/trimmed tags.
const GENRE_RULES: Array<{ keywords: string[]; result: GameAccent }> = [
  { keywords: ["horror"],                          result: { label: "horror",     accent: "#a855f7", soft: "#d8b4fe" } },
  { keywords: ["rogueli"],                         result: { label: "roguelike",  accent: "#8b5cf6", soft: "#c4b5fd" } },
  { keywords: ["co-op", "coop", "co op"],          result: { label: "co-op",      accent: "#2dd4bf", soft: "#99f6e4" } },
  { keywords: ["fps", "shooter"],                  result: { label: "shooter",    accent: "#f59e0b", soft: "#fcd34d" } },
  { keywords: ["survival"],                        result: { label: "survival",   accent: "#84cc16", soft: "#bef264" } },
  { keywords: ["rpg"],                             result: { label: "RPG",        accent: "#818cf8", soft: "#c7d2fe" } },
  { keywords: ["strategy", "rts"],                 result: { label: "strategy",   accent: "#38bdf8", soft: "#bae6fd" } },
  { keywords: ["racing"],                          result: { label: "racing",     accent: "#fb923c", soft: "#fdba74" } },
  { keywords: ["sport"],                           result: { label: "sports",     accent: "#22c55e", soft: "#86efac" } },
  { keywords: ["puzzle"],                          result: { label: "puzzle",     accent: "#ec4899", soft: "#f9a8d4" } },
  { keywords: ["fighting"],                        result: { label: "fighting",   accent: "#ef4444", soft: "#fca5a5" } },
  { keywords: ["platformer", "platform"],          result: { label: "platformer", accent: "#22d3ee", soft: "#a5f3fc" } },
  { keywords: ["simulation", "sim "],              result: { label: "simulation", accent: "#eab308", soft: "#fde68a" } },
  { keywords: ["sandbox", "building"],             result: { label: "sandbox",    accent: "#06b6d4", soft: "#a5f3fc" } },
  { keywords: ["party"],                           result: { label: "party",      accent: "#d946ef", soft: "#f0abfc" } },
  { keywords: ["moba"],                            result: { label: "MOBA",       accent: "#0ea5e9", soft: "#bae6fd" } },
  { keywords: ["mmo"],                             result: { label: "MMO",        accent: "#6366f1", soft: "#c7d2fe" } },
];

const DEFAULT_ACCENT: GameAccent = { label: "game", accent: "#60a5fa", soft: "#bfdbfe" };

/** Return a vivid accent + readable soft color pair based on a game's genre tags. */
export function gameAccent(tags?: string[] | null): GameAccent {
  if (!tags || tags.length === 0) return DEFAULT_ACCENT;

  const normalized = tags.map((t) => t.toLowerCase().trim());

  for (const rule of GENRE_RULES) {
    for (const keyword of rule.keywords) {
      if (normalized.some((tag) => tag.includes(keyword))) {
        return rule.result;
      }
    }
  }

  return DEFAULT_ACCENT;
}

// ---------------------------------------------------------------------------
// Countdown labels
// ---------------------------------------------------------------------------

export type CountdownTone = "far" | "soon" | "imminent" | "live" | "past";

const MS_HOUR = 3_600_000;
const MS_DAY  = 86_400_000;
const MS_WEEK = 7 * MS_DAY;

/** Human-readable countdown and urgency tone for a game-night start time. */
export function countdownLabel(iso: string): { text: string; tone: CountdownTone } {
  const target = new Date(iso);
  if (isNaN(target.getTime())) return { text: "Time TBD", tone: "far" };

  const diffMs = target.getTime() - Date.now();

  if (diffMs <= 0) {
    // Within 3 hours after start → still considered live
    if (diffMs > -3 * MS_HOUR) return { text: "Live now", tone: "live" };
    return { text: "Ended", tone: "past" };
  }

  if (diffMs <= 2 * MS_HOUR) {
    // Imminent: show minutes, or hours+minutes for the ≥60-min edge case
    const totalMinutes = Math.round(diffMs / 60_000);
    if (totalMinutes < 60) {
      return { text: `in ${Math.max(1, totalMinutes)}m`, tone: "imminent" };
    }
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return { text: m > 0 ? `in ${h}h ${m}m` : `in ${h}h`, tone: "imminent" };
  }

  if (diffMs <= MS_DAY) {
    const h = Math.round(diffMs / MS_HOUR);
    return { text: `in ${h}h`, tone: "soon" };
  }

  if (diffMs <= MS_WEEK) {
    const d = Math.round(diffMs / MS_DAY);
    return { text: `in ${d}d`, tone: "soon" };
  }

  const w = Math.max(1, Math.round(diffMs / MS_WEEK));
  return { text: `in ${w}w`, tone: "far" };
}

// ---------------------------------------------------------------------------
// Seat pip meter
// ---------------------------------------------------------------------------

/** Clamp a number between lo and hi (inclusive). */
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Break a seat count into filled/total/overflow values for a pip meter.
 * Returns null when max is unknown or zero (no meter to show).
 */
export function seatPips(
  count: number,
  max?: number | null,
): { filled: number; total: number; overflow: number } | null {
  if (!max || max <= 0) return null;

  const total    = clamp(Math.round(max),   1, 8);
  const filled   = clamp(Math.round(count), 0, total);
  const overflow = Math.max(0, Math.round(count) - total);

  return { filled, total, overflow };
}
