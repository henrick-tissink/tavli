/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/audit/record", () => ({ recordAudit: jest.fn() }));
jest.mock("@/lib/db/schema", () => ({ organizations: {}, restaurants: {} }));
jest.mock("drizzle-orm", () => ({
  eq: jest.fn(),
  and: jest.fn(),
  isNull: jest.fn(),
  count: jest.fn(),
}));

import { makeReconcileVenueCount } from "../reconcile";

describe("reconcileVenueCount", () => {
  it("self-heals + audits when the cached counter drifts", async () => {
    const orgs = [{ id: "org-1", currentVenueCount: 5 }];
    const db: any = {
      select: jest
        .fn()
        // 1st call: org list (select(...).from(...) resolves to the org list)
        .mockImplementationOnce(() => ({ from: jest.fn().mockResolvedValue(orgs) }))
        // 2nd call: per-org live count
        .mockImplementationOnce(() => ({
          from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([{ actual: 3 }]) }),
        })),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
      }),
    };
    const recordAudit = jest.fn().mockResolvedValue(undefined);
    const reconcile = makeReconcileVenueCount({ db, recordAudit });
    await reconcile();

    expect(db.update).toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ event: "counter_reconciled", from: 5, to: 3 }),
      }),
    );
  });

  it("does nothing when the counter already matches", async () => {
    const orgs = [{ id: "org-1", currentVenueCount: 2 }];
    const db: any = {
      select: jest
        .fn()
        .mockImplementationOnce(() => ({ from: jest.fn().mockResolvedValue(orgs) }))
        .mockImplementationOnce(() => ({
          from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([{ actual: 2 }]) }),
        })),
      update: jest.fn(),
    };
    const recordAudit = jest.fn();
    const reconcile = makeReconcileVenueCount({ db, recordAudit });
    await reconcile();

    expect(db.update).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
