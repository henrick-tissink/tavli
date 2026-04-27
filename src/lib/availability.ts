/**
 * Slot-time generation from `restaurant_availability` rows.
 *
 * Each availability row is a per-day window with a start and end time.
 * `computeSlots` turns those windows into a flat list of bookable
 * "HH:MM" times every `intervalMin` minutes, deduped and sorted.
 *
 * Pure function — no DB, no clock, no timezone awareness. The caller
 * decides which day-of-week to pull rows for and what timezone to
 * resolve "today" in.
 */

export interface AvailabilityWindow {
  slotStart: string; // "HH:MM" or "HH:MM:SS"
  slotEnd: string;
}

const DEFAULT_INTERVAL_MIN = 30;

export function computeSlots(
  windows: AvailabilityWindow[],
  intervalMin: number = DEFAULT_INTERVAL_MIN,
): string[] {
  const minuteSet = new Set<number>();
  for (const w of windows) {
    const start = parseTime(w.slotStart);
    const end = parseTime(w.slotEnd);
    if (end <= start) continue; // skip degenerate / wraparound rows silently
    for (let t = start; t < end; t += intervalMin) {
      minuteSet.add(t);
    }
  }
  return Array.from(minuteSet)
    .sort((a, b) => a - b)
    .map(formatTime);
}

function parseTime(t: string): number {
  const [hh, mm] = t.split(":");
  return Number(hh) * 60 + Number(mm);
}

function formatTime(min: number): string {
  const hh = Math.floor(min / 60).toString().padStart(2, "0");
  const mm = (min % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}
