// Deep-linking a restaurant's booking sheet from a listing time-slot.
//
// Listing cards only know a time (their slots are "available today", no date),
// so tapping a slot builds `/{city}/{slug}?date=<today>&time=<slot>` and the
// [slug] page reads those params (see `parseBookingPreselect`) to open the
// ReservationSheetV2 with the slot preselected. Kept framework-agnostic so it's
// importable from both client components (href building) and the server page
// (searchParams parsing).

/** Client-local "today" as an ISO `yyyy-mm-dd` string (card slots are today's). */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Append the booking deep-link query to a restaurant path. `date` defaults to
 * today because listing slots are always "available today". The result is a
 * plain path+query string, safe to pass through `localizedHref`.
 */
export function bookingSlotHref(
  path: string,
  slot: string,
  date: string = todayIso(),
): string {
  const q = new URLSearchParams({ date, time: slot });
  return `${path}?${q.toString()}`;
}

export interface BookingPreselect {
  /** ISO `yyyy-mm-dd`; omitted if absent/malformed. */
  date?: string;
  /** `HH:MM` 24h. Required — its presence is what activates preselection. */
  time: string;
  /** 1–20; omitted if absent/out of range (sheet falls back to its default). */
  party?: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Parse booking-preselect params off a page's `searchParams`. Returns undefined
 * unless a well-formed `time` is present — garbage/partial params never open the
 * sheet. Defensive against Next passing string | string[] | undefined.
 */
export function parseBookingPreselect(
  sp: Record<string, string | string[] | undefined>,
): BookingPreselect | undefined {
  const pick = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const time = pick(sp.time);
  if (!time || !TIME_RE.test(time)) return undefined;

  const dateRaw = pick(sp.date);
  const date = dateRaw && DATE_RE.test(dateRaw) ? dateRaw : undefined;

  const partyRaw = pick(sp.party);
  const partyNum = partyRaw ? Number.parseInt(partyRaw, 10) : NaN;
  const party =
    Number.isInteger(partyNum) && partyNum >= 1 && partyNum <= 20
      ? partyNum
      : undefined;

  return { date, time, party };
}
