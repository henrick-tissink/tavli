/**
 * @jest-environment node
 *
 * INTEGRATION TEST — writes to the database via the service role with no
 * cleanup. NEVER run with `.env.local` (prod). Run with the local env:
 *
 *   set -a && source .env.local.bak && set +a && \
 *     npx jest -t "meeting-space booking public actions"
 */
import { dbAdmin, createSupabaseAdminClient } from "@/lib/db/admin";
import { cities, organizations, restaurants, meetingSpaceBookings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createMeetingSpace } from "@/lib/repos/meeting-spaces-repo";
import { createMeetingBooking, transitionMeetingBooking } from "@/lib/repos/meeting-space-bookings-repo";
import { submitMeetingBookingRequest, getMeetingSpaceBusyIntervals } from "../actions";

async function seedVenueWithSpace(overrides?: { acceptsMeetingSpaces?: boolean }) {
  const admin = createSupabaseAdminClient();
  void admin; // auth user not needed for the public action; keep parity with sibling tests
  await dbAdmin
    .insert(cities)
    .values({ slug: "msb", name: "M", countryCode: "RO" })
    .onConflictDoNothing();
  const [c] = await dbAdmin.select().from(cities).limit(1);
  const orgId = crypto.randomUUID();
  await dbAdmin.insert(organizations).values({
    id: orgId,
    name: "MSB Org",
    primaryContactEmail: `org-${orgId}@msb.test`,
  });
  const [r] = await dbAdmin
    .insert(restaurants)
    .values({
      slug: `msb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: "MSB Venue",
      cityId: c.id,
      status: "live",
      organizationId: orgId,
      acceptsMeetingSpaces: overrides?.acceptsMeetingSpaces ?? true,
    })
    .returning();
  const space = await createMeetingSpace({
    restaurantId: r.id,
    name: "Test Room",
    capacity: 8,
    hourlyRateCents: 10000,
    openTime: "09:00",
    closeTime: "18:00",
    minBookingMinutes: 60,
  });
  return { restaurantId: r.id, spaceId: space.id };
}

const GUEST = {
  partySize: 4,
  guestName: "ZZ_VERIFY Jest",
  guestEmail: "zz-verify@example.com",
};

describe("meeting-space booking public actions", () => {
  it("creates a 'requested' booking with a pro-rata total", async () => {
    const { restaurantId, spaceId } = await seedVenueWithSpace();
    const res = await submitMeetingBookingRequest({
      restaurantId,
      meetingSpaceId: spaceId,
      bookingDate: "2031-03-03",
      startTime: "10:00",
      durationMinutes: 90,
      ...GUEST,
    });
    expect(res.ok).toBe(true);
    const [row] = await dbAdmin
      .select()
      .from(meetingSpaceBookings)
      .where(eq(meetingSpaceBookings.restaurantId, restaurantId));
    expect(row.status).toBe("requested");
    expect(row.totalCents).toBe(15000); // 1.5 h × 100 lei
    expect(row.endTime.startsWith("11:30")).toBe(true);
  });

  it("rejects overlap with slot_taken (trigger TV004) but allows back-to-back", async () => {
    const { restaurantId, spaceId } = await seedVenueWithSpace();
    const base = {
      restaurantId,
      meetingSpaceId: spaceId,
      bookingDate: "2031-03-04",
      durationMinutes: 60,
      ...GUEST,
    };
    expect((await submitMeetingBookingRequest({ ...base, startTime: "10:00" })).ok).toBe(true);
    const clash = await submitMeetingBookingRequest({ ...base, startTime: "10:30" });
    expect(clash).toEqual({ ok: false, error: "slot_taken" });
    expect((await submitMeetingBookingRequest({ ...base, startTime: "11:00" })).ok).toBe(true);
  });

  it("rejects bookings outside the space's hours (trigger TV005) as slot_taken", async () => {
    const { restaurantId, spaceId } = await seedVenueWithSpace();
    const res = await submitMeetingBookingRequest({
      restaurantId,
      meetingSpaceId: spaceId,
      bookingDate: "2031-03-05",
      startTime: "17:30", // 17:30 + 60min > 18:00 close
      durationMinutes: 60,
      ...GUEST,
    });
    expect(res).toEqual({ ok: false, error: "slot_taken" });
  });

  it("declining a request frees the slot", async () => {
    const { restaurantId, spaceId } = await seedVenueWithSpace();
    const base = {
      restaurantId,
      meetingSpaceId: spaceId,
      bookingDate: "2031-03-06",
      startTime: "10:00",
      durationMinutes: 60,
      ...GUEST,
    };
    const first = await submitMeetingBookingRequest(base);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");
    await transitionMeetingBooking(first.bookingId, "declined");
    expect((await submitMeetingBookingRequest(base)).ok).toBe(true);
  });

  it("refuses venues without the capability", async () => {
    const { restaurantId, spaceId } = await seedVenueWithSpace({ acceptsMeetingSpaces: false });
    const res = await submitMeetingBookingRequest({
      restaurantId,
      meetingSpaceId: spaceId,
      bookingDate: "2031-03-07",
      startTime: "10:00",
      durationMinutes: 60,
      ...GUEST,
    });
    expect(res).toEqual({ ok: false, error: "unavailable" });
  });

  it("rejects a party larger than the space capacity", async () => {
    const { restaurantId, spaceId } = await seedVenueWithSpace();
    const res = await submitMeetingBookingRequest({
      restaurantId,
      meetingSpaceId: spaceId,
      bookingDate: "2031-03-08",
      startTime: "10:00",
      durationMinutes: 60,
      ...GUEST,
      partySize: 9, // capacity is 8
    });
    expect(res).toEqual({ ok: false, error: "party_too_big" });
  });

  it("getMeetingSpaceBusyIntervals returns active intervals in minutes", async () => {
    const { restaurantId, spaceId } = await seedVenueWithSpace();
    await createMeetingBooking({
      meetingSpaceId: spaceId,
      restaurantId,
      bookingDate: "2031-03-09",
      startTime: "10:00",
      endTime: "11:30",
      totalCents: 15000,
      ...GUEST,
    });
    const res = await getMeetingSpaceBusyIntervals({ restaurantId, date: "2031-03-09" });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.busy).toEqual([
      { meetingSpaceId: spaceId, startMinute: 600, endMinute: 690 },
    ]);
  });

  it("rejects malformed input as invalid", async () => {
    const res = await submitMeetingBookingRequest({
      restaurantId: "not-a-uuid",
      meetingSpaceId: "nope",
      bookingDate: "tomorrow",
      startTime: "10am",
      durationMinutes: 60,
      ...GUEST,
    } as never);
    expect(res).toEqual({ ok: false, error: "invalid" });
  });
});
