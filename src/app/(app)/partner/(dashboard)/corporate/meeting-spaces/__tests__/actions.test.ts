/**
 * @jest-environment node
 *
 * INTEGRATION TEST — local DB only:
 *   set -a && source .env.local.bak && set +a && \
 *     npx jest -t "meeting-spaces partner actions"
 */
import { dbAdmin, createSupabaseAdminClient } from "@/lib/db/admin";
import { cities, organizations, organizationMembers, restaurantStaff, profiles, restaurants, meetingSpaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
jest.mock("@/lib/auth/session", () => ({ getCurrentSession: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/i18n/app-locale", () => ({ resolveAppLocale: jest.fn().mockResolvedValue("en") }));
import { createMeetingSpaceAction, updateMeetingSpaceAction, deactivateMeetingSpaceAction } from "../actions";
import { getCurrentSession } from "@/lib/auth/session";
const mockSession = getCurrentSession as jest.MockedFunction<typeof getCurrentSession>;

beforeEach(() => {
  mockSession.mockReset();
});

async function seedOwnerWithVenue() {
  const admin = createSupabaseAdminClient();
  const email = `owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@ms.test`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true, password: "x" });
  await dbAdmin
    .update(profiles)
    .set({ role: "restaurant_owner" })
    .where(eq(profiles.id, data!.user!.id));
  await dbAdmin
    .insert(cities)
    .values({ slug: "ms", name: "M", countryCode: "RO" })
    .onConflictDoNothing();
  const [c] = await dbAdmin.select().from(cities).limit(1);
  const orgId = crypto.randomUUID();
  await dbAdmin.insert(organizations).values({
    id: orgId,
    name: "MS Org",
    primaryContactEmail: `org-${orgId}@ms.test`,
  });
  const [r] = await dbAdmin
    .insert(restaurants)
    .values({
      slug: `ms-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: "MS",
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

const VALID = {
  name: "Library Room",
  description: "",
  capacity: 8,
  hourlyRateCents: 10000,
  amenities: ["screen", "whiteboard"],
  openTime: "09:00",
  closeTime: "18:00",
  minBookingMinutes: 60,
};

describe("meeting-spaces partner actions", () => {
  it("owner creates, updates, deactivates a meeting space", async () => {
    const { restaurantId } = await seedOwnerWithVenue();
    const created = await createMeetingSpaceAction({ restaurantId, ...VALID });
    expect(created).toEqual({ ok: true });
    const [row] = await dbAdmin
      .select()
      .from(meetingSpaces)
      .where(eq(meetingSpaces.restaurantId, restaurantId));
    expect(row.name).toBe("Library Room");
    expect(row.hourlyRateCents).toBe(10000);
    expect(row.amenities).toEqual(["screen", "whiteboard"]);

    await updateMeetingSpaceAction({ id: row.id, name: "Atelier", capacity: 10 });
    const [after] = await dbAdmin
      .select()
      .from(meetingSpaces)
      .where(eq(meetingSpaces.id, row.id));
    expect(after.name).toBe("Atelier");
    expect(after.capacity).toBe(10);

    await deactivateMeetingSpaceAction({ id: row.id });
    const [gone] = await dbAdmin
      .select()
      .from(meetingSpaces)
      .where(eq(meetingSpaces.id, row.id));
    expect(gone.isActive).toBe(false);
  });

  it("rejects open >= close via the schema refine", async () => {
    const { restaurantId } = await seedOwnerWithVenue();
    const res = await createMeetingSpaceAction({
      restaurantId,
      ...VALID,
      openTime: "18:00",
      closeTime: "09:00",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/opening time must be before/i);
  });

  it("non-owner gets forbidden on create/update/deactivate", async () => {
    const { restaurantId } = await seedOwnerWithVenue();
    const created = await createMeetingSpaceAction({ restaurantId, ...VALID });
    expect(created).toEqual({ ok: true });
    const [row] = await dbAdmin
      .select()
      .from(meetingSpaces)
      .where(eq(meetingSpaces.restaurantId, restaurantId));

    const stranger = {
      userId: "stranger",
      userEmail: "x@t.co",
      profile: { id: "stranger", role: "consumer", email: "x@t.co" },
    } as never;
    mockSession.mockResolvedValueOnce(stranger);
    expect((await createMeetingSpaceAction({ restaurantId, ...VALID })).ok).toBe(false);
    mockSession.mockResolvedValueOnce(stranger);
    expect((await updateMeetingSpaceAction({ id: row.id, name: "Hijack" })).ok).toBe(false);
    mockSession.mockResolvedValueOnce(stranger);
    expect((await deactivateMeetingSpaceAction({ id: row.id })).ok).toBe(false);
  });
});
