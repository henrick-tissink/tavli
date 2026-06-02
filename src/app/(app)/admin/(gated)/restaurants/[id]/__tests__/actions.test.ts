/**
 * @jest-environment node
 *
 * Integration tests for the admin suspend-restaurant action. Asserts the
 * status flip and the event_requests cascade (open requests get declined,
 * terminal/accepted requests stay put).
 */

import { dbAdmin, createSupabaseAdminClient } from "@/lib/db/admin";
import {
  cities,
  eventRequests,
  organizations,
  profiles,
  restaurants,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

jest.mock("@/lib/auth/session", () => ({
  getCurrentSession: jest.fn(),
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/i18n/app-locale", () => ({
  resolveAppLocale: jest.fn().mockResolvedValue("en"),
}));

import { suspendRestaurant, unsuspendRestaurant } from "../actions";
import { getCurrentSession } from "@/lib/auth/session";

const mockSession = getCurrentSession as jest.MockedFunction<typeof getCurrentSession>;

async function seedAdminProfile(): Promise<string> {
  const admin = createSupabaseAdminClient();
  const email = `admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@suspend.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: "test-pw-9f7a3c",
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  await dbAdmin.update(profiles).set({ role: "admin" }).where(eq(profiles.id, data.user.id));
  return data.user.id;
}

async function seedRestaurant(): Promise<{ id: string }> {
  await dbAdmin
    .insert(cities)
    .values({ slug: "sus", name: "Sus", countryCode: "RO" })
    .onConflictDoNothing();
  const [c] = await dbAdmin
    .select()
    .from(cities)
    .where(eq(cities.slug, "sus"))
    .limit(1);
  const orgId = crypto.randomUUID();
  await dbAdmin.insert(organizations).values({
    id: orgId,
    name: "Test Org",
    primaryContactEmail: `org-${orgId}@suspend.test`,
  });
  const [r] = await dbAdmin
    .insert(restaurants)
    .values({
      slug: `sus-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: "Sus",
      cityId: c.id,
      status: "live",
      organizationId: orgId,
    })
    .returning();
  return { id: r.id };
}

async function seedEventRequest(restaurantId: string, status: "new" | "viewing" | "replied" | "quoted" | "accepted" | "completed") {
  const [er] = await dbAdmin
    .insert(eventRequests)
    .values({
      restaurantId,
      guestName: "G",
      guestEmail: `g-${Date.now()}@t.co`,
      occasion: "wedding",
      eventDate: "2026-09-01",
      partySize: 25,
      status,
      trackingToken: randomBytes(32).toString("hex"),
    })
    .returning();
  return er;
}

describe("admin restaurant suspend/unsuspend", () => {
  beforeAll(async () => {
    const userId = await seedAdminProfile();
    mockSession.mockResolvedValue({
      userId,
      userEmail: "admin@t.co",
      profile: { id: userId, role: "admin", email: "admin@t.co" },
    } as unknown as Awaited<ReturnType<typeof getCurrentSession>>);
  });

  it("flips status to suspended and cascades declines to open requests only", async () => {
    const r = await seedRestaurant();
    const open = await Promise.all([
      seedEventRequest(r.id, "new"),
      seedEventRequest(r.id, "viewing"),
      seedEventRequest(r.id, "replied"),
      seedEventRequest(r.id, "quoted"),
    ]);
    const accepted = await seedEventRequest(r.id, "accepted");
    const completed = await seedEventRequest(r.id, "completed");

    const res = await suspendRestaurant(r.id);
    expect(res).toEqual({ ok: true });

    const [rAfter] = await dbAdmin
      .select({ status: restaurants.status })
      .from(restaurants)
      .where(eq(restaurants.id, r.id));
    expect(rAfter.status).toBe("suspended");

    for (const er of open) {
      const [row] = await dbAdmin
        .select({ status: eventRequests.status, reason: eventRequests.declineReason })
        .from(eventRequests)
        .where(eq(eventRequests.id, er.id));
      expect(row.status).toBe("declined");
      expect(row.reason).toBe("venue_suspended");
    }

    const [acceptedAfter] = await dbAdmin
      .select({ status: eventRequests.status })
      .from(eventRequests)
      .where(eq(eventRequests.id, accepted.id));
    expect(acceptedAfter.status).toBe("accepted");

    const [completedAfter] = await dbAdmin
      .select({ status: eventRequests.status })
      .from(eventRequests)
      .where(eq(eventRequests.id, completed.id));
    expect(completedAfter.status).toBe("completed");
  });

  it("unsuspend restores live status; cascaded declines remain terminal", async () => {
    const r = await seedRestaurant();
    const open = await seedEventRequest(r.id, "new");
    await suspendRestaurant(r.id);
    const res = await unsuspendRestaurant(r.id);
    expect(res).toEqual({ ok: true });

    const [rAfter] = await dbAdmin
      .select({ status: restaurants.status })
      .from(restaurants)
      .where(eq(restaurants.id, r.id));
    expect(rAfter.status).toBe("live");

    const [erAfter] = await dbAdmin
      .select({ status: eventRequests.status })
      .from(eventRequests)
      .where(eq(eventRequests.id, open.id));
    expect(erAfter.status).toBe("declined");
  });

  it("non-admin gets Unauthorised", async () => {
    mockSession.mockResolvedValueOnce({
      userId: "x",
      userEmail: "x@t.co",
      profile: { id: "x", role: "consumer", email: "x@t.co" },
    } as unknown as Awaited<ReturnType<typeof getCurrentSession>>);
    const res = await suspendRestaurant("some-id");
    expect(res).toEqual({ ok: false, error: "Unauthorised." });
  });
});
