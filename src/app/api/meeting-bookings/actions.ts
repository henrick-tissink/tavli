"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { meetingSpaces, restaurants } from "@/lib/db/schema";
import {
  busyIntervalsForDate,
  createMeetingBooking,
} from "@/lib/repos/meeting-space-bookings-repo";
import {
  computeTotalCents,
  minuteToTime,
  timeToMinute,
} from "@/lib/meeting-spaces/slots";
import { normalizePhone } from "@/lib/phone/normalize";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const busySchema = z.object({
  restaurantId: z.string().uuid(),
  date: z.string().regex(DATE_RE),
});

export type BusyIntervalsResult =
  | { ok: true; busy: Array<{ meetingSpaceId: string; startMinute: number; endMinute: number }> }
  | { ok: false };

/**
 * Public availability feed for the booking sheet: every slot-holding interval
 * (requested + confirmed) per space for the chosen date. Times only — no
 * guest data leaves the server.
 */
export async function getMeetingSpaceBusyIntervals(input: {
  restaurantId: string;
  date: string;
}): Promise<BusyIntervalsResult> {
  const parsed = busySchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const rows = await busyIntervalsForDate(parsed.data.restaurantId, parsed.data.date);
  return {
    ok: true,
    busy: rows.map((r) => ({
      meetingSpaceId: r.meetingSpaceId,
      startMinute: timeToMinute(r.startTime),
      endMinute: timeToMinute(r.endTime),
    })),
  };
}

const submitSchema = z.object({
  restaurantId: z.string().uuid(),
  meetingSpaceId: z.string().uuid(),
  bookingDate: z.string().regex(DATE_RE),
  startTime: z.string().regex(TIME_RE),
  durationMinutes: z.number().int().min(15).max(720),
  partySize: z.number().int().positive().max(500),
  guestName: z.string().min(1).max(120),
  guestEmail: z.string().email().max(255),
  guestPhone: z.string().max(32).optional(),
  company: z.string().max(160).optional(),
  notes: z.string().max(1000).optional(),
});

export type SubmitMeetingBookingInput = z.infer<typeof submitSchema>;

export type SubmitMeetingBookingResult =
  | { ok: true; bookingId: string }
  | { ok: false; error: "invalid" | "unavailable" | "party_too_big" | "slot_taken" };

/**
 * Entry point from the public meeting-space sheet. Request-to-book: inserts a
 * 'requested' row that already holds the slot (spec §3/§6); the partner
 * confirms or declines from the inbox. The 0066 guard trigger is the source
 * of truth for overlap/hours — TV004/TV005 map to `slot_taken` so the sheet
 * re-picks. Totals are recomputed server-side (pro-rata, spec §4).
 */
export async function submitMeetingBookingRequest(
  input: SubmitMeetingBookingInput,
): Promise<SubmitMeetingBookingResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const data = parsed.data;

  const [restaurant] = await dbAdmin
    .select({
      status: restaurants.status,
      acceptsMeetingSpaces: restaurants.acceptsMeetingSpaces,
    })
    .from(restaurants)
    .where(eq(restaurants.id, data.restaurantId))
    .limit(1);
  if (!restaurant || restaurant.status !== "live" || !restaurant.acceptsMeetingSpaces) {
    return { ok: false, error: "unavailable" };
  }

  const [space] = await dbAdmin
    .select()
    .from(meetingSpaces)
    .where(eq(meetingSpaces.id, data.meetingSpaceId))
    .limit(1);
  if (!space || space.restaurantId !== data.restaurantId || !space.isActive) {
    return { ok: false, error: "unavailable" };
  }
  if (data.partySize > space.capacity) {
    return { ok: false, error: "party_too_big" };
  }

  // Optional phone → E.164, mirroring submitEventRequestDraft.
  let guestPhoneE164: string | undefined;
  if (data.guestPhone !== undefined) {
    const phoneResult = normalizePhone(data.guestPhone);
    if (phoneResult.ok) guestPhoneE164 = phoneResult.e164;
    else if (phoneResult.reason === "invalid") return { ok: false, error: "invalid" };
  }

  const startMinute = timeToMinute(data.startTime);
  const endMinute = startMinute + data.durationMinutes;
  if (endMinute > 24 * 60) return { ok: false, error: "invalid" };

  try {
    const booking = await createMeetingBooking({
      meetingSpaceId: data.meetingSpaceId,
      restaurantId: data.restaurantId,
      bookingDate: data.bookingDate,
      startTime: data.startTime,
      endTime: minuteToTime(endMinute),
      partySize: data.partySize,
      guestName: data.guestName,
      guestEmail: data.guestEmail,
      guestPhone: guestPhoneE164,
      company: data.company,
      notes: data.notes,
      totalCents: computeTotalCents(data.durationMinutes, space.hourlyRateCents),
    });
    return { ok: true, bookingId: booking.id };
  } catch (e) {
    // Postgres custom errcodes from the 0066 guard (cf. booking-commit.ts).
    const code =
      (e as { code?: string })?.code ??
      ((e as { cause?: { code?: string } })?.cause?.code);
    if (code === "TV004" || code === "TV005") {
      return { ok: false, error: "slot_taken" };
    }
    throw e;
  }
}
