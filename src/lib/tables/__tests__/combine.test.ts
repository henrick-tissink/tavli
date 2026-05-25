/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({
  restaurantTables: { id: "t.id", currentStatus: "t.status", capacityMax: "t.cap", restaurantId: "t.rid", archivedAt: "t.arch" },
  tableCombinations: { id: "c.id", restaurantId: "c.rid", tableIds: "c.tids", dissolvedAt: "c.diss" },
}));
jest.mock("drizzle-orm", () => ({
  and: jest.fn((...a) => ({ and: a })),
  eq: jest.fn((a, b) => ({ eq: [a, b] })),
  inArray: jest.fn((a, b) => ({ inArray: [a, b] })),
  isNull: jest.fn((a) => ({ isNull: a })),
  sql: Object.assign((s: TemplateStringsArray) => ({ sql: s.join("") }), { raw: (t: string) => t }),
}));
jest.mock("../status-log", () => ({ appendStatusLog: jest.fn() }));

import { makeCombineTables, makeDissolveCombination } from "../combine";
import { appendStatusLog } from "../status-log";

beforeEach(() => (appendStatusLog as jest.Mock).mockClear());

function makeTx(opts: { tableRows: unknown[]; comboRows?: unknown[] }) {
  const inserted: Record<string, unknown>[] = [];
  const tx = {
    select: jest.fn(() => ({
      from: jest.fn((t: { id?: string }) => ({
        where: jest.fn(() => ({
          for: jest.fn().mockResolvedValue(t.id === "c.id" ? (opts.comboRows ?? []) : opts.tableRows),
        })),
      })),
    })),
    insert: jest.fn(() => ({
      values: jest.fn((v: Record<string, unknown>) => {
        inserted.push(v);
        return { returning: jest.fn().mockResolvedValue([{ id: "combo-1" }]) };
      }),
    })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })) })),
  };
  const db = { transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)) };
  return { db, tx, inserted };
}

describe("combineTables", () => {
  it("combines 2 free tables: inserts combination (summed capacity) + logs each → combined", async () => {
    const { db, inserted } = makeTx({
      tableRows: [
        { id: "t1", currentStatus: "free", capacityMax: 4, restaurantId: "r1", archivedAt: null },
        { id: "t2", currentStatus: "free", capacityMax: 2, restaurantId: "r1", archivedAt: null },
      ],
    });
    const res = await makeCombineTables({ db } as never)({
      restaurantId: "r1",
      tableIds: ["t1", "t2"],
      changedByUserId: "u1",
    });
    expect(res).toEqual({ combinationId: "combo-1" });
    expect(inserted[0]).toMatchObject({ combinedCapacity: 6, primaryTableId: "t1", status: "seated" });
    expect(appendStatusLog).toHaveBeenCalledTimes(2);
    expect((appendStatusLog as jest.Mock).mock.calls[0][1]).toMatchObject({ toStatus: "combined", combinationId: "combo-1" });
  });

  it("rejects fewer than two distinct tables", async () => {
    const { db } = makeTx({ tableRows: [] });
    await expect(
      makeCombineTables({ db } as never)({ restaurantId: "r1", tableIds: ["t1", "t1"], changedByUserId: "u1" }),
    ).rejects.toThrow(/combine_minimum_two/);
  });

  it("rejects when a table is not free", async () => {
    const { db } = makeTx({
      tableRows: [
        { id: "t1", currentStatus: "free", capacityMax: 4, restaurantId: "r1", archivedAt: null },
        { id: "t2", currentStatus: "seated", capacityMax: 2, restaurantId: "r1", archivedAt: null },
      ],
    });
    await expect(
      makeCombineTables({ db } as never)({ restaurantId: "r1", tableIds: ["t1", "t2"], changedByUserId: "u1" }),
    ).rejects.toThrow(/table_not_free/);
  });

  it("rejects a cross-restaurant combine", async () => {
    const { db } = makeTx({
      tableRows: [
        { id: "t1", currentStatus: "free", capacityMax: 4, restaurantId: "r1", archivedAt: null },
        { id: "t2", currentStatus: "free", capacityMax: 2, restaurantId: "r2", archivedAt: null },
      ],
    });
    await expect(
      makeCombineTables({ db } as never)({ restaurantId: "r1", tableIds: ["t1", "t2"], changedByUserId: "u1" }),
    ).rejects.toThrow(/cross_restaurant/);
  });
});

describe("dissolveCombination", () => {
  it("dissolves + flips combined members back to free", async () => {
    const { db } = makeTx({
      comboRows: [{ id: "combo-1", restaurantId: "r1", tableIds: ["t1", "t2"] }],
      tableRows: [
        { id: "t1", currentStatus: "combined" },
        { id: "t2", currentStatus: "combined" },
      ],
    });
    await makeDissolveCombination({ db } as never)({
      combinationId: "combo-1",
      restaurantId: "r1",
      changedByUserId: "u1",
    });
    expect(appendStatusLog).toHaveBeenCalledTimes(2);
    expect((appendStatusLog as jest.Mock).mock.calls[0][1]).toMatchObject({ fromStatus: "combined", toStatus: "free" });
  });

  it("rejects an unknown/dissolved combination", async () => {
    const { db } = makeTx({ comboRows: [], tableRows: [] });
    await expect(
      makeDissolveCombination({ db } as never)({ combinationId: "x", restaurantId: "r1", changedByUserId: "u1" }),
    ).rejects.toThrow(/combination_not_found/);
  });
});
