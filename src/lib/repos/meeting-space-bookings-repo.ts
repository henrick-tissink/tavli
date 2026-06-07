import { dbAdmin } from "@/lib/db/admin";
import { meetingSpaceBookings, meetingSpaces } from "@/lib/db/schema";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  canTransitionMeetingBooking,
  type MeetingBookingStatus,
} from "@/lib/meeting-spaces/status";

type Booking = typeof meetingSpaceBookings.$inferSelect;

/** Statuses that hold the slot — must match the 0066 guard trigger. */
export const ACTIVE_BOOKING_STATUSES = ["requested", "confirmed"] as const;

export interface CreateMeetingBookingInput {
  meetingSpaceId: string;
  restaurantId: string;
  bookingDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  partySize: number;
  guestName: string;
  guestEmail: string;
  guestPhone?: string | null;
  company?: string | null;
  notes?: string | null;
  totalCents: number;
}

/** Inserts as 'requested'. The 0066 trigger may throw TV004/TV005 — callers map those. */
export async function createMeetingBooking(input: CreateMeetingBookingInput): Promise<Booking> {
  const [row] = await dbAdmin
    .insert(meetingSpaceBookings)
    .values({
      meetingSpaceId: input.meetingSpaceId,
      restaurantId: input.restaurantId,
      bookingDate: input.bookingDate,
      startTime: input.startTime,
      endTime: input.endTime,
      partySize: input.partySize,
      guestName: input.guestName,
      guestEmail: input.guestEmail,
      guestPhone: input.guestPhone ?? null,
      company: input.company ?? null,
      notes: input.notes ?? null,
      totalCents: input.totalCents,
    })
    .returning();
  return row;
}

export interface PartnerBookingRow {
  id: string;
  meetingSpaceId: string;
  spaceName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  partySize: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  company: string | null;
  notes: string | null;
  status: MeetingBookingStatus;
  totalCents: number;
  createdAt: Date;
}

export async function listBookingsForRestaurant(
  restaurantId: string,
  statuses: MeetingBookingStatus[],
): Promise<PartnerBookingRow[]> {
  const where =
    statuses.length > 0
      ? and(
          eq(meetingSpaceBookings.restaurantId, restaurantId),
          inArray(meetingSpaceBookings.status, statuses),
        )
      : eq(meetingSpaceBookings.restaurantId, restaurantId);
  return dbAdmin
    .select({
      id: meetingSpaceBookings.id,
      meetingSpaceId: meetingSpaceBookings.meetingSpaceId,
      spaceName: meetingSpaces.name,
      bookingDate: meetingSpaceBookings.bookingDate,
      startTime: meetingSpaceBookings.startTime,
      endTime: meetingSpaceBookings.endTime,
      partySize: meetingSpaceBookings.partySize,
      guestName: meetingSpaceBookings.guestName,
      guestEmail: meetingSpaceBookings.guestEmail,
      guestPhone: meetingSpaceBookings.guestPhone,
      company: meetingSpaceBookings.company,
      notes: meetingSpaceBookings.notes,
      status: meetingSpaceBookings.status,
      totalCents: meetingSpaceBookings.totalCents,
      createdAt: meetingSpaceBookings.createdAt,
    })
    .from(meetingSpaceBookings)
    .innerJoin(meetingSpaces, eq(meetingSpaceBookings.meetingSpaceId, meetingSpaces.id))
    .where(where)
    .orderBy(asc(meetingSpaceBookings.bookingDate), asc(meetingSpaceBookings.startTime), desc(meetingSpaceBookings.createdAt));
}

/**
 * Guarded transition with optimistic concurrency: the UPDATE only matches if
 * the row still has the status we validated against, so two parallel partner
 * clicks can't both win.
 */
export async function transitionMeetingBooking(
  id: string,
  to: MeetingBookingStatus,
): Promise<Booking> {
  const [row] = await dbAdmin
    .select()
    .from(meetingSpaceBookings)
    .where(eq(meetingSpaceBookings.id, id))
    .limit(1);
  if (!row) throw new Error("not found");
  const from = row.status as MeetingBookingStatus;
  if (!canTransitionMeetingBooking(from, to)) {
    throw new Error(`invalid transition ${from} -> ${to}`);
  }
  const [updated] = await dbAdmin
    .update(meetingSpaceBookings)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(meetingSpaceBookings.id, id), eq(meetingSpaceBookings.status, from)))
    .returning();
  if (!updated) throw new Error(`invalid transition: booking changed concurrently`);
  return updated;
}

export interface BusyRow {
  meetingSpaceId: string;
  startTime: string;
  endTime: string;
}

/** Active (slot-holding) intervals for every space of a venue on a date. */
export async function busyIntervalsForDate(
  restaurantId: string,
  date: string,
): Promise<BusyRow[]> {
  return dbAdmin
    .select({
      meetingSpaceId: meetingSpaceBookings.meetingSpaceId,
      startTime: meetingSpaceBookings.startTime,
      endTime: meetingSpaceBookings.endTime,
    })
    .from(meetingSpaceBookings)
    .where(
      and(
        eq(meetingSpaceBookings.restaurantId, restaurantId),
        eq(meetingSpaceBookings.bookingDate, date),
        inArray(meetingSpaceBookings.status, [...ACTIVE_BOOKING_STATUSES]),
      ),
    );
}
