/**
 * @jest-environment node
 */

import { dbAdmin, createSupabaseAdminClient } from "@/lib/db/admin";
import {
  createEventRequestDraft,
  promoteDraftToNew,
  markViewing,
  sendQuote,
  acceptQuote,
  cancel,
  getByTrackingToken,
} from "../event-requests-repo";
import {
  restaurants,
  cities,
  profiles,
  reservations,
  availabilityExceptions,
  restaurantAvailability,
  restaurantPrivateSpaces,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";

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

  it("cancel from 'accepted' cascades to reservations and availability exceptions", async () => {
    const r = await seedRestaurant();
    const profile = await seedConsumerProfile("cancel-cascade");
    const er = await createEventRequestDraft({
      restaurantId: r.id, guestName: "Carl", guestEmail: "carl@t.co",
      occasion: "wedding", eventDate: "2026-09-15", partySize: 50,
    });
    await promoteDraftToNew(er.id, profile.id);
    await markViewing(er.id);
    await sendQuote(er.id, { amountCents: 100000, expiresAt: new Date(Date.now() + 7 * 86400_000) });
    await acceptQuote(er.id);
    // 2026-09-15 is a Tuesday (dow=2). Seed availability so the capacity
    // trigger lets the reservation insert succeed.
    await dbAdmin.insert(restaurantAvailability).values({
      restaurantId: r.id,
      dayOfWeek: 2,
      slotStart: "18:00:00",
      slotEnd: "23:00:00",
      capacity: 200,
    });
    // Simulate materialization: a reservation + a whole-venue availability exception.
    const [resv] = await dbAdmin.insert(reservations).values({
      restaurantId: r.id,
      guestName: er.guestName,
      guestPhone: "",
      guestEmail: er.guestEmail,
      partySize: 50,
      reservationDate: er.eventDate,
      reservationTime: "19:00:00",
      status: "confirmed",
      confirmationToken: randomBytes(32).toString("hex"),
      bookingType: "private_event",
      eventRequestId: er.id,
    }).returning();
    const [exc] = await dbAdmin.insert(availabilityExceptions).values({
      restaurantId: r.id,
      exceptionDate: er.eventDate,
      slotStart: null,
      slotEnd: null,
      overrideCapacity: 0,
      reason: `whole-venue event ${er.id}`,
      sourceEventRequestId: er.id,
    }).returning();

    const cancelled = await cancel(er.id);
    expect(cancelled.status).toBe("cancelled");

    const [resvAfter] = await dbAdmin.select().from(reservations).where(eq(reservations.id, resv.id));
    expect(resvAfter.status).toBe("cancelled");
    const excAfter = await dbAdmin.select().from(availabilityExceptions).where(eq(availabilityExceptions.id, exc.id));
    expect(excAfter).toHaveLength(0);
  });

  it("getByTrackingToken returns camelCase fields and skips drafts", async () => {
    const r = await seedRestaurant();
    const er = await createEventRequestDraft({
      restaurantId: r.id, guestName: "Alice", guestEmail: "a@b.co",
      occasion: "wedding", eventDate: "2026-08-01", partySize: 20,
    });
    expect(await getByTrackingToken(er.trackingToken)).toBeNull();
    const profile = await seedConsumerProfile("token");
    await promoteDraftToNew(er.id, profile.id);
    const found = await getByTrackingToken(er.trackingToken);
    expect(found?.id).toBe(er.id);
    // Drizzle must map snake_case columns to camelCase — the consumer
    // tracking page reads these fields directly.
    expect(found?.guestName).toBe("Alice");
    expect(found?.eventDate).toBe("2026-08-01");
    expect(found?.partySize).toBe(20);
    expect(found?.trackingToken).toBe(er.trackingToken);
    expect(found?.requestedByUserId).toBe(profile.id);
  });

  it("createEventRequestDraft stores privateSpaceId when supplied", async () => {
    const r = await seedRestaurant();
    const [space] = await dbAdmin.insert(restaurantPrivateSpaces).values({
      restaurantId: r.id, name: "Sala Roșie", capacityMin: 10, capacityMax: 30,
    }).returning();
    const er = await createEventRequestDraft({
      restaurantId: r.id, guestName: "G", guestEmail: "g@t.co",
      occasion: "wedding", eventDate: "2026-09-15", partySize: 20,
      privateSpaceId: space.id,
    });
    expect(er.privateSpaceId).toBe(space.id);
  });
});
