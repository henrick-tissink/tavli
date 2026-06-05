/**
 * @jest-environment node
 *
 * Drives commitFloorBooking against a faked drizzle transaction to prove the
 * persistence orchestration: the advisory lock is taken, sibling reshuffles are
 * applied clear-then-set (so the exclusion trigger never sees a transient
 * clash), the reservation is inserted, and a combination row is created + linked
 * for big parties. planFromState is stubbed — the planner has its own coverage
 * (plan.test.ts); here we test the write path the planner feeds.
 */

jest.mock("server-only", () => ({}));

import { planFromState, type TablePlan } from "../assign-table";

jest.mock("../assign-table", () => ({
  planFromState: jest.fn(),
}));

// A faked transaction recording every write. select() returns empty result sets
// (planFromState is stubbed, so the loaded floor content is irrelevant).
function makeTx() {
  const updates: Array<{ set: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  const selectChain = {
    from: () => selectChain,
    where: () => Promise.resolve([] as unknown[]),
  };
  let insertReturn: Array<{ id: string }> = [{ id: "new-res" }];
  const tx = {
    execute: jest.fn().mockResolvedValue(undefined),
    select: jest.fn(() => selectChain),
    update: jest.fn((_table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: (_w: unknown) => {
          updates.push({ set });
          return Promise.resolve(undefined);
        },
      }),
    })),
    insert: jest.fn((table: { [k: string]: unknown }) => ({
      values: (values: Record<string, unknown>) => ({
        returning: () => {
          // table object stringifies opaquely; tag inserts by a known column.
          const name = "guestName" in values ? "reservations" : "table_combinations";
          inserts.push({ table: name, values });
          return Promise.resolve(name === "reservations" ? insertReturn : [{ id: "combo-1" }]);
        },
      }),
    })),
  };
  return {
    tx,
    updates,
    inserts,
    setInsertReturn: (r: Array<{ id: string }>) => (insertReturn = r),
  };
}

const harness = makeTx();

jest.mock("@/lib/db/admin", () => ({
  dbAdmin: {
    transaction: (cb: (tx: unknown) => Promise<unknown>) => cb(harness.tx),
  },
}));

import { commitFloorBooking } from "../booking-commit";

const BASE = {
  restaurantId: "rest-1",
  date: "2026-08-01",
  time: "19:00",
  partySize: 4,
  guestName: "Reshuffle Test",
  guestPhone: "+40712345678",
  guestEmail: null,
  zone: null,
  notes: null,
  confirmationToken: "tok-1",
  locale: "ro" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  harness.updates.length = 0;
  harness.inserts.length = 0;
  harness.setInsertReturn([{ id: "new-res" }]);
});

test("takes the advisory lock before planning", async () => {
  (planFromState as jest.Mock).mockReturnValue({
    ok: true,
    kind: "single",
    tableId: "t1",
    siblingMoves: [],
  } satisfies TablePlan);

  await commitFloorBooking(BASE);
  expect(harness.tx.execute).toHaveBeenCalledTimes(1);
  const arg = harness.tx.execute.mock.calls[0][0];
  expect(JSON.stringify(arg)).toContain("pg_advisory_xact_lock");
});

test("applies sibling reshuffles clear-then-set, then inserts the booking", async () => {
  (planFromState as jest.Mock).mockReturnValue({
    ok: true,
    kind: "single",
    tableId: "t4",
    siblingMoves: [{ id: "sib", tableId: "t2" }],
  } satisfies TablePlan);

  const result = await commitFloorBooking(BASE);
  expect(result).toEqual({ ok: true, reservationId: "new-res" });

  // Clear (table_id → null) MUST precede the set (table_id → t2).
  expect(harness.updates).toEqual([
    { set: { tableId: null } },
    { set: { tableId: "t2" } },
  ]);
  // The new reservation is inserted with its assigned table + auto_assigned.
  const resInsert = harness.inserts.find((i) => i.table === "reservations");
  expect(resInsert?.values).toMatchObject({ tableId: "t4", autoAssigned: true, status: "confirmed" });
  // No combination for a single booking.
  expect(harness.inserts.some((i) => i.table === "table_combinations")).toBe(false);
});

test("creates and links a combination row for a big party", async () => {
  (planFromState as jest.Mock).mockReturnValue({
    ok: true,
    kind: "combination",
    tableIds: ["t8a", "t8b"],
    combinedCapacity: 16,
    siblingMoves: [],
  } satisfies TablePlan);

  const result = await commitFloorBooking({ ...BASE, partySize: 14 });
  expect(result).toEqual({ ok: true, reservationId: "new-res" });

  const comboInsert = harness.inserts.find((i) => i.table === "table_combinations");
  expect(comboInsert?.values).toMatchObject({
    tableIds: ["t8a", "t8b"],
    primaryTableId: "t8a",
    combinedCapacity: 16,
    reservationId: "new-res",
  });
  // The reservation row is back-linked to the combination.
  expect(harness.updates).toContainEqual({ set: { combinationId: "combo-1" } });
});

test("maps a too-large party to party_too_large", async () => {
  (planFromState as jest.Mock).mockReturnValue({
    ok: false,
    reason: "party_too_large",
    maxParty: 22,
  } satisfies TablePlan);

  const result = await commitFloorBooking({ ...BASE, partySize: 40 });
  expect(result).toEqual({ ok: false, reason: "party_too_large", maxParty: 22 });
  expect(harness.inserts).toHaveLength(0);
});

test("maps a trigger SLOT_FULL rejection (TV003) to no_table", async () => {
  (planFromState as jest.Mock).mockReturnValue({
    ok: true,
    kind: "single",
    tableId: "t4",
    siblingMoves: [],
  } satisfies TablePlan);
  // Simulate the exclusion trigger firing on insert.
  harness.tx.insert.mockImplementationOnce(() => ({
    values: () => ({
      returning: () => Promise.reject(Object.assign(new Error("Table already booked"), { code: "TV003" })),
    }),
  }));

  const result = await commitFloorBooking(BASE);
  expect(result).toEqual({ ok: false, reason: "no_table" });
});
