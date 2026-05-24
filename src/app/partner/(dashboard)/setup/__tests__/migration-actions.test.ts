/**
 * @jest-environment node
 *
 * rollbackMigrationImport authorization (audit #2). can() is checked against
 * the client-supplied restaurantId, but the DELETE keyed solely off the
 * client-supplied migrationImportId. An operator authorized for venue A could
 * delete venue B's reservations by passing B's import id. The rollback must
 * load migration_imports.restaurant_id, verify it equals the gated
 * restaurant, and scope the DELETE by both.
 */

jest.mock("@/lib/auth/session", () => ({ getCurrentSession: jest.fn() }));
jest.mock("@/lib/authz/can", () => ({ can: jest.fn() }));
jest.mock("@/lib/db/admin", () => ({
  dbAdmin: {
    select: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));
jest.mock("@/lib/audit/record", () => ({ recordAudit: jest.fn() }));
jest.mock("@/lib/jobs/enqueue", () => ({ enqueue: jest.fn() }));

import { rollbackMigrationImport } from "../migration-actions";
import { dbAdmin } from "@/lib/db/admin";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { recordAudit } from "@/lib/audit/record";

function lookupReturning(rows: unknown[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (getCurrentSession as jest.Mock).mockResolvedValue({
    userId: "u1",
    userEmail: "u1@example.com",
    profile: { id: "u1", role: "restaurant_owner" },
  });
  (can as jest.Mock).mockResolvedValue(true);
});

describe("rollbackMigrationImport", () => {
  it("refuses when the import belongs to a different restaurant (cross-tenant IDOR)", async () => {
    // Caller is authorized for R1, but the import id belongs to R2.
    (dbAdmin.select as jest.Mock).mockReturnValueOnce(
      lookupReturning([{ restaurantId: "R2" }]),
    );

    const r = await rollbackMigrationImport({
      migrationImportId: "imp-belongs-to-r2",
      restaurantId: "R1",
      organizationId: "org-1",
    });

    expect(r.ok).toBe(false);
    expect(dbAdmin.delete).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("refuses when the import id does not exist", async () => {
    (dbAdmin.select as jest.Mock).mockReturnValueOnce(lookupReturning([]));
    const r = await rollbackMigrationImport({
      migrationImportId: "nope",
      restaurantId: "R1",
      organizationId: "org-1",
    });
    expect(r.ok).toBe(false);
    expect(dbAdmin.delete).not.toHaveBeenCalled();
  });

  it("refuses when caller is not authorized for the restaurant", async () => {
    (can as jest.Mock).mockResolvedValue(false);
    const r = await rollbackMigrationImport({
      migrationImportId: "imp-1",
      restaurantId: "R1",
      organizationId: "org-1",
    });
    expect(r.ok).toBe(false);
    expect(dbAdmin.delete).not.toHaveBeenCalled();
  });

  it("rolls back when the import belongs to the gated restaurant", async () => {
    // Lookup: import belongs to R1 (matches gated restaurant).
    (dbAdmin.select as jest.Mock).mockReturnValueOnce(
      lookupReturning([{ restaurantId: "R1" }]),
    );
    // DELETE reservations ... RETURNING dinerId (none → no diner cleanup loop).
    const deleteReservationsReturning = jest
      .fn()
      .mockResolvedValue([{ dinerId: null }]);
    (dbAdmin.delete as jest.Mock).mockReturnValue({
      where: jest
        .fn()
        .mockReturnValue({ returning: deleteReservationsReturning }),
    });
    (dbAdmin.update as jest.Mock).mockReturnValue({
      set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
    });

    const r = await rollbackMigrationImport({
      migrationImportId: "imp-1",
      restaurantId: "R1",
      organizationId: "org-1",
    });

    expect(r.ok).toBe(true);
    expect(r.reservationsDeleted).toBe(1);
    expect(dbAdmin.delete).toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalled();
  });
});
