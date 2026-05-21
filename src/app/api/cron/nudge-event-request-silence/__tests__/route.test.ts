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
import {
  sendEventRequestExpired,
  sendEventRequestNudge,
} from "@/lib/email/event-requests";

async function seedRestaurant(email = "partner@test.co") {
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
      slug: `nr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: "Partner R",
      cityId: c.id,
      status: "live",
      email,
      organizationId: orgId,
    })
    .returning();
  return r;
}

describe("nudge-event-request-silence cron", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "s";
    (sendEventRequestExpired as jest.Mock).mockClear();
    (sendEventRequestNudge as jest.Mock).mockClear();
  });

  it("rejects without bearer token", async () => {
    const req = new Request(
      "http://localhost/api/cron/nudge-event-request-silence",
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("flips status='new' rows older than 21 days to 'expired' and emails guest", async () => {
    const r = await seedRestaurant();
    const oldId = crypto.randomUUID();
    const token = `nx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    await dbAdmin.insert(eventRequests).values({
      id: oldId,
      restaurantId: r.id,
      guestName: "Old",
      guestEmail: "old-guest@b.co",
      occasion: "wedding",
      eventDate: "2026-08-01",
      partySize: 10,
      trackingToken: token,
      status: "new",
    });
    await dbAdmin.execute(
      sql`UPDATE event_requests SET created_at = NOW() - INTERVAL '22 days' WHERE id = ${oldId}`,
    );

    const req = new Request(
      "http://localhost/api/cron/nudge-event-request-silence",
      { headers: { authorization: "Bearer s" } },
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    const [row] = await dbAdmin
      .select({ status: eventRequests.status })
      .from(eventRequests)
      .where(eq(eventRequests.id, oldId));
    expect(row.status).toBe("expired");

    const expiredRecipients = (
      sendEventRequestExpired as jest.Mock
    ).mock.calls.map((c) => c[0].guestEmail);
    expect(expiredRecipients).toContain("old-guest@b.co");

    await dbAdmin.execute(
      sql`DELETE FROM event_requests WHERE id = ${oldId}`,
    );
  });

  it("nudges day-3 'new' rows to the partner and sets last_nudge_at", async () => {
    const r = await seedRestaurant("nudge-partner@test.co");
    const nudgeId = crypto.randomUUID();
    const token = `ng-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    await dbAdmin.insert(eventRequests).values({
      id: nudgeId,
      restaurantId: r.id,
      guestName: "Three",
      guestEmail: "three@b.co",
      occasion: "wedding",
      eventDate: "2026-08-01",
      partySize: 10,
      trackingToken: token,
      status: "new",
    });
    await dbAdmin.execute(
      sql`UPDATE event_requests SET created_at = NOW() - INTERVAL '4 days', last_nudge_at = NULL WHERE id = ${nudgeId}`,
    );

    const req = new Request(
      "http://localhost/api/cron/nudge-event-request-silence",
      { headers: { authorization: "Bearer s" } },
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    const nudgeRecipients = (
      sendEventRequestNudge as jest.Mock
    ).mock.calls.map((c) => c[0].partnerEmail);
    expect(nudgeRecipients).toContain("nudge-partner@test.co");

    const [row] = await dbAdmin
      .select({ lastNudgeAt: eventRequests.lastNudgeAt })
      .from(eventRequests)
      .where(eq(eventRequests.id, nudgeId));
    expect(row.lastNudgeAt).not.toBeNull();

    await dbAdmin.execute(
      sql`DELETE FROM event_requests WHERE id = ${nudgeId}`,
    );
  });
});
