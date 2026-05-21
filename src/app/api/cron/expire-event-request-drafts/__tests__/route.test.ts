/**
 * @jest-environment node
 */

import { GET } from "../route";
import { dbAdmin } from "@/lib/db/admin";
import { eventRequests, cities, organizations, restaurants } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

describe("expire-event-request-drafts cron", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "s";
  });

  it("rejects without bearer token", async () => {
    const req = new Request(
      "http://localhost/api/cron/expire-event-request-drafts",
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("deletes drafts older than 30 minutes; leaves recent + non-draft alone", async () => {
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
        slug: `dr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: "X",
        cityId: c.id,
        status: "live",
        organizationId: orgId,
      })
      .returning();

    const oldId = crypto.randomUUID();
    const newId = crypto.randomUUID();
    const oldToken = `t-old-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const newToken = `t-new-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    await dbAdmin.insert(eventRequests).values([
      {
        id: oldId,
        restaurantId: r.id,
        guestName: "A",
        guestEmail: "a@b.co",
        occasion: "wedding",
        eventDate: "2026-08-01",
        partySize: 10,
        trackingToken: oldToken,
      },
      {
        id: newId,
        restaurantId: r.id,
        guestName: "B",
        guestEmail: "b@b.co",
        occasion: "wedding",
        eventDate: "2026-08-01",
        partySize: 10,
        trackingToken: newToken,
      },
    ]);

    // Backdate one draft + ensure status is 'draft' (default).
    await dbAdmin.execute(
      sql`UPDATE event_requests SET created_at = NOW() - INTERVAL '1 hour' WHERE id = ${oldId}`,
    );

    const req = new Request(
      "http://localhost/api/cron/expire-event-request-drafts",
      { headers: { authorization: "Bearer s" } },
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deleted).toBeGreaterThanOrEqual(1);

    const remaining = await dbAdmin
      .select({ id: eventRequests.id })
      .from(eventRequests)
      .where(eq(eventRequests.id, oldId));
    expect(remaining).toHaveLength(0);

    const recent = await dbAdmin
      .select({ id: eventRequests.id })
      .from(eventRequests)
      .where(eq(eventRequests.id, newId));
    expect(recent).toHaveLength(1);
  });
});
