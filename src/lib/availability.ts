/**
 * Slot-time generation and hours→availability projection.
 *
 * `computeSlots` turns availability windows into a flat list of bookable
 * "HH:MM" times every `intervalMin` minutes, deduped and sorted.
 *
 * `hoursToAvailabilityRows` projects the partner-edited DayHours[] (one
 * entry per weekday with isOpen + openAt + closeAt) into the row shape
 * the `restaurant_availability` table accepts. Closed days are skipped.
 *
 * Pure functions — no DB, no clock, no timezone awareness.
 */

import type { DayHours } from "@/lib/onboarding";

export interface AvailabilityWindow {
  slotStart: string; // "HH:MM" or "HH:MM:SS"
  slotEnd: string;
}

export interface AvailabilityRowInsert {
  restaurant_id: string;
  day_of_week: number; // 0=Sun..6=Sat
  slot_start: string; // "HH:MM"
  slot_end: string;
  capacity: number;
}

const DEFAULT_CAPACITY = 30;

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

/**
 * Project the partner-edited weekly hours into rows ready for insertion
 * into `restaurant_availability`. Closed days are skipped. One row per
 * open day at the supplied default capacity (30 unless overridden).
 *
 * Re-saving hours is intended to overwrite the day's availability rows;
 * partners who want fine-grained per-slot capacity should use
 * `/partner/availability` instead — that flow can re-introduce custom
 * rows after a hours-save.
 */
export function hoursToAvailabilityRows(
  restaurantId: string,
  hours: DayHours[],
  defaultCapacity: number = DEFAULT_CAPACITY,
): AvailabilityRowInsert[] {
  return hours
    .filter((h) => h.isOpen)
    .map((h) => ({
      restaurant_id: restaurantId,
      day_of_week: h.dayOfWeek,
      slot_start: h.openAt,
      slot_end: h.closeAt,
      capacity: defaultCapacity,
    }));
}
