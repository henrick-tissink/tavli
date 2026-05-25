/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/audit/record", () => ({ recordAudit: jest.fn() }));
jest.mock("@/lib/tables/validate-or-clear-table-assignment", () => ({
  validateOrClearTableAssignment: jest.fn(),
}));

import { makeAutoMarkNoShow } from "../auto-mark-no-show";

const ROW = { id: "res-1", restaurant_id: "rest-1", organization_id: "org-1" };

function makeDeps(claimReturns: unknown[] = [{ id: "res-1" }]) {
  const db = {
    execute: jest.fn(async (q: unknown) => {
      const t = JSON.stringify(q);
      if (t.includes("auto_no_show = true")) return [ROW];
      if (t.includes("status = 'no_show'")) return claimReturns;
      return [];
    }),
  };
  const clearTableAssignment = jest.fn(async () => ({ cleared: true }));
  const recordAudit = jest.fn(async () => {});
  return { db, clearTableAssignment, recordAudit };
}

describe("makeAutoMarkNoShow", () => {
  it("marks a stale confirmed reservation no_show, frees the table, audits", async () => {
    const d = makeDeps();
    const res = await makeAutoMarkNoShow(d as never)();
    expect(res.marked).toBe(1);
    expect(d.clearTableAssignment).toHaveBeenCalledWith("res-1", "no_show");
    expect(d.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "reservation.no_show", context: expect.objectContaining({ auto: true }) }),
    );
  });

  it("skips (no clear, no audit) when the claim is lost", async () => {
    const d = makeDeps([]);
    const res = await makeAutoMarkNoShow(d as never)();
    expect(res.marked).toBe(0);
    expect(d.clearTableAssignment).not.toHaveBeenCalled();
    expect(d.recordAudit).not.toHaveBeenCalled();
  });
});
