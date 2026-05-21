/**
 * @jest-environment node
 */

jest.mock("@/lib/email/event-requests", () => ({
  sendEventRequestExpired: jest.fn().mockResolvedValue({ ok: true }),
  sendEventRequestNudge: jest.fn().mockResolvedValue({ ok: true }),
}));

import { GET } from "../route";
import { dbAdmin } from "@/lib/db/admin";
import { eventRequests, cities, organizations, restaurants } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { sendEventRequestExpired } from "@/lib/email/event-requests";

async function seedRestaurant() {
  await dbAdmin
    .insert(cities)
    .values({ slug: "c", name: "C", countryCode: "RO" })
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
      slug: `qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: "X",
      cityId: c.id,
      status: "live",
      organizationId: orgId,
    })
    .returning();
  return r;
}

describe("expire-event-request-quotes cron", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "s";
    (sendEventRequestExpired as jest.Mock).mockClear();
  });

  it("rejects without bearer token", async () => {
    const req = new Request(
      "http://localhost/api/cron/expire-event-request-quotes",
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("flips past-due quotes to expired_quote; leaves future quotes alone", async () => {
    const r = await seedRestaurant();
    const pastId = crypto.randomUUID();
    const futureId = crypto.randomUUID();
    const pastToken = `tq-past-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const futureToken = `tq-fut-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    await dbAdmin.insert(eventRequests).values([
      {
        id: pastId,
        restaurantId: r.id,
        guestName: "Past",
        guestEmail: "past@b.co",
        occasion: "wedding",
        eventDate: "2026-08-01",
        partySize: 10,
        trackingToken: pastToken,
        status: "quoted",
        quoteExpiresAt: new Date(Date.now() - 3600_000), // 1h ago
      },
      {
        id: futureId,
        restaurantId: r.id,
        guestName: "Future",
        guestEmail: "future@b.co",
        occasion: "wedding",
        eventDate: "2026-08-01",
        partySize: 10,
        trackingToken: futureToken,
        status: "quoted",
        quoteExpiresAt: new Date(Date.now() + 86400_000), // +1 day
      },
    ]);

    const req = new Request(
      "http://localhost/api/cron/expire-event-request-quotes",
      { headers: { authorization: "Bearer s" } },
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.expired).toBeGreaterThanOrEqual(1);

    const [past] = await dbAdmin
      .select({ status: eventRequests.status })
      .from(eventRequests)
      .where(eq(eventRequests.id, pastId));
    expect(past.status).toBe("expired_quote");

    const [future] = await dbAdmin
      .select({ status: eventRequests.status })
      .from(eventRequests)
      .where(eq(eventRequests.id, futureId));
    expect(future.status).toBe("quoted");

    // Email dispatched at least for the past row.
    const calls = (sendEventRequestExpired as jest.Mock).mock.calls;
    const recipients = calls.map((c) => c[0].guestEmail);
    expect(recipients).toContain("past@b.co");
    expect(recipients).not.toContain("future@b.co");

    // Cleanup
    await dbAdmin.execute(
      sql`DELETE FROM event_requests WHERE id IN (${pastId}, ${futureId})`,
    );
  });
});
