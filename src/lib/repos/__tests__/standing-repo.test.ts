/**
 * @jest-environment node
 */
import { dbAdmin } from "@/lib/db/admin";
import {
  insertStandingSeries,
  getStandingSeries,
  listStandingForRestaurant,
  cancelStandingSeries,
} from "../standing-repo";

// Resolve ANY real (restaurant, table) pair from the local seed so the test
// doesn't depend on a specific venue being present.
async function aPair(): Promise<{ restaurantId: string; tableId: string } | null> {
  const rows = await dbAdmin.execute(
    `SELECT t.restaurant_id AS r, t.id AS t FROM restaurant_tables t WHERE t.archived_at IS NULL LIMIT 1`,
  );
  const row = (rows as unknown as { r: string; t: string }[])[0];
  return row ? { restaurantId: row.r, tableId: row.t } : null;
}

describe("standing-repo", () => {
  beforeEach(async () => {
    await dbAdmin.execute(`DELETE FROM standing_reservations WHERE guest_name LIKE 'ZZ_REPO_TEST%'`);
  });

  it("insert + get round-trips an active series", async () => {
    const p = await aPair();
    if (!p) return;
    const s = await insertStandingSeries({
      restaurantId: p.restaurantId, dayOfWeek: 2, startTime: "19:00", partySize: 4, intervalWeeks: 1,
      tableId: p.tableId, guestName: "ZZ_REPO_TEST Acme", guestPhone: "+40712345678", guestEmail: null,
      notes: null, startDate: "2027-07-06", endDate: null,
    });
    const got = await getStandingSeries(s.id);
    expect(got?.status).toBe("active");
    expect(got?.partySize).toBe(4);
  });

  it("cancelStandingSeries flips status to cancelled", async () => {
    const p = await aPair();
    if (!p) return;
    const s = await insertStandingSeries({
      restaurantId: p.restaurantId, dayOfWeek: 2, startTime: "19:00", partySize: 4, intervalWeeks: 1,
      tableId: p.tableId, guestName: "ZZ_REPO_TEST Beta", guestPhone: "+40712345678", guestEmail: null,
      notes: null, startDate: "2027-07-06", endDate: null,
    });
    await cancelStandingSeries(s.id, p.restaurantId, "2027-07-06");
    expect((await getStandingSeries(s.id))?.status).toBe("cancelled");
  });

  it("listStandingForRestaurant returns [] for an unknown restaurant", async () => {
    const rows = await listStandingForRestaurant("00000000-0000-0000-0000-000000000000");
    expect(rows).toEqual([]);
  });
});
