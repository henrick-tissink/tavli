/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({
  cookieConsents: {
    expiresAt: "expires_at",
    id: "id",
  },
}));
jest.mock("drizzle-orm", () => ({
  lt: jest.fn((col: unknown, val: unknown) => ({ col, val, op: "lt" })),
}));

import { makePurgeCookieConsents } from "../cleanup";

const FIXED_NOW = new Date("2026-05-23T05:30:00.000Z");

function makeDb(deletedRows: Array<{ id: string }>) {
  return {
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(deletedRows),
      }),
    }),
  };
}

describe("makePurgeCookieConsents", () => {
  it("returns count of expired rows deleted", async () => {
    const db = makeDb([{ id: "row-1" }, { id: "row-2" }, { id: "row-3" }]);
    const purge = makePurgeCookieConsents({ db: db as any, now: () => FIXED_NOW });

    const count = await purge();

    expect(count).toBe(3);
    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  it("returns 0 when no rows are expired", async () => {
    const db = makeDb([]);
    const purge = makePurgeCookieConsents({ db: db as any, now: () => FIXED_NOW });

    const count = await purge();

    expect(count).toBe(0);
  });

  it("calls lt() with cookieConsents.expiresAt and the current time", async () => {
    const { lt } = jest.requireMock("drizzle-orm");
    const { cookieConsents } = jest.requireMock("@/lib/db/schema");

    const db = makeDb([]);
    const purge = makePurgeCookieConsents({ db: db as any, now: () => FIXED_NOW });
    await purge();

    expect(lt).toHaveBeenCalledWith(cookieConsents.expiresAt, FIXED_NOW);
  });

  it("does not delete unexpired rows (mock confirms lt predicate is used)", async () => {
    const { lt } = jest.requireMock("drizzle-orm");
    (lt as jest.Mock).mockClear();

    const db = makeDb([{ id: "expired-row" }]);
    const purge = makePurgeCookieConsents({ db: db as any, now: () => FIXED_NOW });
    const count = await purge();

    expect(count).toBe(1);
    expect(lt).toHaveBeenCalledWith(expect.anything(), FIXED_NOW);
  });

  it("passes a fresh now() on each invocation", async () => {
    let callCount = 0;
    const times = [
      new Date("2026-05-23T05:30:00.000Z"),
      new Date("2026-05-23T05:31:00.000Z"),
    ];
    const db = makeDb([]);
    const purge = makePurgeCookieConsents({
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
