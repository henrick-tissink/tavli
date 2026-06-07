// Pure slot/duration/price math for meeting spaces. Isomorphic: imported by
// the public sheet (client) and the submit action (server). Times are minutes
// since midnight; intervals are half-open [start, end), so back-to-back
// bookings never collide — mirroring the DB guard trigger (0066).

export const SLOT_STEP_MINUTES = 30;

export interface BusyInterval {
  startMinute: number;
  endMinute: number;
}

/** "09:30" or "09:30:00" (postgres `time`) → minutes since midnight. */
export function timeToMinute(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Minutes since midnight → zero-padded "HH:MM". */
export function minuteToTime(minute: number): string {
  const h = String(Math.floor(minute / 60)).padStart(2, "0");
  const m = String(minute % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/** Bookable durations: minBookingMinutes up to the whole window, 30-min steps. */
export function durationOptions(opts: {
  openMinute: number;
  closeMinute: number;
  minBookingMinutes: number;
}): number[] {
  const out: number[] = [];
  const max = opts.closeMinute - opts.openMinute;
  for (let d = opts.minBookingMinutes; d <= max; d += SLOT_STEP_MINUTES) out.push(d);
  return out;
}

/**
 * Start minutes (30-min grid from opening) where [start, start+duration) fits
 * inside [open, close) and overlaps no busy interval.
 */
export function computeStartSlots(opts: {
  openMinute: number;
  closeMinute: number;
  durationMinutes: number;
  busy: BusyInterval[];
}): number[] {
  const out: number[] = [];
  for (let s = opts.openMinute; s + opts.durationMinutes <= opts.closeMinute; s += SLOT_STEP_MINUTES) {
    const e = s + opts.durationMinutes;
    const clash = opts.busy.some((b) => b.startMinute < e && s < b.endMinute);
    if (!clash) out.push(s);
  }
  return out;
}

/** Pro-rata total: round(minutes × rate/h ÷ 60). Spec §4. */
export function computeTotalCents(durationMinutes: number, hourlyRateCents: number): number {
  return Math.round((durationMinutes * hourlyRateCents) / 60);
}
