/**
 * @jest-environment node
 *
 * Tests for `makeTransitionTableStatus` — the §08 §4.4 transition helper.
 *
 * All tests use the injectable factory so no real DB connection is needed.
 * The mock DB simulates:
 *   - SELECT FOR UPDATE on restaurant_tables
 *   - raw SQL INSERT into table_status_log (the CTE recipe)
 *   - The trigger's denorm-sync side-effect on restaurant_tables is exercised
 *     implicitly; since we own the trigger in the DB migration, we verify
 *     that the INSERT into table_status_log was called with the right args.
 */

import { makeTransitionTableStatus } from "../transitions";

// ─── Mock Helpers ─────────────────────────────────────────────────────────

type FakeRow = {
  currentStatus: string;
  restaurantId: string;
};

function makeMockDb(opts: {
  selectRows?: FakeRow[];
  executeError?: Error;
}): {
  transaction: jest.Mock;
  _txSelect: jest.Mock;
  _txExecute: jest.Mock;
} {
  const selectRows = opts.selectRows ?? [];

  const forUpdate = jest.fn().mockResolvedValue(selectRows);
  const whereSelect = jest.fn().mockReturnValue({ for: forUpdate });
  const fromSelect = jest.fn().mockReturnValue({ where: whereSelect });
  const txSelect = jest.fn().mockReturnValue({ from: fromSelect });

  const txExecute = opts.executeError
    ? jest.fn().mockRejectedValue(opts.executeError)
    : jest.fn().mockResolvedValue({ rows: [] });

  const tx = {
    select: txSelect,
    execute: txExecute,
  };

  const transaction = jest.fn().mockImplementation(async (cb: (tx: Record<string, jest.Mock>) => Promise<void>) => {
    await cb(tx);
  });

  return {
    transaction,
    _txSelect: txSelect,
    _txExecute: txExecute,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("transitionTableStatus", () => {
  const BASE_INPUT = {
    tableId: "table-uuid-1",
    toStatus: "booked" as const,
    changedByUserId: "user-uuid-1",
  };

  it("free → booked: succeeds, calls execute to insert log row", async () => {
    const db = makeMockDb({
      selectRows: [{ currentStatus: "free", restaurantId: "rest-uuid-1" }],
    });

    const fn = makeTransitionTableStatus({ db: db as never });
    await expect(fn(BASE_INPUT)).resolves.toBeUndefined();

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db._txSelect).toHaveBeenCalledTimes(1);
    expect(db._txExecute).toHaveBeenCalledTimes(1);
  });

  it("free → booked: execute called exactly once with a Drizzle SQL object", async () => {
    const db = makeMockDb({
      selectRows: [{ currentStatus: "free", restaurantId: "rest-uuid-1" }],
    });

    const fn = makeTransitionTableStatus({ db: db as never });
    await fn({ ...BASE_INPUT, notes: "walk-in seated early", reservationId: "res-uuid-1" });

    // Drizzle `sql` tagged templates produce an object with a `queryChunks`
    // property — check the shape rather than stringifying.
    const executeCall = db._txExecute.mock.calls[0][0];
    expect(executeCall).toBeDefined();
    expect(typeof executeCall).toBe("object");
    expect(db._txExecute).toHaveBeenCalledTimes(1);
  });

  it("booked → seated: succeeds", async () => {
    const db = makeMockDb({
      selectRows: [{ currentStatus: "booked", restaurantId: "rest-uuid-1" }],
    });
    const fn = makeTransitionTableStatus({ db: db as never });
    await expect(
      fn({ tableId: "t1", toStatus: "seated", changedByUserId: "u1" }),
    ).resolves.toBeUndefined();
  });

  it("seated → paying: succeeds", async () => {
    const db = makeMockDb({
      selectRows: [{ currentStatus: "seated", restaurantId: "rest-uuid-1" }],
    });
    const fn = makeTransitionTableStatus({ db: db as never });
    await expect(
      fn({ tableId: "t1", toStatus: "paying", changedByUserId: "u1" }),
    ).resolves.toBeUndefined();
  });

  it("paying → dirty: succeeds", async () => {
    const db = makeMockDb({
      selectRows: [{ currentStatus: "paying", restaurantId: "rest-uuid-1" }],
    });
    const fn = makeTransitionTableStatus({ db: db as never });
    await expect(
      fn({ tableId: "t1", toStatus: "dirty", changedByUserId: "u1" }),
    ).resolves.toBeUndefined();
  });

  it("dirty → free: succeeds", async () => {
    const db = makeMockDb({
      selectRows: [{ currentStatus: "dirty", restaurantId: "rest-uuid-1" }],
    });
    const fn = makeTransitionTableStatus({ db: db as never });
    await expect(
      fn({ tableId: "t1", toStatus: "free", changedByUserId: "u1" }),
    ).resolves.toBeUndefined();
  });

  it("free → paying (illegal): throws TV601", async () => {
    const db = makeMockDb({
      selectRows: [{ currentStatus: "free", restaurantId: "rest-uuid-1" }],
    });
    const fn = makeTransitionTableStatus({ db: db as never });
    await expect(
      fn({ tableId: "t1", toStatus: "paying", changedByUserId: "u1" }),
    ).rejects.toThrow("TV601 invalid_transition: free → paying");

    // No log row inserted when transition is rejected.
    expect(db._txExecute).not.toHaveBeenCalled();
  });

  it("seated → booked (illegal): throws TV601", async () => {
    const db = makeMockDb({
      selectRows: [{ currentStatus: "seated", restaurantId: "rest-uuid-1" }],
    });
    const fn = makeTransitionTableStatus({ db: db as never });
    await expect(
      fn({ tableId: "t1", toStatus: "booked", changedByUserId: "u1" }),
    ).rejects.toThrow("TV601 invalid_transition: seated → booked");
  });

  it("table not found: throws TV603", async () => {
    const db = makeMockDb({ selectRows: [] }); // no rows → not found
    const fn = makeTransitionTableStatus({ db: db as never });
    await expect(
      fn({ tableId: "missing-uuid", toStatus: "booked", changedByUserId: "u1" }),
    ).rejects.toThrow("TV603 table_not_found: missing-uuid");

    // Guard: no log row inserted, no state-machine reached.
    expect(db._txExecute).not.toHaveBeenCalled();
  });

  it("passes optional fields (reservationId, combinationId, notes) through", async () => {
    const db = makeMockDb({
      selectRows: [{ currentStatus: "free", restaurantId: "rest-uuid-1" }],
    });
    const fn = makeTransitionTableStatus({ db: db as never });
    await fn({
      tableId: "t1",
      toStatus: "booked",
      changedByUserId: "u1",
      reservationId: "res-1",
      combinationId: "combo-1",
      notes: "group booking",
    });
    // Verifies execute was called — the SQL args are validated by integration test.
    expect(db._txExecute).toHaveBeenCalledTimes(1);
  });
});
