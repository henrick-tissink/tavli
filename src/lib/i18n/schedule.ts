/**
 * Render-time localization for `restaurants.schedule` display strings.
 *
 * The schedule JSONB is written by `hoursToSchedule` (src/lib/onboarding.ts)
 * with a closed Romanian vocabulary: full day names joined with " – ", and
 * "Închis" for closed days. EN/DE pages translate token-by-token; anything
 * outside the vocabulary (e.g. already-English mock data) passes through.
 */

import type { Locale } from "./locale";

interface ScheduleEntry {
  days: string;
  hours: string;
}

// ── canonical writer vocabulary ─────────────────────────────────────────
// Shared with hoursToSchedule (src/lib/onboarding.ts), the writer of
// restaurants.schedule. Keeping writer and translator on one constant set
// means new vocabulary cannot ship untranslatable.
/** RO day names indexed by dayOfWeek (0=Sun..6=Sat). */
export const RO_SCHEDULE_DAY_NAMES = [
  "Duminică",
  "Luni",
  "Marți",
  "Miercuri",
  "Joi",
  "Vineri",
  "Sâmbătă",
] as const;
/** Joins day ranges, e.g. "Luni – Vineri". */
export const RO_SCHEDULE_RANGE_SEPARATOR = " – ";
/** Hours value for closed days. */
export const RO_SCHEDULE_CLOSED = "Închis";

const DAY_NAMES: Record<Exclude<Locale, "ro">, Record<string, string>> = {
  en: {
    Luni: "Monday",
    Marți: "Tuesday",
    Miercuri: "Wednesday",
    Joi: "Thursday",
    Vineri: "Friday",
    Sâmbătă: "Saturday",
    Duminică: "Sunday",
  },
  de: {
    Luni: "Montag",
    Marți: "Dienstag",
    Miercuri: "Mittwoch",
    Joi: "Donnerstag",
    Vineri: "Freitag",
    Sâmbătă: "Samstag",
    Duminică: "Sonntag",
  },
};

const CLOSED: Record<Exclude<Locale, "ro">, string> = {
  en: "Closed",
  de: "Geschlossen",
};

export function localizeSchedule(
  schedule: ScheduleEntry[],
  locale: Locale,
): ScheduleEntry[] {
  if (locale === "ro") return schedule;
  const dayMap = DAY_NAMES[locale];
  return schedule.map(({ days, hours }) => ({
    days: days
      .split(RO_SCHEDULE_RANGE_SEPARATOR)
      .map((token) => dayMap[token] ?? token)
      .join(RO_SCHEDULE_RANGE_SEPARATOR),
    hours: hours === RO_SCHEDULE_CLOSED ? CLOSED[locale] : hours,
  }));
}
