/** @jest-environment node */
import { dbAdmin } from "@/lib/db/admin";
import { cities, restaurants, restaurantPrivateSpaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  createPrivateSpace,
  listActiveSpacesForVenue,
  updatePrivateSpace,
  deactivatePrivateSpace,
} from "../private-spaces-repo";

async function seedVenue() {
  await dbAdmin.insert(cities)
    .values({ slug: "ps", name: "PS", countryCode: "RO" })
    .onConflictDoNothing();
  const [c] = await dbAdmin.select().from(cities).limit(1);
  const [r] = await dbAdmin.insert(restaurants).values({
    slug: `ps-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: "PS", cityId: c.id, status: "live",
  }).returning();
  return r;
}

describe("private-spaces-repo", () => {
  it("creates, lists, updates, and soft-deletes a space", async () => {
    const r = await seedVenue();
    const created = await createPrivateSpace({
      restaurantId: r.id,
      name: "Sala Verde",
      description: "Sala intimă cu vedere la grădină",
      capacityMin: 10,
      capacityMax: 20,
      photoStoragePath: null,
    });
    expect(created.name).toBe("Sala Verde");

    const listed = await listActiveSpacesForVenue(r.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(created.id);

    const updated = await updatePrivateSpace(created.id, { capacityMax: 24 });
    expect(updated.capacityMax).toBe(24);

    await deactivatePrivateSpace(created.id);
    const afterDeactivate = await listActiveSpacesForVenue(r.id);
    expect(afterDeactivate).toHaveLength(0);
  });

  it("createPrivateSpace rejects capacityMin > capacityMax", async () => {
    const r = await seedVenue();
    await expect(createPrivateSpace({
      restaurantId: r.id, name: "Backwards", capacityMin: 20, capacityMax: 10,
    })).rejects.toThrow(/capacityMin must be <= capacityMax/);
  });

  it("updatePrivateSpace throws when id is unknown", async () => {
    await expect(updatePrivateSpace("00000000-0000-0000-0000-000000000000", { name: "x" }))
      .rejects.toThrow(/not found/);
  });

  it("updatePrivateSpace ignores fields not in the allowed set", async () => {
    const r = await seedVenue();
    const s = await createPrivateSpace({
      restaurantId: r.id, name: "Original", capacityMin: 10, capacityMax: 20,
    });
    // simulate untrusted caller trying to move space to a different restaurant
    const r2 = await seedVenue();
    // @ts-expect-error intentionally smuggling a disallowed field
    await updatePrivateSpace(s.id, { name: "Renamed", restaurantId: r2.id });
    const after = await dbAdmin
      .select()
      .from(restaurantPrivateSpaces)
      .where(eq(restaurantPrivateSpaces.id, s.id))
      .limit(1);
    expect(after[0].restaurantId).toBe(r.id); // unchanged
    expect(after[0].name).toBe("Renamed");
  });

  it("deactivatePrivateSpace throws when id is unknown", async () => {
    await expect(deactivatePrivateSpace("00000000-0000-0000-0000-000000000000"))
      .rejects.toThrow(/not found/);
  });

  it("listActiveSpacesForVenue orders by sortOrder then capacityMin", async () => {
    const r = await seedVenue();
    await createPrivateSpace({ restaurantId: r.id, name: "B", capacityMin: 10, capacityMax: 20, sortOrder: 1 });
    await createPrivateSpace({ restaurantId: r.id, name: "C", capacityMin: 5,  capacityMax: 20, sortOrder: 2 });
    await createPrivateSpace({ restaurantId: r.id, name: "A", capacityMin: 5,  capacityMax: 20, sortOrder: 1 });
    const listed = await listActiveSpacesForVenue(r.id);
    expect(listed.map((s) => s.name)).toEqual(["A", "B", "C"]);
  });

  it("listActiveSpacesForVenue is scoped to the requested venue", async () => {
    const r1 = await seedVenue();
    const r2 = await seedVenue();
    await createPrivateSpace({ restaurantId: r1.id, name: "V1", capacityMin: 1, capacityMax: 10 });
    await createPrivateSpace({ restaurantId: r2.id, name: "V2", capacityMin: 1, capacityMax: 10 });
    const list1 = await listActiveSpacesForVenue(r1.id);
    const list2 = await listActiveSpacesForVenue(r2.id);
    expect(list1.map((s) => s.name)).toEqual(["V1"]);
    expect(list2.map((s) => s.name)).toEqual(["V2"]);
  });
});
