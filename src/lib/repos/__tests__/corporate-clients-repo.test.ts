/**
 * @jest-environment node
 */

import { dbAdmin } from "@/lib/db/admin";
import { findCorporateClientByCui, insertPendingCorporateClient, listCorporateClientsForRestaurant } from "../corporate-clients-repo";

describe("corporate-clients-repo", () => {
  beforeEach(async () => {
    await dbAdmin.execute(`DELETE FROM corporate_clients WHERE cui LIKE '%TEST%' OR cui IN ('99990001')`);
  });

  it("findCorporateClientByCui returns null when not found", async () => {
    expect(await findCorporateClientByCui("RO_TEST_404")).toBeNull();
  });

  it("insertPendingCorporateClient creates a pending_verification row idempotently by CUI", async () => {
    const a = await insertPendingCorporateClient({ cui: "RO_TEST_1", name: "Acme" });
    const b = await insertPendingCorporateClient({ cui: "RO_TEST_1", name: "Acme" });
    expect(a.id).toBe(b.id);
    expect(a.status).toBe("pending_verification");
  });

  it("dedupes RO-prefixed and bare CUIs to one row", async () => {
    const a = await insertPendingCorporateClient({ cui: "RO99990001", name: "Acme SRL" });
    const b = await insertPendingCorporateClient({ cui: "99990001", name: "Acme SRL" });
    expect(b.id).toBe(a.id);
    expect(a.cui).toBe("99990001");
  });
});

it("listCorporateClientsForRestaurant returns [] for a restaurant with no corporate reservations", async () => {
  const rows = await listCorporateClientsForRestaurant("00000000-0000-0000-0000-000000000000");
  expect(Array.isArray(rows)).toBe(true);
  expect(rows.length).toBe(0);
});
