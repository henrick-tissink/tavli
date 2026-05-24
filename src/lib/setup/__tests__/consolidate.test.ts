/**
 * @jest-environment node
 */
import { makeConsolidateParallelRun } from "@/lib/setup/consolidate";

describe("makeConsolidateParallelRun", () => {
  test("marks parallel_run completed + audits", async () => {
    const db = { execute: jest.fn(async () => [{ id: "sp1", started_at: null }]) };
    const recordAudit = jest.fn(async (_i: { action: string }) => {});
    const r = await makeConsolidateParallelRun({ db: db as never, recordAudit: recordAudit as never })({
      restaurantId: "r1", organizationId: "o1", actorUserId: "u1",
    });
    expect(r.ok).toBe(true);
    expect(recordAudit.mock.calls[0][0].action).toBe("setup.parallel_run_consolidated");
  });

  test("idempotent: already completed → no audit", async () => {
    const db = { execute: jest.fn(async () => []) };
    const recordAudit = jest.fn(async () => {});
    await makeConsolidateParallelRun({ db: db as never, recordAudit: recordAudit as never })({
      restaurantId: "r1", organizationId: "o1", actorUserId: "u1",
    });
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
