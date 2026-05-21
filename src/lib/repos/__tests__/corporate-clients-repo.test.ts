/**
 * @jest-environment node
 */

import { dbAdmin } from "@/lib/db/admin";
import { findCorporateClientByCui, insertPendingCorporateClient } from "../corporate-clients-repo";

describe("corporate-clients-repo", () => {
  beforeEach(async () => {
    await dbAdmin.execute(`DELETE FROM corporate_clients WHERE cui LIKE 'RO_TEST%'`);
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
});
