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
      .split(" – ")
      .map((token) => dayMap[token] ?? token)
      .join(" – "),
    hours: hours === "Închis" ? CLOSED[locale] : hours,
  }));
}
