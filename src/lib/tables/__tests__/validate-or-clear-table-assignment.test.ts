/**
 * @jest-environment node
 *
 * §08 §4.7 — the table/reservation invariant helper. Verifies it frees the
 * held table, clears the reservation's refs, and audits — and is a no-op when
 * the reservation holds no table.
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/audit/record", () => ({ recordAudit: jest.fn() }));

import { makeValidateOrClearTableAssignment } from "../validate-or-clear-table-assignment";

function makeDeps(reservation: Record<string, unknown> | null) {
  const stmts: string[] = [];
  const tx = {
    execute: jest.fn(async (q: unknown) => {
      const t = JSON.stringify(q);
      if (t.includes("FROM reservations WHERE id")) return reservation ? [reservation] : [];
      if (t.includes("table_ids FROM table_combinations")) return [{ table_ids: ["t1", "t2"] }];
      stmts.push(t);
      return [];
    }),
  };
  const db = { transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)) };
  const recordAudit = jest.fn(async () => {});
  return { db, recordAudit, stmts };
}

describe("validateOrClearTableAssignment", () => {
  it("frees a single-table assignment, clears the reservation, audits", async () => {
    const d = makeDeps({ id: "res-1", restaurant_id: "rest-1", table_id: "t1", combination_id: null });
    const res = await makeValidateOrClearTableAssignment(d as never)("res-1", "no_show");
    expect(res.cleared).toBe(true);
    const all = d.stmts.join(" | ");
    expect(all).toContain("INSERT INTO table_status_log");
    expect(all).toContain("UPDATE restaurant_tables SET status = 'free'");
    expect(all).toContain("table_id = NULL");
    expect(d.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "reservation.table_auto_cleared", context: expect.objectContaining({ prior_table_id: "t1", reason: "no_show" }) }),
    );
  });

  it("is a no-op (no audit) when the reservation holds no table", async () => {
    const d = makeDeps({ id: "res-1", restaurant_id: "rest-1", table_id: null, combination_id: null });
    const res = await makeValidateOrClearTableAssignment(d as never)("res-1", "cancelled");
    expect(res.cleared).toBe(false);
    expect(d.recordAudit).not.toHaveBeenCalled();
  });
});
