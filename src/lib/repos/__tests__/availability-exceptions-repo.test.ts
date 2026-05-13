/**
 * @jest-environment node
 */

import { dbAdmin } from "@/lib/db/admin";
import { listExceptionsForDate, insertWholeVenueBlock } from "../availability-exceptions-repo";
import { cities, restaurants } from "@/lib/db/schema";

async function seedR() {
  await dbAdmin.insert(cities).values({ slug: "x", name: "X", countryCode: "RO" }).onConflictDoNothing();
  const [c] = await dbAdmin.select().from(cities).limit(1);
  const [r] = await dbAdmin.insert(restaurants).values({
    slug: `ex-${Date.now()}`, name: "X", cityId: c.id, status: "live",
  }).returning();
  return r;
}

describe("availability-exceptions-repo", () => {
  it("insertWholeVenueBlock creates a zero-capacity row for the date", async () => {
    const r = await seedR();
    const row = await insertWholeVenueBlock({
      restaurantId: r.id, exceptionDate: "2026-08-01", reason: "private buyout",
    });
    expect(row.overrideCapacity).toBe(0);
  });

  it("listExceptionsForDate returns matching rows", async () => {
    const r = await seedR();
    await insertWholeVenueBlock({ restaurantId: r.id, exceptionDate: "2026-08-01" });
    const rows = await listExceptionsForDate(r.id, "2026-08-01");
    expect(rows.length).toBeGreaterThan(0);
  });
});
