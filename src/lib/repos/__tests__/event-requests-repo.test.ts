/**
 * @jest-environment node
 */

import { dbAdmin, createSupabaseAdminClient } from "@/lib/db/admin";
import {
  createEventRequestDraft,
  promoteDraftToNew,
  markViewing,
  reply,
  sendQuote,
  decline,
  acceptQuote,
  declineQuote,
  cancel,
  getByTrackingToken,
  findOverlappingReservations,
} from "../event-requests-repo";
import { restaurants, cities, profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function seedRestaurant() {
  await dbAdmin.insert(cities).values({ slug: "test-city", name: "Test", countryCode: "RO" }).onConflictDoNothing();
  const [city] = await dbAdmin.select().from(cities).limit(1);
  const [r] = await dbAdmin.insert(restaurants).values({
    slug: `test-r-${Date.now()}`, name: "Test R", cityId: city.id, status: "live",
  }).returning();
  return r;
}

// auth.users has a complex schema and FK from public.profiles. Create via
// Supabase admin API — the `on_auth_user_created` trigger auto-inserts the
// profile row, so we can immediately query/use the id.
async function seedConsumerProfile(emailHint?: string): Promise<typeof profiles.$inferSelect> {
  const admin = createSupabaseAdminClient();
  const email = `${emailHint ?? "u"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.co`;
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

describe("event-requests-repo", () => {
  it("createEventRequestDraft returns a row with status='draft' and a tracking token", async () => {
    const r = await seedRestaurant();
    const er = await createEventRequestDraft({
      restaurantId: r.id, guestName: "A", guestEmail: "a@b.co",
      occasion: "wedding", eventDate: "2026-08-01", partySize: 30,
    });
    expect(er.status).toBe("draft");
    expect(er.trackingToken).toHaveLength(64);
  });

  it("promoteDraftToNew sets status=new + requested_by_user_id", async () => {
    const r = await seedRestaurant();
    const profile = await seedConsumerProfile("promote");
    const er = await createEventRequestDraft({
      restaurantId: r.id, guestName: "A", guestEmail: "u@test.co",
      occasion: "birthday", eventDate: "2026-08-01", partySize: 10,
    });
    const promoted = await promoteDraftToNew(er.id, profile.id);
    expect(promoted.status).toBe("new");
    expect(promoted.requestedByUserId).toBe(profile.id);
  });

  it("rejects invalid state transitions", async () => {
    const r = await seedRestaurant();
    const er = await createEventRequestDraft({
      restaurantId: r.id, guestName: "A", guestEmail: "a@b.co",
      occasion: "other", eventDate: "2026-08-01", partySize: 4,
    });
    await expect(sendQuote(er.id, { amountCents: 50000, expiresAt: new Date() }))
      .rejects.toThrow(/invalid transition/i);
  });

  it("sendQuote requires status=replied or viewing", async () => {
    const r = await seedRestaurant();
    const er = await createEventRequestDraft({
      restaurantId: r.id, guestName: "A", guestEmail: "a@b.co",
      occasion: "wedding", eventDate: "2026-08-01", partySize: 20,
    });
    const profile = await seedConsumerProfile("quote");
    await promoteDraftToNew(er.id, profile.id);
    await markViewing(er.id);
    const expires = new Date(Date.now() + 7 * 86400_000);
    const q = await sendQuote(er.id, { amountCents: 50000, expiresAt: expires });
    expect(q.status).toBe("quoted");
    expect(q.quotedAmountCents).toBe(50000);
  });

  it("getByTrackingToken uses the SECURITY DEFINER RPC and skips drafts", async () => {
    const r = await seedRestaurant();
    const er = await createEventRequestDraft({
      restaurantId: r.id, guestName: "A", guestEmail: "a@b.co",
      occasion: "wedding", eventDate: "2026-08-01", partySize: 20,
    });
    expect(await getByTrackingToken(er.trackingToken)).toBeNull();
    const profile = await seedConsumerProfile("token");
    await promoteDraftToNew(er.id, profile.id);
    const found = await getByTrackingToken(er.trackingToken);
    expect(found?.id).toBe(er.id);
  });
});
