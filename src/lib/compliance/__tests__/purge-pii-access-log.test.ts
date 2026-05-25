/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({
  dinerPiiAccessLog: {
    accessedAt: "accessed_at",
    id: "id",
  },
}));
jest.mock("drizzle-orm", () => ({
  lt: jest.fn((col: unknown, val: unknown) => ({ col, val, op: "lt" })),
}));

import {
  makePurgePiiAccessLog,
  PII_ACCESS_LOG_RETENTION_MONTHS,
} from "../purge-pii-access-log";

const FIXED_NOW = new Date("2026-05-25T06:00:00.000Z");

function makeDb(deletedRows: Array<{ id: string }>) {
  const where = jest.fn().mockReturnValue({
    returning: jest.fn().mockResolvedValue(deletedRows),
  });
  return {
    db: { delete: jest.fn().mockReturnValue({ where }) },
    where,
  };
}

describe("makePurgePiiAccessLog", () => {
  it("retains 24 months", () => {
    expect(PII_ACCESS_LOG_RETENTION_MONTHS).toBe(24);
  });

  it("returns the count of purged rows", async () => {
    const { db } = makeDb([{ id: "a" }, { id: "b" }]);
    const purge = makePurgePiiAccessLog({ db: db as never, now: () => FIXED_NOW });
    expect(await purge()).toBe(2);
    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  it("returns 0 when nothing is stale", async () => {
    const { db } = makeDb([]);
    const purge = makePurgePiiAccessLog({ db: db as never, now: () => FIXED_NOW });
    expect(await purge()).toBe(0);
  });

  it("deletes rows older than now minus the retention window", async () => {
    const { lt } = jest.requireMock("drizzle-orm");
    const { dinerPiiAccessLog } = jest.requireMock("@/lib/db/schema");
    const { db } = makeDb([]);
    const purge = makePurgePiiAccessLog({ db: db as never, now: () => FIXED_NOW });
    await purge();
    const expectedCutoff = new Date("2024-05-25T06:00:00.000Z"); // 24 months before
    expect(lt).toHaveBeenCalledWith(dinerPiiAccessLog.accessedAt, expectedCutoff);
  });
});
