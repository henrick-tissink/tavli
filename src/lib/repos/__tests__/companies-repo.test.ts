/**
 * @jest-environment node
 */

import { dbAdmin } from "@/lib/db/admin";
import { findCompanyByCui, insertPendingCompany } from "../companies-repo";

describe("companies-repo", () => {
  beforeEach(async () => {
    await dbAdmin.execute(`DELETE FROM companies WHERE cui LIKE 'RO_TEST%'`);
  });

  it("findCompanyByCui returns null when not found", async () => {
    expect(await findCompanyByCui("RO_TEST_404")).toBeNull();
  });

  it("insertPendingCompany creates a pending_verification row idempotently by CUI", async () => {
    const a = await insertPendingCompany({ cui: "RO_TEST_1", name: "Acme" });
    const b = await insertPendingCompany({ cui: "RO_TEST_1", name: "Acme" });
    expect(a.id).toBe(b.id);
    expect(a.status).toBe("pending_verification");
  });
});
