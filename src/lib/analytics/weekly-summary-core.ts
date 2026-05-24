/**
 * §07 §9 — pure cores for the weekly-summary digest. Kept separate from the job
 * so the date math + audience selection are unit-testable without a DB.
 */
import type { Locale } from "@/emails/WeeklySummaryEmail";

export interface WeekBounds {
  start: string; // YYYY-MM-DD (Monday, venue-local)
  end: string; // YYYY-MM-DD (Sunday, venue-local)
}

/**
 * The most-recently-completed Monday→Sunday week in the venue's timezone. When
 * the job runs Sunday night, that Sunday is the week end.
 */
export function weekBounds(now: Date, timezone: string): WeekBounds {
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const y = Number(local.find((p) => p.type === "year")!.value);
  const m = Number(local.find((p) => p.type === "month")!.value);
  const d = Number(local.find((p) => p.type === "day")!.value);

  const localMidnight = new Date(Date.UTC(y, m - 1, d));
  const dow = localMidnight.getUTCDay(); // 0 = Sunday
  const end = new Date(localMidnight);
  end.setUTCDate(end.getUTCDate() - dow); // most recent Sunday on/before
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6); // its Monday

  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export interface WeekTotals {
  bookings: number;
  covers: number;
}

export interface WeekDeltas {
  bookingsDelta: number;
  coversDelta: number;
}

export function computeWeekOverWeekDeltas(thisWeek: WeekTotals, lastWeek: WeekTotals | null): WeekDeltas {
  const prev = lastWeek ?? { bookings: 0, covers: 0 };
  return {
    bookingsDelta: thisWeek.bookings - prev.bookings,
    coversDelta: thisWeek.covers - prev.covers,
  };
}

export interface MemberRow {
  role: string;
  isActive: boolean;
  email: string | null;
  locale: string | null;
}

export interface Recipient {
  email: string;
  locale: Locale;
}

const DIGEST_ROLES = new Set(["owner", "admin", "manager"]);

function asLocale(value: string | null | undefined): Locale {
  if (value === "en" || value === "de" || value === "ro") return value;
  if (value?.startsWith("en")) return "en";
  if (value?.startsWith("de")) return "de";
  return "ro";
}

/** Active owner/admin/manager members with a deliverable email (§9.3). */
export function resolveWeeklyAudience(members: MemberRow[]): Recipient[] {
  return members
    .filter((m) => m.isActive && DIGEST_ROLES.has(m.role) && !!m.email)
    .map((m) => ({ email: m.email as string, locale: asLocale(m.locale) }));
}
