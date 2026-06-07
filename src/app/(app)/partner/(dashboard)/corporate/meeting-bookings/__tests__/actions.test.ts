/**
 * @jest-environment node
 *
 * INTEGRATION TEST — local DB only:
 *   set -a && source .env.local.bak && set +a && \
 *     npx jest -t "meeting-bookings partner actions"
 */
import { dbAdmin, createSupabaseAdminClient } from "@/lib/db/admin";
import { cities, organizations, organizationMembers, restaurantStaff, profiles, restaurants, meetingSpaceBookings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
jest.mock("@/lib/auth/session", () => ({ getCurrentSession: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/i18n/app-locale", () => ({ resolveAppLocale: jest.fn().mockResolvedValue("en") }));
import { transitionMeetingBookingAction } from "../actions";
import { createMeetingSpace } from "@/lib/repos/meeting-spaces-repo";
import { createMeetingBooking } from "@/lib/repos/meeting-space-bookings-repo";
import { getCurrentSession } from "@/lib/auth/session";
const mockSession = getCurrentSession as jest.MockedFunction<typeof getCurrentSession>;

beforeEach(() => {
  mockSession.mockReset();
});

async function seedOwnerWithVenue() {
  const admin = createSupabaseAdminClient();
  const email = `owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@mb.test`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true, password: "x" });
  await dbAdmin
    .update(profiles)
    .set({ role: "restaurant_owner" })
    .where(eq(profiles.id, data!.user!.id));
  await dbAdmin
    .insert(cities)
    .values({ slug: "mb", name: "M", countryCode: "RO" })
    .onConflictDoNothing();
  const [c] = await dbAdmin.select().from(cities).limit(1);
  const orgId = crypto.randomUUID();
  await dbAdmin.insert(organizations).values({
    id: orgId,
    name: "MB Org",
    primaryContactEmail: `org-${orgId}@mb.test`,
  });
  const [r] = await dbAdmin
    .insert(restaurants)
    .values({
      slug: `mb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: "MB",
      cityId: c.id,
      status: "live",
      organizationId: orgId,
    })
    .returning();
  await dbAdmin
    .insert(organizationMembers)
    .values({ organizationId: orgId, userId: data!.user!.id, role: "owner", isActive: true });
  await dbAdmin
    .insert(restaurantStaff)
    .values({ restaurantId: r.id, userId: data!.user!.id, role: "owner", isActive: true });
  mockSession.mockResolvedValue({
    userId: data!.user!.id,
    userEmail: email,
    profile: { id: data!.user!.id, role: "restaurant_owner", email },
  } as never);
  return { restaurantId: r.id };
}

async function seedBooking(restaurantId: string, date: string) {
  const space = await createMeetingSpace({
    restaurantId,
    name: "Room",
    capacity: 6,
    hourlyRateCents: 5000,
    openTime: "09:00",
    closeTime: "18:00",
    minBookingMinutes: 60,
  });
  return createMeetingBooking({
    meetingSpaceId: space.id,
    restaurantId,
    bookingDate: date,
    startTime: "10:00",
    endTime: "11:00",
    partySize: 4,
    guestName: "ZZ_VERIFY Jest",
    guestEmail: "zz-verify@example.com",
    totalCents: 5000,
  });
}

describe("meeting-bookings partner actions", () => {
  it("owner confirms a requested booking, then completes it", async () => {
    const { restaurantId } = await seedOwnerWithVenue();
    const booking = await seedBooking(restaurantId, "2031-04-01");

    expect(await transitionMeetingBookingAction({ id: booking.id, to: "confirmed" })).toEqual({ ok: true });
    let [row] = await dbAdmin
      .select()
      .from(meetingSpaceBookings)
      .where(eq(meetingSpaceBookings.id, booking.id));
    expect(row.status).toBe("confirmed");

    expect(await transitionMeetingBookingAction({ id: booking.id, to: "completed" })).toEqual({ ok: true });
    [row] = await dbAdmin
      .select()
      .from(meetingSpaceBookings)
      .where(eq(meetingSpaceBookings.id, booking.id));
    expect(row.status).toBe("completed");
  });

  it("rejects invalid transitions with a localized error", async () => {
    const { restaurantId } = await seedOwnerWithVenue();
    const booking = await seedBooking(restaurantId, "2031-04-02");
    const res = await transitionMeetingBookingAction({ id: booking.id, to: "completed" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/no longer available/i);
  });

  it("non-owner gets forbidden", async () => {
    const { restaurantId } = await seedOwnerWithVenue();
    const booking = await seedBooking(restaurantId, "2031-04-03");
    mockSession.mockResolvedValueOnce({
      userId: "stranger",
      userEmail: "x@t.co",
      profile: { id: "stranger", role: "consumer", email: "x@t.co" },
    } as never);
    const res = await transitionMeetingBookingAction({ id: booking.id, to: "confirmed" });
    expect(res.ok).toBe(false);
    const [row] = await dbAdmin
      .select()
      .from(meetingSpaceBookings)
      .where(eq(meetingSpaceBookings.id, booking.id));
    expect(row.status).toBe("requested");
  });
});
