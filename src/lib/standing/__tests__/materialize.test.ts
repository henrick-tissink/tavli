/**
 * @jest-environment node
 */
import { dbAdmin } from "@/lib/db/admin";
import { insertStandingSeries } from "@/lib/repos/standing-repo";
import { materializeStanding } from "../materialize";

// Resolve ANY real (restaurant, table) pair from the local seed.
async function aPair(): Promise<{ restaurantId: string; tableId: string } | null> {
  const rows = await dbAdmin.execute(
    `SELECT t.restaurant_id AS r, t.id AS t FROM restaurant_tables t WHERE t.archived_at IS NULL LIMIT 1`,
  );
  const row = (rows as unknown as { r: string; t: string }[])[0];
  return row ? { restaurantId: row.r, tableId: row.t } : null;
}

describe("materializeStanding", () => {
  beforeEach(async () => {
    await dbAdmin.execute(`DELETE FROM reservations WHERE guest_name LIKE 'ZZ_MAT_TEST%'`);
    await dbAdmin.execute(`DELETE FROM standing_reservations WHERE guest_name LIKE 'ZZ_MAT_TEST%'`);
  });

  it("creates occurrences on the held table up to the horizon", async () => {
    const p = await aPair();
    if (!p) return;
    const s = await insertStandingSeries({
      restaurantId: p.restaurantId, dayOfWeek: 2, startTime: "15:00", partySize: 2, intervalWeeks: 1,
      tableId: p.tableId, guestName: "ZZ_MAT_TEST Acme", guestPhone: "+40712345678", guestEmail: null,
      notes: null, startDate: "2027-07-06", endDate: "2027-07-27", // 4 Tuesdays (2027-07-06 is a Tue)
    });
    // inject today so the 2027 window is in-horizon + deterministic
    const res = await materializeStanding(s.id, { today: "2027-07-01" });
    // 4 Tuesdays attempted; each either materializes or capacity-conflicts
    // (robust to whatever the resolved seed table's availability allows).
    expect(res.created + res.conflicts.length).toBe(4);
    // every materialized occurrence is on the held table, booking_type standing
    const rows = await dbAdmin.execute(
      `SELECT count(*)::int AS n FROM reservations WHERE standing_id = '${s.id}' AND table_id = '${p.tableId}' AND booking_type = 'standing'`,
    );
    expect((rows as unknown as { n: number }[])[0].n).toBe(res.created);
  });

  it("is idempotent (re-running does not duplicate)", async () => {
    const p = await aPair();
    if (!p) return;
    const s = await insertStandingSeries({
      restaurantId: p.restaurantId, dayOfWeek: 2, startTime: "15:00", partySize: 2, intervalWeeks: 1,
      tableId: p.tableId, guestName: "ZZ_MAT_TEST Beta", guestPhone: "+40712345678", guestEmail: null,
      notes: null, startDate: "2027-07-06", endDate: "2027-07-13",
    });
    await materializeStanding(s.id, { today: "2027-07-01" });
    const again = await materializeStanding(s.id, { today: "2027-07-01" });
    expect(again.created).toBe(0);
  });

  afterAll(async () => {
    await dbAdmin.execute(`DELETE FROM reservations WHERE guest_name LIKE 'ZZ_MAT_TEST%'`);
    await dbAdmin.execute(`DELETE FROM standing_reservations WHERE guest_name LIKE 'ZZ_MAT_TEST%'`);
  });
});
