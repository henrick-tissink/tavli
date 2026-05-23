/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({ rateLimits: { expiresAt: "expires_at" } }));
jest.mock("drizzle-orm", () => ({
  lt: jest.fn((col: unknown, val: unknown) => ({ col, val, op: "lt" })),
}));

import { makePurgeRateLimits } from "../cleanup";

const FIXED_NOW = new Date("2026-05-23T05:00:00.000Z");

function makeDb(deletedRows: Array<{ key: string }>) {
  return {
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(deletedRows),
      }),
    }),
  };
}

describe("makePurgeRateLimits", () => {
  it("returns count of deleted rows when some are expired", async () => {
    const db = makeDb([{ key: "ip:1.2.3.4" }, { key: "user:abc" }]);
    const purge = makePurgeRateLimits({ db: db as any, now: () => FIXED_NOW });

    const count = await purge();

    expect(count).toBe(2);
    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  it("returns 0 when no rows are expired", async () => {
    const db = makeDb([]);
    const purge = makePurgeRateLimits({ db: db as any, now: () => FIXED_NOW });

    const count = await purge();

    expect(count).toBe(0);
  });

  it("calls lt() with rateLimits.expiresAt and the current time", async () => {
    const { lt } = jest.requireMock("drizzle-orm");
    const { rateLimits } = jest.requireMock("@/lib/db/schema");

    const db = makeDb([]);
    const purge = makePurgeRateLimits({ db: db as any, now: () => FIXED_NOW });
    await purge();

    expect(lt).toHaveBeenCalledWith(rateLimits.expiresAt, FIXED_NOW);
  });

  it("does not delete unexpired rows (mock confirms delete is called with lt predicate)", async () => {
    const { lt } = jest.requireMock("drizzle-orm");
    (lt as jest.Mock).mockClear();

    // Only 1 of 3 hypothetical rows is expired — the mock returns only the deleted ones
    const db = makeDb([{ key: "ip:expired" }]);
    const purge = makePurgeRateLimits({ db: db as any, now: () => FIXED_NOW });
    const count = await purge();

    // The DB layer handles the predicate; we verify our code hands it the right filter
    expect(count).toBe(1);
    expect(lt).toHaveBeenCalledWith(expect.anything(), FIXED_NOW);
  });

  it("passes the now() result through fresh each invocation", async () => {
    let callCount = 0;
    const times = [
      new Date("2026-05-23T05:00:00.000Z"),
      new Date("2026-05-23T05:01:00.000Z"),
    ];
    const db = makeDb([]);
    const purge = makePurgeRateLimits({
      db: db as any,
      now: () => times[callCount++] ?? FIXED_NOW,
    });

    await purge();
    await purge();

    const { lt } = jest.requireMock("drizzle-orm");
    const calls = (lt as jest.Mock).mock.calls;
    expect(calls[calls.length - 2][1]).toEqual(times[0]);
    expect(calls[calls.length - 1][1]).toEqual(times[1]);
  });
});
