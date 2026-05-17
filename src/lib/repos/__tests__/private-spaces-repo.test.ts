/** @jest-environment node */
import { dbAdmin } from "@/lib/db/admin";
import { cities, restaurants } from "@/lib/db/schema";
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
    slug: `ps-${Date.now()}`, name: "PS", cityId: c.id, status: "live",
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
    const afterDelete = await listActiveSpacesForVenue(r.id);
    expect(afterDelete).toHaveLength(0);
  });
});
