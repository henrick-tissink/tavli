/**
 * @jest-environment node
 */

jest.mock("@/lib/auth/otp", () => ({
  sendOtp: jest.fn().mockResolvedValue({ ok: true }),
}));

import { submitEventRequestDraft } from "../actions";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants, cities } from "@/lib/db/schema";

async function seedR(overrides?: Partial<typeof restaurants.$inferInsert>) {
  await dbAdmin
    .insert(cities)
    .values({ slug: "tt", name: "T", countryCode: "RO" })
    .onConflictDoNothing();
  const [c] = await dbAdmin.select().from(cities).limit(1);
  const [r] = await dbAdmin
    .insert(restaurants)
    .values({
      slug: `tt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: "T",
      cityId: c.id,
      status: "live",
      eventsIntakeEnabled: true,
      ...overrides,
    })
    .returning();
  return r;
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
