/** @jest-environment node */
import { dbAdmin, createSupabaseAdminClient } from "@/lib/db/admin";
import { cities, organizations, organizationMembers, restaurantStaff, profiles, restaurants, restaurantPrivateSpaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
jest.mock("@/lib/auth/session", () => ({ getCurrentSession: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/i18n/app-locale", () => ({ resolveAppLocale: jest.fn().mockResolvedValue("en") }));
import { createSpaceAction, updateSpaceAction, deactivateSpaceAction } from "../actions";
import { getCurrentSession } from "@/lib/auth/session";
const mockSession = getCurrentSession as jest.MockedFunction<typeof getCurrentSession>;

beforeEach(() => {
  mockSession.mockReset();
});

async function seedOwnerWithVenue() {
  const admin = createSupabaseAdminClient();
  const email = `owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@spaces.test`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true, password: "x" });
  await dbAdmin
    .update(profiles)
    .set({ role: "restaurant_owner" })
    .where(eq(profiles.id, data!.user!.id));
  await dbAdmin
    .insert(cities)
    .values({ slug: "sp", name: "S", countryCode: "RO" })
    .onConflictDoNothing();
  const [c] = await dbAdmin.select().from(cities).limit(1);
  const orgId = crypto.randomUUID();
  await dbAdmin.insert(organizations).values({
    id: orgId,
    name: "Test Org",
    primaryContactEmail: `org-${orgId}@spaces.test`,
  });
  const [r] = await dbAdmin
    .insert(restaurants)
    .values({
      slug: `sp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: "S",
      cityId: c.id,
      status: "live",
      organizationId: orgId,
    })
    .returning();
  // Ownership is membership-based (is_owner_of / can() check org_members +
  // restaurant_staff). profiles.role alone doesn't grant venue access.
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
  return { userId: data!.user!.id, restaurantId: r.id };
}

describe("private-spaces partner actions", () => {
  it("owner creates, updates, deactivates a space", async () => {
    const { restaurantId } = await seedOwnerWithVenue();
    const created = await createSpaceAction({
      restaurantId,
      name: "Sala Verde",
      capacityMin: 10,
      capacityMax: 20,
      description: "",
    });
    expect(created.ok).toBe(true);
    const [row] = await dbAdmin
      .select()
      .from(restaurantPrivateSpaces)
      .where(eq(restaurantPrivateSpaces.restaurantId, restaurantId));
    expect(row.name).toBe("Sala Verde");

    await updateSpaceAction({ id: row.id, name: "Sala Verde Renovată", capacityMax: 22 });
    const [after] = await dbAdmin
      .select()
      .from(restaurantPrivateSpaces)
      .where(eq(restaurantPrivateSpaces.id, row.id));
    expect(after.name).toBe("Sala Verde Renovată");
    expect(after.capacityMax).toBe(22);

    await deactivateSpaceAction({ id: row.id });
    const [gone] = await dbAdmin
      .select()
      .from(restaurantPrivateSpaces)
      .where(eq(restaurantPrivateSpaces.id, row.id));
    expect(gone.isActive).toBe(false);
  });

  it("non-owner gets forbidden", async () => {
    const { restaurantId } = await seedOwnerWithVenue();
    mockSession.mockResolvedValueOnce({
      userId: "stranger",
      userEmail: "x@t.co",
      profile: { id: "stranger", role: "consumer", email: "x@t.co" },
    } as never);
    const res = await createSpaceAction({
      restaurantId,
      name: "Pirate Room",
      capacityMin: 1,
      capacityMax: 5,
      description: "",
    });
    expect(res.ok).toBe(false);
  });

  it("createSpaceAction rejects capacityMin > capacityMax via schema", async () => {
    const { restaurantId } = await seedOwnerWithVenue();
    const res = await createSpaceAction({
      restaurantId,
      name: "Backwards",
      capacityMin: 30,
      capacityMax: 10,
      description: "",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/maximum capacity must be at least/i);
  });

  it("updateSpaceAction non-owner gets forbidden", async () => {
    const { restaurantId } = await seedOwnerWithVenue();
    const created = await createSpaceAction({
      restaurantId,
      name: "Owned",
      capacityMin: 5,
      capacityMax: 15,
      description: "",
    });
    expect(created.ok).toBe(true);
    const [row] = await dbAdmin
      .select()
      .from(restaurantPrivateSpaces)
      .where(eq(restaurantPrivateSpaces.restaurantId, restaurantId));

    mockSession.mockResolvedValueOnce({
      userId: "stranger",
      userEmail: "x@t.co",
      profile: { id: "stranger", role: "consumer", email: "x@t.co" },
    } as never);
    const res = await updateSpaceAction({ id: row.id, name: "Hijacked" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/forbidden/i);
  });

  it("deactivateSpaceAction non-owner gets forbidden", async () => {
    const { restaurantId } = await seedOwnerWithVenue();
    const created = await createSpaceAction({
      restaurantId,
      name: "Owned",
      capacityMin: 5,
      capacityMax: 15,
      description: "",
    });
    expect(created.ok).toBe(true);
    const [row] = await dbAdmin
      .select()
      .from(restaurantPrivateSpaces)
      .where(eq(restaurantPrivateSpaces.restaurantId, restaurantId));

    mockSession.mockResolvedValueOnce({
      userId: "stranger",
      userEmail: "x@t.co",
      profile: { id: "stranger", role: "consumer", email: "x@t.co" },
    } as never);
    const res = await deactivateSpaceAction({ id: row.id });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/forbidden/i);
  });
});
