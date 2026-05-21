/**
 * @jest-environment node
 */

jest.mock("@/lib/auth/otp", () => ({
  sendOtp: jest.fn().mockResolvedValue({ ok: true }),
}));
jest.mock("@/lib/auth/session", () => ({
  getCurrentSession: jest.fn(),
}));

import { submitEventRequestDraft, sendQuoteForEventRequest } from "../actions";
import { dbAdmin, createSupabaseAdminClient } from "@/lib/db/admin";
import {
  restaurants,
  cities,
  eventRequests,
  organizations,
  organizationMembers,
  restaurantStaff,
  profiles,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  createEventRequestDraft,
  promoteDraftToNew,
  markViewing,
} from "@/lib/repos/event-requests-repo";
import { listLineItems } from "@/lib/repos/quote-line-items-repo";
import { getCurrentSession } from "@/lib/auth/session";

const mockSession = getCurrentSession as jest.MockedFunction<typeof getCurrentSession>;

async function seedR(overrides?: Partial<typeof restaurants.$inferInsert>) {
  await dbAdmin
    .insert(cities)
    .values({ slug: "tt", name: "T", countryCode: "RO" })
    .onConflictDoNothing();
  const [c] = await dbAdmin.select().from(cities).limit(1);
  const orgId = crypto.randomUUID();
  await dbAdmin.insert(organizations).values({
    id: orgId,
    name: "Test Org",
    primaryContactEmail: `org-${orgId}@test.co`,
  });
  const [r] = await dbAdmin
    .insert(restaurants)
    .values({
      slug: `tt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: "T",
      cityId: c.id,
      status: "live",
      eventsIntakeEnabled: true,
      organizationId: orgId,
      ...overrides,
    })
    .returning();
  return r;
}

async function seedConsumerProfile(hint?: string): Promise<typeof profiles.$inferSelect> {
  const admin = createSupabaseAdminClient();
  const email = `${hint ?? "u"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.co`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: "test-pw-9f7a3c",
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const [row] = await dbAdmin.select().from(profiles).where(eq(profiles.id, data.user.id)).limit(1);
  if (!row) throw new Error(`profile trigger did not fire for ${data.user.id}`);
  return row;
}

async function seedVenueWithOwner() {
  const owner = await seedConsumerProfile("owner");
  const r = await seedR({ ownerUserId: owner.id });
  // §3.6 sub-unit B: can() now resolves via organization_members +
  // restaurant_staff, so seed both with owner role so the partner-side
  // transitions pass the new authz check.
  await dbAdmin.insert(organizationMembers).values({
    organizationId: r.organizationId,
    userId: owner.id,
    role: "owner",
    isActive: true,
  });
  await dbAdmin.insert(restaurantStaff).values({
    restaurantId: r.id,
    userId: owner.id,
    role: "owner",
    isActive: true,
  });
  return { restaurant: r, ownerUserId: owner.id };
}

describe("submitEventRequestDraft", () => {
  it("rejects when restaurant has events_intake_enabled=false", async () => {
    const r = await seedR({ eventsIntakeEnabled: false });
    await expect(
      submitEventRequestDraft({
        restaurantId: r.id,
        guestName: "A",
        guestEmail: "a@b.co",
        occasion: "wedding",
        eventDate: "2026-08-01",
        partySize: 30,
      }),
    ).rejects.toThrow(/not accepting/i);
  });

  it("creates a draft and returns the tracking token + sends OTP", async () => {
    const r = await seedR();
    const out = await submitEventRequestDraft({
      restaurantId: r.id,
      guestName: "A",
      guestEmail: "user@test.co",
      occasion: "wedding",
      eventDate: "2026-08-01",
      partySize: 30,
    });
    expect(out.ok).toBe(true);
    expect(out.trackingToken).toHaveLength(64);
    const { sendOtp } = await import("@/lib/auth/otp");
    expect(sendOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "user@test.co" }),
    );
  });

  it("dedupes within 5 minutes for the same (restaurant, email, date, party)", async () => {
    const r = await seedR();
    const a = await submitEventRequestDraft({
      restaurantId: r.id,
      guestName: "A",
      guestEmail: "dup@test.co",
      occasion: "birthday",
      eventDate: "2026-09-01",
      partySize: 10,
    });
    const b = await submitEventRequestDraft({
      restaurantId: r.id,
      guestName: "A",
      guestEmail: "dup@test.co",
      occasion: "birthday",
      eventDate: "2026-09-01",
      partySize: 10,
    });
    expect(b.trackingToken).toBe(a.trackingToken);
  });
});

describe("sendQuoteForEventRequest", () => {
  beforeEach(() => {
    mockSession.mockReset();
  });

  it("sendQuote persists line items and stores their total on the row", async () => {
    const { restaurant: r, ownerUserId } = await seedVenueWithOwner();
    mockSession.mockResolvedValue({
      userId: ownerUserId,
      userEmail: "owner@test.co",
      profile: {
        id: ownerUserId,
        role: "restaurant_owner",
        fullName: null,
        email: "owner@test.co",
        locale: "ro",
        defaultOrganizationId: null,
      },
    } as Awaited<ReturnType<typeof getCurrentSession>>);
    const er = await createEventRequestDraft({
      restaurantId: r.id,
      guestName: "G",
      guestEmail: "g@t.co",
      occasion: "wedding",
      eventDate: "2026-09-15",
      partySize: 20,
    });
    await promoteDraftToNew(er.id, (await seedConsumerProfile("ql")).id);
    await markViewing(er.id);
    await sendQuoteForEventRequest({
      id: er.id,
      expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
      lineItems: [
        { label: "Meniu standard", amountCents: 250_00 * 20 },
        { label: "Welcome cocktail", amountCents: 25_00 * 20 },
      ],
      partnerResponse: "Mulțumim, atașat e meniul.",
    });
    const [row] = await dbAdmin
      .select()
      .from(eventRequests)
      .where(eq(eventRequests.id, er.id));
    expect(row.status).toBe("quoted");
    expect(row.quotedAmountCents).toBe(275_00 * 20);
    const lines = await listLineItems(er.id);
    expect(lines).toHaveLength(2);
  });
});
