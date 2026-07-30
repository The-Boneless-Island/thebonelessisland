// dailyReset.ts — client-side math for the daily Nuggies claim reset.
//
// The reset boundary is midnight in America/Halifax (= 11pm ET year-round).
// Everything here derives from the device clock via Intl, so each call is a
// fresh read — values are never carried forward from an earlier tick. That
// matters for slept/frozen tabs (Edge sleeping tabs, mobile background):
// timers stop firing while frozen, so any state derived from "the last tick"
// is untrustworthy after a wake. Callers should compare resetDayKey() across
// ticks to detect that a reset happened while the tab was asleep — waiting to
// observe a zero countdown never works, because the countdown jumps from
// ~1000ms straight to ~86,400,000ms across the boundary and a frozen tab
// skips the window entirely.

const RESET_TZ = "America/Halifax";

function resetTzParts(): Record<string, string> {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: RESET_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date())) map[p.type] = p.value;
  return map;
}

/** Milliseconds until the next daily reset, from the device clock. */
export function msUntilNextDailyReset(): number {
  const map = resetTzParts();
  const h = Number(map.hour) || 0;
  const m = Number(map.minute) || 0;
  const s = Number(map.second) || 0;
  const msOfDay = h * 3_600_000 + m * 60_000 + s * 1000;
  return Math.max(0, 86_400_000 - msOfDay);
}

/**
 * Identity of the current claim window ("YYYY-MM-DD" in the reset timezone).
 * If this differs from the key captured when claim state was last known, a
 * reset boundary has passed and any claimedToday=true is stale.
 */
export function resetDayKey(): string {
  const map = resetTzParts();
  return `${map.year}-${map.month}-${map.day}`;
}

/** HH:MM:SS countdown string. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
