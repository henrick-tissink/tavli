/** @jest-environment node */
import { dbAdmin } from "@/lib/db/admin";
import { cities, eventRequests, organizations, restaurants } from "@/lib/db/schema";
import { randomBytes } from "node:crypto";
import {
  replaceLineItems,
  listLineItems,
  sumLineItemCents,
} from "../quote-line-items-repo";

async function seedRequest() {
  await dbAdmin.insert(cities).values({ slug: "ql", name: "Q", countryCode: "RO" }).onConflictDoNothing();
  const [c] = await dbAdmin.select().from(cities).limit(1);
  const orgId = crypto.randomUUID();
  await dbAdmin.insert(organizations).values({
    id: orgId,
    name: "Test Org",
    primaryContactEmail: `org-${orgId}@test.co`,
  });
  const [r] = await dbAdmin.insert(restaurants).values({
    slug: `ql-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: "Q", cityId: c.id, status: "live",
    organizationId: orgId,
  }).returning();
  const [er] = await dbAdmin.insert(eventRequests).values({
    restaurantId: r.id, guestName: "G", guestEmail: "g@t.co",
    occasion: "wedding", eventDate: "2026-09-15", partySize: 20,
    status: "viewing", trackingToken: randomBytes(32).toString("hex"),
  }).returning();
  return er;
}

describe("quote-line-items-repo", () => {
  it("replaces lines atomically and totals correctly", async () => {
    const er = await seedRequest();
    await replaceLineItems(er.id, [
      { label: "Meniu standard", amountCents: 250_00 * 20 },
      { label: "Welcome cocktail", amountCents: 25_00 * 20 },
    ]);
    const lines = await listLineItems(er.id);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.label)).toEqual(["Meniu standard", "Welcome cocktail"]);
    expect(await sumLineItemCents(er.id)).toBe(275_00 * 20);

    // Replacing must wipe the previous lines.
    await replaceLineItems(er.id, [{ label: "Forfetar", amountCents: 6000_00 }]);
    expect(await listLineItems(er.id)).toHaveLength(1);
    expect(await sumLineItemCents(er.id)).toBe(6000_00);
  });

  it("replacing with an empty array wipes all lines", async () => {
    const er = await seedRequest();
    await replaceLineItems(er.id, [
      { label: "First", amountCents: 100_00 },
      { label: "Second", amountCents: 200_00 },
    ]);
    expect(await listLineItems(er.id)).toHaveLength(2);

    await replaceLineItems(er.id, []);
    expect(await listLineItems(er.id)).toHaveLength(0);
    expect(await sumLineItemCents(er.id)).toBe(0);
  });

  it("rejects blank labels", async () => {
    const er = await seedRequest();
    await expect(
      replaceLineItems(er.id, [{ label: "   ", amountCents: 100_00 }]),
    ).rejects.toThrow(/blank/i);
    // Confirm nothing was inserted (transaction rolled back / pre-check fired).
    expect(await listLineItems(er.id)).toHaveLength(0);
  });

  it("rejects non-finite amounts", async () => {
    const er = await seedRequest();
    await expect(
      replaceLineItems(er.id, [{ label: "Bad", amountCents: Number.NaN }]),
    ).rejects.toThrow(/finite/i);
    await expect(
      replaceLineItems(er.id, [{ label: "Bad", amountCents: Number.POSITIVE_INFINITY }]),
    ).rejects.toThrow(/finite/i);
    expect(await listLineItems(er.id)).toHaveLength(0);
  });

  it("returns empty list and zero sum for unknown event_request_id", async () => {
    // Random UUID that doesn't exist
    const fakeId = "00000000-0000-0000-0000-000000000000";
    expect(await listLineItems(fakeId)).toEqual([]);
    expect(await sumLineItemCents(fakeId)).toBe(0);
  });
});
